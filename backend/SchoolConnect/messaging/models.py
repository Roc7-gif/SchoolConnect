from django.db import models


class MessageTemplate(models.Model):
    class Category(models.TextChoices):
        RESULTATS = 'RESULTATS', 'Résultats'
        ABSENCE = 'ABSENCE', 'Absence'
        PAIEMENT = 'PAIEMENT', 'Paiement'
        REUNION = 'REUNION', 'Réunion'
        CONVOCATION = 'CONVOCATION', 'Convocation'
        AUTRE = 'AUTRE', 'Autre'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='message_templates')
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.AUTRE)
    subject = models.CharField(
        max_length=200, blank=True,
        help_text="Objet, utilisé par l'email uniquement. Vide = le nom de l'école.",
    )
    body = models.TextField(
        help_text="Variables entre accolades, ex. {eleve_nom}. La liste complète dépend de "
                  "l'école (les champs personnalisés en font partie) — voir "
                  'GET /api/messages/variables/.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Message(models.Model):
    class ScopeType(models.TextChoices):
        CLASSE = 'CLASSE', 'Classe'
        NIVEAU = 'NIVEAU', 'Niveau'
        ECOLE = 'ECOLE', 'École entière'
        INDIVIDUEL = 'INDIVIDUEL', 'Élève(s) individuel(s)'

    class Channel(models.TextChoices):
        SMS = 'SMS', 'SMS'
        WHATSAPP = 'WHATSAPP', 'WhatsApp'
        EMAIL = 'EMAIL', 'Email'
        AUTO = 'AUTO', 'Automatique (canal préféré du parent)'
        CASCADE = 'CASCADE', 'Cascade (SMS, puis WhatsApp, puis Email)'

    class Status(models.TextChoices):
        BROUILLON = 'BROUILLON', 'Brouillon'
        ENVOYE = 'ENVOYE', 'Envoyé'
        PARTIEL = 'PARTIEL', 'Partiellement envoyé'
        ECHEC = 'ECHEC', 'Échec'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='messages')
    annee = models.ForeignKey(
        'academics.AnneeScolaire', on_delete=models.PROTECT, null=True, blank=True,
        related_name='messages',
        help_text="Année scolaire ciblée. Détermine quels élèves sont concernés : sans elle, "
                  'un envoi « école entière » toucherait aussi les familles des anciens élèves.',
    )
    template = models.ForeignKey(
        MessageTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='messages',
    )
    subject = models.CharField(
        max_length=200, blank=True,
        help_text="Objet, utilisé par l'email uniquement. Vide = le nom de l'école.",
    )
    body = models.TextField()
    scope_type = models.CharField(max_length=20, choices=ScopeType.choices)
    scope_classe = models.ForeignKey(
        'academics.Classe', on_delete=models.SET_NULL, null=True, blank=True, related_name='messages',
    )
    scope_level = models.CharField(max_length=50, blank=True)
    scope_eleves = models.ManyToManyField('academics.Eleve', blank=True, related_name='targeted_messages')
    notify_all_parents = models.BooleanField(
        default=False,
        help_text='Envoyer à tous les parents de chaque élève. Par défaut, seul le contact '
                  'prioritaire (ou le premier parent joignable) est contacté.',
    )
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.AUTO)
    channel_order = models.JSONField(
        default=list, blank=True,
        help_text="Ordre de priorité des canaux quand channel=CASCADE, ex. ['SMS', 'EMAIL']. "
                  'Vide = ordre par défaut (SMS, WhatsApp, Email).',
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.BROUILLON)
    recipient_count = models.PositiveIntegerField(default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='messages',
    )
    retry_of = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='retries',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_scope_type_display()} — {self.created_at:%Y-%m-%d %H:%M}"


class MessageRecipient(models.Model):
    class Status(models.TextChoices):
        ENVOYE = 'ENVOYE', 'Envoyé'
        ECHEC = 'ECHEC', 'Échec'
        EN_ATTENTE = 'EN_ATTENTE', 'En attente'

    class SkipReason(models.TextChoices):
        NONE = '', 'N/A'
        NO_PARENT = 'NO_PARENT', 'Aucun parent lié'
        NO_CONTACT = 'NO_CONTACT', 'Parent sans contact pour ce canal'
        QUOTA_EXCEEDED = 'QUOTA_EXCEEDED', "Quota mensuel de l'école atteint"
        SEND_FAILED = 'SEND_FAILED', 'Tous les canaux essayés ont échoué'

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='recipients')
    parent = models.ForeignKey(
        'parents.Parent', on_delete=models.CASCADE, null=True, blank=True, related_name='messages_received',
    )
    eleve = models.ForeignKey(
        'academics.Eleve', on_delete=models.SET_NULL, null=True, blank=True, related_name='messages_about',
    )
    channel_used = models.CharField(max_length=10, blank=True)
    rendered_body = models.TextField(
        blank=True,
        help_text='Texte réellement envoyé à ce parent, variables substituées. Conservé '
                  "pour pouvoir justifier après coup ce que l'établissement a envoyé.",
    )
    eleves_count = models.PositiveIntegerField(
        default=1,
        help_text="Nombre d'élèves couverts par ce message. Vaut plus de 1 quand un parent a "
                  'plusieurs enfants concernés et que le message ne cite aucun élève.',
    )
    attempts = models.JSONField(
        default=list, blank=True,
        help_text="Canaux essayés dans l'ordre avant d'aboutir (mode cascade) : "
                  '[{parent, parent_name, channel, status, error}].',
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EN_ATTENTE)
    skip_reason = models.CharField(max_length=20, choices=SkipReason.choices, blank=True, default=SkipReason.NONE)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-sent_at']
        # Un élève peut avoir plusieurs parents : l'unicité porte sur le couple, sinon
        # un envoi « à tous les parents » ne pourrait pas créer deux lignes pour le même élève.
        unique_together = [('message', 'eleve', 'parent')]

    def __str__(self):
        return f"{self.parent or self.eleve} — {self.status}"
