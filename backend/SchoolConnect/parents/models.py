from django.db import models

from schools.validators import phone_validator


class Parent(models.Model):
    class Channel(models.TextChoices):
        SMS = 'SMS', 'SMS'
        WHATSAPP = 'WHATSAPP', 'WhatsApp'
        EMAIL = 'EMAIL', 'Email'

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20, validators=[phone_validator], db_index=True)
    whatsapp_number = models.CharField(
        max_length=20, blank=True, validators=[phone_validator],
        help_text="Laisser vide si identique au téléphone",
    )
    email = models.EmailField(blank=True)
    preferred_channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    students = models.ManyToManyField('academics.Eleve', through='StudentGuardian', related_name='parents')

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name} {self.first_name} ({self.phone_number})"


class StudentGuardian(models.Model):
    class Relationship(models.TextChoices):
        MERE = 'MERE', 'Mère'
        PERE = 'PERE', 'Père'
        TUTEUR = 'TUTEUR', 'Tuteur/Tutrice'
        AUTRE = 'AUTRE', 'Autre'

    student = models.ForeignKey('academics.Eleve', on_delete=models.CASCADE)
    parent = models.ForeignKey(Parent, on_delete=models.CASCADE)
    relationship = models.CharField(max_length=10, choices=Relationship.choices, default=Relationship.TUTEUR)
    is_primary_contact = models.BooleanField(default=False, help_text="Contact prioritaire pour l'envoi des messages")

    class Meta:
        unique_together = [('student', 'parent')]
        ordering = ['student', '-is_primary_contact']

    def __str__(self):
        return f"{self.parent} → {self.student} ({self.relationship})"
