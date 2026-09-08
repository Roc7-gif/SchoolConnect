import logging
from collections import Counter
from decimal import Decimal

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from academics.models import Eleve, Inscription

from . import variables
from .models import Message, MessageRecipient
from .sms_provider import get_sms_provider

logger = logging.getLogger(__name__)

COST_PER_CHANNEL = {
    'SMS': Decimal('25'),
    'WHATSAPP': Decimal('15'),
    'EMAIL': Decimal('0'),
}

NO_CONTACT_ERROR = 'Aucune coordonnée pour ce canal'
NO_GATEWAY_ERROR = 'Aucune passerelle {channel} configurée'
QUOTA_EXCEEDED_ERROR = 'Quota {channel} du mois atteint'

# Champ de School portant le plafond mensuel de chaque canal. Vide (None) = illimité.
CHANNEL_LIMIT_FIELDS = {
    Message.Channel.SMS: 'sms_monthly_limit',
    Message.Channel.WHATSAPP: 'whatsapp_monthly_limit',
    Message.Channel.EMAIL: 'email_monthly_limit',
}


def quota_period_start(school):
    """Début de la fenêtre comptée pour les plafonds d'envoi : le mois calendaire en
    cours, sauf si l'admin a réinitialisé les compteurs plus récemment — auquel cas la
    fenêtre repart de cette réinitialisation plutôt que du 1er du mois."""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if school.quota_reset_at and school.quota_reset_at > month_start:
        return school.quota_reset_at
    return month_start


def channel_usage(school, channel):
    """Nombre de messages déjà délivrés sur ce canal depuis le début de la fenêtre en
    cours (voir `quota_period_start`) — la même source que le relevé de facturation :
    des `MessageRecipient` en statut ENVOYE, pas un compteur séparé qui pourrait dériver."""
    return MessageRecipient.objects.filter(
        message__school_id=school.pk,
        channel_used=channel,
        status=MessageRecipient.Status.ENVOYE,
        sent_at__gte=quota_period_start(school),
    ).count()


class _QuotaTracker:
    """Suit, pour la durée d'un seul envoi, le nombre de messages encore autorisés par
    canal. Nécessaire en plus de `channel_usage()` : un envoi « école entière » peut
    consommer tout le quota au fil de sa propre boucle, avant qu'aucune ligne ne soit
    enregistrée en base — un simple recomptage à chaque destinataire laisserait dépasser
    le plafond de tout le batch."""

    def __init__(self, school):
        self.school = school
        self._remaining = {}
        if school is None:
            return
        for channel, field in CHANNEL_LIMIT_FIELDS.items():
            limit = getattr(school, field, None)
            self._remaining[channel] = None if limit is None else max(limit - channel_usage(school, channel), 0)

    def has_room(self, channel):
        remaining = self._remaining.get(channel)
        return remaining is None or remaining > 0

    def consume(self, channel):
        remaining = self._remaining.get(channel)
        if remaining is not None:
            self._remaining[channel] = remaining - 1


def resolve_eleves(message):
    """Élèves ciblés par ce message, restreints à l'année scolaire visée.

    Le filtre par année n'est pas cosmétique : sans lui, un envoi « école entière »
    partirait aux familles de tous les élèves jamais enregistrés, y compris ceux partis
    depuis des années — des SMS facturés pour des messages que personne n'attend.
    Le ciblage passe par les inscriptions et non par le cache `Eleve.classe`, seul
    moyen d'obtenir la bonne réponse quand on rejoue un envoi sur une année passée.
    """
    if message.scope_type == Message.ScopeType.INDIVIDUEL:
        return message.scope_eleves.all()

    annee = message.annee
    if annee is None:
        # Message antérieur à la gestion des années : ancien comportement, non scopé.
        if message.scope_type == Message.ScopeType.CLASSE:
            return Eleve.objects.filter(classe=message.scope_classe)
        if message.scope_type == Message.ScopeType.NIVEAU:
            return Eleve.objects.filter(school=message.school, classe__level=message.scope_level)
        return Eleve.objects.filter(school=message.school)

    criteres = {'inscriptions__annee': annee, 'inscriptions__statut': Inscription.Statut.INSCRIT}
    if message.scope_type == Message.ScopeType.CLASSE:
        criteres['inscriptions__classe'] = message.scope_classe
    elif message.scope_type == Message.ScopeType.NIVEAU:
        criteres['inscriptions__classe__level'] = message.scope_level
    return Eleve.objects.filter(school=message.school, **criteres).distinct()


