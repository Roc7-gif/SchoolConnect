from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from academics.services import get_current_year

from .models import Message, MessageRecipient, MessageTemplate
from .serializers import MessageSerializer, MessageTemplateSerializer
from .services import COST_PER_CHANNEL, preview_message, resend_message
from .tasks import send_message_task
from .variables import available_variables


class _PreviewRollback(Exception):
    """Sort de la transaction d'aperçu sans rien laisser en base."""


class MessageTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = MessageTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MessageTemplate.objects.all()
        if user.is_superuser:
            return qs
        return qs.filter(school_id=user.school_id)

    def perform_create(self, serializer):
        serializer.save(school_id=self.request.user.school_id)


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Message.objects.select_related(
            'template', 'scope_classe', 'created_by', 'retry_of', 'annee',
        ).prefetch_related(
            'recipients__eleve__classe', 'recipients__eleve__inscriptions__classe',
            'recipients__parent', 'retries',
        )
        if user.is_superuser:
            return qs
        return qs.filter(school_id=user.school_id)

    def _annee(self, serializer):
        """Année ciblée par l'envoi : celle du payload, sinon l'année courante de l'école.

        Sans elle, `resolve_eleves` retomberait sur le ciblage non scopé et le message
        partirait aussi aux familles des anciens élèves.
        """
        annee = serializer.validated_data.get('annee')
        if annee is not None:
            return annee
        return get_current_year(self.request.user.school) if self.request.user.school_id else None

    def perform_create(self, serializer):
        message = serializer.save(
            school_id=self.request.user.school_id,
            annee=self._annee(serializer),
            created_by=self.request.user,
        )
        send_message_task.delay(message.id)

    @action(detail=False, methods=['get'])
    def variables(self, request):
        """Variables utilisables dans un corps de message. Dépend de l'école : les champs
        personnalisés créés à l'import en font partie."""
        return Response(available_variables(request.user.school))

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Ce que donnerait l'envoi, avant de le lancer : destinataires, coût, canaux,
        répartition par classe et élèves injoignables."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # On enregistre puis on annule : `scope_eleves` est un M2M, il faut une clé
        # primaire pour le résoudre. C'est le prix à payer pour que l'aperçu emprunte
        # le vrai chemin d'envoi plutôt qu'une logique parallèle qui divergerait.
        summary = None
        try:
            with transaction.atomic():
                message = serializer.save(
                    school_id=request.user.school_id,
                    annee=self._annee(serializer),
                    created_by=request.user,
                )
                summary = preview_message(message)
                raise _PreviewRollback
        except _PreviewRollback:
            pass
        return Response(summary)

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        message = self.get_object()
        retry = resend_message(message, created_by=request.user)
        if retry is None:
            return Response({'detail': 'Aucun destinataire encore injoignable.'}, status=400)
        send_message_task.delay(retry.id)
        return Response(self.get_serializer(retry).data, status=201)


MOIS_HISTORIQUE = 12
DERNIERS_MESSAGES = 30


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def billing_summary_view(request):
    """Relevé de consommation de l'école : ce qui a été effectivement envoyé et facturé.

    Les totaux sont calculés sur les `MessageRecipient` réellement envoyés, et non sur
    `Message.cost` : un destinataire injoignable ne coûte rien, et seul le canal qui a
    abouti est facturé (cf. la cascade dans services.py).
    """
    user = request.user
    envoyes = MessageRecipient.objects.filter(status=MessageRecipient.Status.ENVOYE)
    if not user.is_superuser:
        envoyes = envoyes.filter(message__school_id=user.school_id)

    par_mois = list(
        envoyes
        .annotate(mois=TruncMonth('sent_at'))
        .values('mois')
        .annotate(count=Count('id'), cost=Sum('cost'))
        .order_by('-mois')[:MOIS_HISTORIQUE]
    )

    debut_mois = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    du_mois = envoyes.filter(sent_at__gte=debut_mois)
    par_canal = (
        du_mois.values('channel_used')
        .annotate(count=Count('id'), cost=Sum('cost'))
        .order_by('channel_used')
    )
    totaux_mois = du_mois.aggregate(count=Count('id'), cost=Sum('cost'))

    messages = Message.objects.filter(sent_at__isnull=False)
    if not user.is_superuser:
        messages = messages.filter(school_id=user.school_id)
    messages = messages.select_related('annee').order_by('-sent_at')[:DERNIERS_MESSAGES]

    return Response({
        'current_month': {
            'label': debut_mois.strftime('%Y-%m'),
            'messages_count': totaux_mois['count'] or 0,
            'cost': totaux_mois['cost'] or 0,
            'by_channel': [
                {'channel': c['channel_used'], 'count': c['count'], 'cost': c['cost'] or 0}
                for c in par_canal
            ],
        },
        'months': [
            {
                'month': m['mois'].strftime('%Y-%m') if m['mois'] else '',
                'messages_count': m['count'],
                'cost': m['cost'] or 0,
            }
            for m in par_mois
        ],
        'recent_messages': [
            {
                'id': m.id,
                'sent_at': m.sent_at,
                'scope_type': m.scope_type,
                'channel': m.channel,
                'annee_label': m.annee.label if m.annee_id else None,
                'recipient_count': m.recipient_count,
                'cost': m.cost,
                'status': m.status,
            }
            for m in messages
        ],
        # Prix unitaires appliqués, pour que l'école puisse recalculer sa facture.
        'tarifs': [{'channel': c, 'cost': v} for c, v in sorted(COST_PER_CHANNEL.items())],
    })
