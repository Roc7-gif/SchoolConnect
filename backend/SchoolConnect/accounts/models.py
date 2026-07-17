from django.contrib.auth.models import AbstractUser
from django.db import models

from schools.validators import phone_validator


class User(AbstractUser):
    class Role(models.TextChoices):
        DIRECTEUR = 'DIRECTEUR', 'Directeur'
        ENSEIGNANT = 'ENSEIGNANT', 'Enseignant'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.DIRECTEUR)
    school = models.ForeignKey(
        'schools.School',
        on_delete=models.PROTECT,
        related_name='staff',
        null=True,
        blank=True,
        help_text="Vide pour un compte AfriLab (superuser) non rattaché à une école.",
    )
    phone_number = models.CharField(max_length=20, blank=True, validators=[phone_validator])

    class Meta:
        ordering = ['school', 'last_name', 'first_name']

    def __str__(self):
        full_name = self.get_full_name() or self.username
        return f"{full_name} ({self.school})" if self.school else full_name