CASCADE_ORDER = [Message.Channel.SMS, Message.Channel.WHATSAPP, Message.Channel.EMAIL]


def _contact_for_channel(parent, channel):
    """Coordonnée utilisable pour ce canal, ou None si le parent n'en a pas."""
    if channel == Message.Channel.EMAIL:
        return parent.email or None
    if channel == Message.Channel.WHATSAPP:
        # whatsapp_number vide signifie "identique au téléphone" (cf. help_text du modèle).
        return parent.whatsapp_number or parent.phone_number or None
    return parent.phone_number or None


def _channel_sequence(message, parent):
    """Canaux à essayer, dans l'ordre, pour ce parent."""
    if message.channel == Message.Channel.CASCADE:
        return [c for c in (message.channel_order or CASCADE_ORDER) if c in COST_PER_CHANNEL]
    if message.channel == Message.Channel.AUTO:
        return [parent.preferred_channel]
    return [message.channel]


def _is_quota_error(error):
    return error.startswith('Quota ') and error.endswith('du mois atteint')


def _failure_reason(attempts):
    """Distingue « on n'avait aucun moyen de le joindre », « le quota de l'école est
    épuisé » et « le fournisseur a refusé »."""
    errors = [a['error'] for a in attempts]
    if all(e == NO_CONTACT_ERROR for e in errors):
        return MessageRecipient.SkipReason.NO_CONTACT
    if all(_is_quota_error(e) for e in errors):
        return MessageRecipient.SkipReason.QUOTA_EXCEEDED
    return MessageRecipient.SkipReason.SEND_FAILED


def _attempt(parent, channel, ok, error):
    return {
        'parent': parent.id,
        'parent_name': str(parent),
        'channel': channel,
        'status': MessageRecipient.Status.ENVOYE if ok else MessageRecipient.Status.ECHEC,
        'error': error,
    }


def is_wired(channel):
    """Ce canal dispose-t-il d'un vrai fournisseur ?

    Seul l'email en a un (Resend). WhatsApp reste simulé : `SIMULATE_UNWIRED_CHANNELS`
    décide s'il réussit (`success`, l'ancien comportement) ou échoue (`fail`, défaut). Le
    SMS délègue à `get_sms_provider()`, qui reproduit aujourd'hui le même booléen le temps
    qu'un vrai fournisseur soit branché. En `fail`, la cascade SMS → WhatsApp → Email
    retombe sur l'email réellement envoyé, ce qui rend le flux testable de bout en bout.
    """
    if channel == Message.Channel.EMAIL:
        return True
    if channel == Message.Channel.SMS:
        return get_sms_provider() is not None
    return getattr(settings, 'SIMULATE_UNWIRED_CHANNELS', 'fail') == 'success'


def _deliver(parent, channel, contact, message, body, subject):
    """Envoi réel sur un canal. Retourne (succès, message d'erreur).

    Point de contact unique avec les fournisseurs : la cascade s'appuie sur ce retour et
    sur les exceptions. Le SMS est isolé dans `sms_provider.py` — brancher un vrai
    fournisseur ne demande de toucher qu'à `get_sms_provider()`.
    """
    if channel == Message.Channel.EMAIL:
        email = EmailMessage(subject=subject, body=body, to=[contact])
        email.send(fail_silently=False)
        return True, ''

    if channel == Message.Channel.SMS:
        provider = get_sms_provider()
        if provider is None:
            return False, NO_GATEWAY_ERROR.format(channel=channel)
        return provider.send(contact, body)

    if not is_wired(channel):
        return False, NO_GATEWAY_ERROR.format(channel=channel)
    return True, ''


