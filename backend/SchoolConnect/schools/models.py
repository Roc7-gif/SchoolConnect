from django.db import models

from .validators import phone_validator


class School(models.Model):
    name = models.CharField(max_length=255)
    country = models.CharField(max_length=100)
    city = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, validators=[phone_validator])
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)

    # Plafonds d'envoi mensuels par canal, fixés par AfriLab (jamais par l'école elle-même).
    # Vide = illimité. Voir messaging.services.quota_remaining() pour le calcul de la
    # fenêtre glissante : mois calendaire, sauf réinitialisation manuelle plus récente.
    sms_monthly_limit = models.PositiveIntegerField(
        null=True, blank=True, help_text='Nombre de SMS envoyables ce mois. Vide = illimité.',
    )
    whatsapp_monthly_limit = models.PositiveIntegerField(
        null=True, blank=True, help_text='Nombre de messages WhatsApp envoyables ce mois. Vide = illimité.',
    )
    email_monthly_limit = models.PositiveIntegerField(
        null=True, blank=True, help_text='Nombre d\'emails envoyables ce mois. Vide = illimité.',
    )
    quota_reset_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Dernière réinitialisation manuelle des compteurs. Vide = seul le "
                  'changement de mois calendaire remet les compteurs à zéro.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
