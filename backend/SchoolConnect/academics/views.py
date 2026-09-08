from django.db import transaction
from django.utils.text import slugify
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from schools.search import filter_search

from . import services
from .models import AnneeScolaire, Classe, CustomFieldDefinition, Eleve, Inscription
from .serializers import (
    AnneeScolaireSerializer,
    ClasseSerializer,
    CustomFieldDefinitionSerializer,
    EleveSerializer,
)


class SchoolScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    school_field = 'school'

    def scope_to_school(self, qs):
        user = self.request.user
        if user.is_superuser:
            return qs
        return qs.filter(**{self.school_field: user.school_id})

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            serializer.save()
        else:
            serializer.save(school_id=user.school_id)

    def get_annee(self):
        """Année consultée : `?annee=<id>`, à défaut l'année courante de l'école.

        None pour un superuser sans école rattachée — il voit alors toutes les années,
        le cloisonnement par année n'ayant de sens qu'à l'intérieur d'une école.
        """
        user = self.request.user
        if not user.school_id:
            return None
        return services.resolve_annee(user.school, self.request.query_params.get('annee'))

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'annee': self.get_annee()}


class AnneeScolaireViewSet(SchoolScopedViewSet):
    serializer_class = AnneeScolaireSerializer

    def get_queryset(self):
        return self.scope_to_school(AnneeScolaire.objects.select_related('school'))

    def perform_create(self, serializer):
        """Première année créée pour une école : elle devient courante d'office, sans quoi
        l'école n'aurait aucune année active et toutes ses listes resteraient vides."""
        super().perform_create(serializer)
        annee = serializer.instance
        if not AnneeScolaire.objects.filter(school_id=annee.school_id, is_current=True).exists():
            services.definir_annee_courante(annee)

    @action(detail=True, methods=['post'], url_path='definir-courante')
    def definir_courante(self, request, pk=None):
        annee = services.definir_annee_courante(self.get_object())
        return Response(self.get_serializer(annee).data)

    @action(detail=True, methods=['post'])
    def promouvoir(self, request, pk=None):
        """Passage en classe supérieure vers l'année cible, d'après une correspondance
        classe→classe validée côté frontend."""
        annee_source = self.get_object()
        annee_cible = self.get_queryset().filter(pk=request.data.get('annee_cible')).first()
        if annee_cible is None:
            return Response(
                {'annee_cible': 'Année cible introuvable.'}, status=status.HTTP_400_BAD_REQUEST,
            )
        if annee_cible.pk == annee_source.pk:
            return Response(
                {'annee_cible': "L'année cible doit différer de l'année source."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mapping = request.data.get('mapping')
        if not isinstance(mapping, dict):
            return Response(
                {'mapping': 'Une correspondance classe source → classe cible est requise.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(services.promouvoir(annee_source, annee_cible, mapping))


class ClasseViewSet(SchoolScopedViewSet):
    serializer_class = ClasseSerializer

    def get_queryset(self):
        qs = Classe.objects.select_related('school', 'annee').order_by('level', 'name')
        qs = self.scope_to_school(qs)
        annee = self.get_annee()
        if annee is not None:
            qs = qs.filter(annee=annee)
        return filter_search(
            qs, self.request.query_params.get('search'), ['name', 'level'],
            related_fields=['annee__label'],
        )

    def perform_create(self, serializer):
        """Une classe appartient toujours à une année : à défaut d'`annee` explicite,
        celle qui est consultée."""
        annee = serializer.validated_data.get('annee') or self.get_annee()
        user = self.request.user
        if user.is_superuser and not user.school_id:
            serializer.save(annee=annee)
        else:
            serializer.save(school_id=user.school_id, annee=annee)


class EleveViewSet(SchoolScopedViewSet):
    serializer_class = EleveSerializer

    def get_queryset(self):
        qs = (
            Eleve.objects.select_related('school', 'classe')
            .prefetch_related('studentguardian_set__parent', 'inscriptions__annee', 'inscriptions__classe')
            .order_by('last_name', 'first_name')
        )
        qs = self.scope_to_school(qs)
        classe_id = self.request.query_params.get('classe')
        sans_classe = classe_id == 'sans-classe'

        # Cloisonnement par année : seuls les élèves réellement inscrits sur l'année
        # consultée, via les inscriptions — le cache `classe` ne décrit que l'année courante.
        annee = self.get_annee()
        if annee is not None:
            if sans_classe:
                # `Inscription.classe` n'est jamais nul : « sans classe » sur une année
                # donnée veut donc dire aucune inscription du tout pour cette année,
                # pas une inscription avec classe vide.
                qs = qs.exclude(inscriptions__annee=annee)
            else:
                # Année et classe dans un même `filter()` : deux appels successifs sur une
                # relation multivaluée produiraient deux jointures, donc deux inscriptions
                # différentes pouvant satisfaire chacune une moitié du critère.
                criteres = {'inscriptions__annee': annee, 'inscriptions__statut': Inscription.Statut.INSCRIT}
                if classe_id:
                    criteres['inscriptions__classe_id'] = classe_id
                qs = qs.filter(**criteres).distinct()
        elif sans_classe:
            qs = qs.filter(classe__isnull=True)
        elif classe_id:
            qs = qs.filter(classe_id=classe_id)

        return filter_search(
            qs, self.request.query_params.get('search'), ['first_name', 'last_name', 'matricule'],
        )

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids:
            return Response({'ids': 'Une liste d\'identifiants est requise.'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = self.get_queryset().filter(id__in=ids).delete()
        return Response({'deleted': deleted})

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update(self, request):
        updates = request.data.get('updates')
        if not isinstance(updates, list) or not updates:
            return Response({'updates': 'Une liste de modifications est requise.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset()
        results = []
        errors = {}
        with transaction.atomic():
            for entry in updates:
                eleve_id = entry.get('id')
                instance = qs.filter(id=eleve_id).first()
                if instance is None:
                    errors[eleve_id] = ['Élève introuvable.']
                    continue
                serializer = self.get_serializer(instance, data=entry, partial=True)
                if not serializer.is_valid():
                    errors[eleve_id] = serializer.errors
                    continue
                serializer.save()
                results.append(serializer.data)

        if errors:
            return Response({'updated': results, 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'updated': results})


class CustomFieldDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = CustomFieldDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = CustomFieldDefinition.objects.all()
        if user.is_superuser:
            return qs
        return qs.filter(school_id=user.school_id)

    def create(self, request, *args, **kwargs):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'name': 'Nom requis.'}, status=status.HTTP_400_BAD_REQUEST)
        slug = slugify(name)
        obj, created = CustomFieldDefinition.objects.get_or_create(
            school_id=request.user.school_id,
            slug=slug,
            defaults={'name': name},
        )
        serializer = self.get_serializer(obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