def _try_channel(parent, channel, message, dry_run=False, body='', subject='', quota=None):
    """Une tentative sur un canal, isolée : aucune erreur du fournisseur ne doit
    empêcher d'essayer le canal suivant. Retourne (succès, tentative)."""
    contact = _contact_for_channel(parent, channel)
    if not contact:
        return False, _attempt(parent, channel, False, NO_CONTACT_ERROR)
    if quota is not None and not quota.has_room(channel):
        return False, _attempt(parent, channel, False, QUOTA_EXCEEDED_ERROR.format(channel=channel))
    if dry_run:
        # L'aperçu doit prédire l'envoi réel, sinon il annoncerait un coût SMS pour un
        # message qui finira en email gratuit. Il applique donc la même règle de canal
        # câblé — sans jamais contacter de fournisseur.
        if not is_wired(channel):
            return False, _attempt(parent, channel, False, NO_GATEWAY_ERROR.format(channel=channel))
        if quota is not None:
            quota.consume(channel)
        return True, _attempt(parent, channel, True, '')
    try:
        ok, error = _deliver(parent, channel, contact, message, body, subject)
    except Exception as exc:  # noqa: BLE001 — on veut vraiment continuer la cascade
        logger.exception('Envoi %s échoué pour le parent %s', channel, parent.pk)
        return False, _attempt(parent, channel, False, f'{type(exc).__name__}: {exc}')
    if ok and quota is not None:
        quota.consume(channel)
    return ok, _attempt(parent, channel, ok, error)


def _ordered_parents(eleve):
    """Parents de l'élève, contact prioritaire d'abord. Le tri est fait en Python (et
    non en base) pour rester sur les liens déjà préchargés ; il est stable, donc à
    priorité égale l'ordre de la base est conservé."""
    links = sorted(eleve.studentguardian_set.all(), key=lambda sg: not sg.is_primary_contact)
    return [sg.parent for sg in links]


def _deliver_to_parent(message, parent, dry_run=False, body='', subject='', quota=None):
    """Déroule la cascade pour un parent. Retourne (canal retenu ou None, tentatives)."""
    attempts = []
    for channel in _channel_sequence(message, parent):
        ok, attempt = _try_channel(parent, channel, message, dry_run, body, subject, quota)
        attempts.append(attempt)
        if ok:
            return channel, attempts
    return None, attempts


def _build_recipient(message, eleve, parent, channel, attempts, now, body=''):
    if channel is None:
        return MessageRecipient(
            message=message,
            parent=parent,
            eleve=eleve,
            channel_used=attempts[-1]['channel'] if attempts else '',
            rendered_body=body,
            attempts=attempts,
            status=MessageRecipient.Status.ECHEC,
            skip_reason=_failure_reason(attempts),
            cost=0,
            sent_at=now,
        )
    return MessageRecipient(
        message=message,
        parent=parent,
        eleve=eleve,
        channel_used=channel,
        rendered_body=body,
        attempts=attempts,
        status=MessageRecipient.Status.ENVOYE,
        cost=COST_PER_CHANNEL.get(channel, COST_PER_CHANNEL['SMS']),
        sent_at=now,
    )


def is_per_student(body, school):
    """Un message qui ne cite aucune variable propre à l'élève est le même pour toute la
    famille : inutile de l'envoyer (et de le facturer) une fois par enfant.

    Dépend de l'école, car les champs personnalisés en font partie : un corps citant
    `{moyenne}` est bien personnalisé, et dédupliquer entre frères et sœurs enverrait un
    seul message portant la note d'un seul des deux.
    """
    return bool(variables.used_variables(body) & variables.student_variable_names(school))


def render_for(message, eleve, parent):
    """Corps et objet rendus pour ce destinataire, plus les variables restées vides."""
    context = variables.build_context(message, eleve, parent)
    body, missing_body = variables.render(message.body, context)
    subject_source = message.subject or (message.school.name if message.school else '')
    subject, _ = variables.render(subject_source, context)
    return body, subject, missing_body


