from django.contrib.auth.models import AbstractUser
from django.db import models

from schools.validators import phone_validator


class User(AbstractUser):
    """Compte d'un établissement.

    Pas de rôles ni de droits différenciés : un compte représente l'école, et qui le
    détient dispose de tous les droits sur ses données. Seul `is_superuser` fait
    exception — c'est le compte AfriLab, non rattaché à une école, qui voit tout.
    """

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