def build_recipients(message, dry_run=False):
    """Cœur de l'envoi : construit les `MessageRecipient` (sans les enregistrer) et les
    totaux. `dry_run=True` n'appelle aucun fournisseur — un canal est réputé aboutir dès
    que le parent a la coordonnée — ce qui permet à l'aperçu d'emprunter exactement le
    même chemin de décision que l'envoi réel.

    Retourne (recipients, joignables, injoignables, coût total)."""
    eleves = resolve_eleves(message).prefetch_related(
        'studentguardian_set__parent', 'inscriptions__classe',
    )
    dedup = not is_per_student(message.body, message.school)
    quota = _QuotaTracker(message.school)
    total_cost = Decimal('0')
    recipients = []
    reached = 0
    unreachable = 0
    now = timezone.now()
    # Message sans variable élève : un parent déjà contacté (pour un frère ou une sœur)
    # ne l'est pas une seconde fois, on incrémente juste le nombre d'élèves couverts.
    by_parent = {}

    def register(recipient, missing=frozenset()):
        nonlocal total_cost, reached, unreachable
        # Élèves couverts par ce message — utile à l'aperçu, qui ventile par classe et
        # doit compter chaque enfant dans la sienne, pas dans celle du frère servi en
        # premier. Transitoire : seul `eleves_count` est persisté.
        recipient.covered_eleves = [recipient.eleve]
        # Variables restées vides pour ce destinataire — transitoire aussi, agrégé par
        # l'aperçu pour prévenir avant l'envoi.
        recipient.missing_variables = missing
        recipients.append(recipient)
        total_cost += recipient.cost
        if recipient.status == MessageRecipient.Status.ENVOYE:
            reached += 1
        else:
            unreachable += 1
        if dedup and recipient.parent_id is not None:
            by_parent[recipient.parent_id] = recipient

    for eleve in eleves:
        parents = _ordered_parents(eleve)

        if not parents:
            register(
                MessageRecipient(
                    message=message,
                    parent=None,
                    eleve=eleve,
                    channel_used='',
                    status=MessageRecipient.Status.ECHEC,
                    skip_reason=MessageRecipient.SkipReason.NO_PARENT,
                    cost=0,
                    sent_at=now,
                )
            )
            continue

        already = next((by_parent[p.id] for p in parents if p.id in by_parent), None)
        if already is not None:
            already.eleves_count += 1
            already.covered_eleves.append(eleve)
            continue

        if message.notify_all_parents:
            for parent in parents:
                body, subject, missing = render_for(message, eleve, parent)
                channel, attempts = _deliver_to_parent(message, parent, dry_run, body, subject, quota)
                register(
                    _build_recipient(message, eleve, parent, channel, attempts, now, body),
                    missing,
                )
            continue

        # Un seul destinataire par élève : on s'arrête au premier parent joignable.
        # Si aucun ne l'est, on garde une trace unique portant toutes les tentatives.
        all_attempts = []
        delivered = None
        for parent in parents:
            body, subject, missing = render_for(message, eleve, parent)
            channel, attempts = _deliver_to_parent(message, parent, dry_run, body, subject, quota)
            all_attempts.extend(attempts)
            if channel:
                delivered = (parent, channel, attempts, body, missing)
                break

        if delivered:
            parent, channel, attempts, body, missing = delivered
            register(
                _build_recipient(message, eleve, parent, channel, attempts, now, body), missing,
            )
        else:
            body, _subject, missing = render_for(message, eleve, parents[0])
            register(
                _build_recipient(message, eleve, parents[0], None, all_attempts, now, body),
                missing,
            )

    return recipients, reached, unreachable, total_cost


MAX_PREVIEW_FAILURES = 100


def _classe_name(eleve, annee):
    """Classe de l'élève pour l'année du message. Le cache `Eleve.classe` ne vaut que
    pour l'année courante : sur un aperçu rejoué sur une année passée, il ventilerait
    les élèves dans leur classe d'aujourd'hui."""
    if eleve is None:
        return 'Sans classe'
    classe = eleve.classe_pour(annee) if annee is not None else eleve.classe
    return classe.name if classe else 'Sans classe'


def preview_message(message):
    """Récapitulatif de ce que donnerait l'envoi, sans contacter personne ni rien
    enregistrer. Passe par `build_recipients(dry_run=True)` pour que l'aperçu ne puisse
    pas diverger de l'envoi réel."""
    recipients, reached, unreachable, total_cost = build_recipients(message, dry_run=True)

    by_channel = {}
    by_classe = {}
    failures = []
    eleves_total = 0
    missing_counts = Counter()

    def classe_stats(eleve):
        name = _classe_name(eleve, message.annee)
        return by_classe.setdefault(name, {'classe': name, 'messages': 0, 'eleves': 0})

    for r in recipients:
        eleves_total += r.eleves_count
        missing_counts.update(getattr(r, 'missing_variables', ()) or ())
        for covered in r.covered_eleves:
            classe_stats(covered)['eleves'] += 1
        # Le message est compté dans la classe de l'élève qui a déclenché son envoi.
        classe_stats(r.eleve)['messages'] += 1
        classe = classe_stats(r.eleve)['classe']

        if r.status == MessageRecipient.Status.ENVOYE:
            by_channel[r.channel_used] = by_channel.get(r.channel_used, 0) + 1
        elif len(failures) < MAX_PREVIEW_FAILURES:
            failures.append({
                'eleve': str(r.eleve) if r.eleve else None,
                'classe': classe,
                'reason': r.get_skip_reason_display(),
            })

    # Une variable inconnue est vide pour tout le monde : on la signale à part, c'est
    # presque toujours une faute de frappe, pas une donnée manquante.
    inconnues = set(variables.analyse(message.body, message.school)['unknown'])
    variable_warnings = [
        {
            'variable': name,
            'unknown': name in inconnues,
            'missing_count': count,
        }
        for name, count in sorted(missing_counts.items())
    ]

    return {
        'eleves_count': eleves_total,
        'messages_count': len(recipients),
        'reached': reached,
        'unreachable': unreachable,
        'cost': total_cost,
        'deduplicated': not is_per_student(message.body, message.school),
        'notify_all_parents': message.notify_all_parents,
        'by_channel': [{'channel': c, 'count': n} for c, n in sorted(by_channel.items())],
        'by_classe': sorted(by_classe.values(), key=lambda s: s['classe']),
        'failures': failures,
        'failures_truncated': unreachable > len(failures),
        # Ce que recevra réellement le premier destinataire, variables substituées.
        'sample_rendered': recipients[0].rendered_body if recipients else '',
        'variable_warnings': variable_warnings,
        'student_variables': sorted(variables.student_variable_names(message.school)),
    }


def send_message(message):
    """Envoie le message et enregistre l'historique par destinataire."""
    recipients, reached, unreachable, total_cost = build_recipients(message)

    MessageRecipient.objects.bulk_create(recipients)
    message.recipient_count = reached + unreachable
    message.cost = total_cost
    if reached == 0:
        message.status = Message.Status.ECHEC
    elif unreachable == 0:
        message.status = Message.Status.ENVOYE
    else:
        message.status = Message.Status.PARTIEL
    message.sent_at = timezone.now()
    message.save(update_fields=['recipient_count', 'cost', 'status', 'sent_at'])
    return message


def resend_message(original_message, created_by):
    """Crée un nouvel envoi lié, ciblant uniquement les élèves encore injoignables
    lors de la dernière tentative (réévalué en direct, au cas où un contact a été
    ajouté entre-temps)."""
    latest = original_message.retries.order_by('-created_at').first() or original_message

    unreachable_ids = list(
        latest.recipients.filter(
            status=MessageRecipient.Status.ECHEC, eleve__isnull=False,
        ).values_list('eleve_id', flat=True)
    )

    if not unreachable_ids:
        return None

    # On cible tous les élèves marqués injoignables lors de la dernière tentative ;
    # send_message() réévaluera leur joignabilité en direct (un contact a pu être
    # ajouté entre-temps), sans quoi renvoyer ne servirait jamais à rien.
    retry = Message.objects.create(
        school=original_message.school,
        annee=original_message.annee,
        template=original_message.template,
        subject=original_message.subject,
        body=original_message.body,
        scope_type=Message.ScopeType.INDIVIDUEL,
        channel=original_message.channel,
        channel_order=original_message.channel_order,
        notify_all_parents=original_message.notify_all_parents,
        created_by=created_by,
        retry_of=original_message,
    )
    retry.scope_eleves.set(unreachable_ids)
    return retry
