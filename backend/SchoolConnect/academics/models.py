from django.db import models


class Classe(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=100)
    level = models.CharField(max_length=50, blank=True)
    academic_year = models.CharField(max_length=9, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['school', 'level', 'name']
        unique_together = [('school', 'name', 'academic_year')]

    def __str__(self):
        return f"{self.name} - {self.school.name}"


class Eleve(models.Model):
    class Sexe(models.TextChoices):
        M = 'M', 'Masculin'
        F = 'F', 'Féminin'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='eleves')
    classe = models.ForeignKey(Classe, on_delete=models.SET_NULL, null=True, blank=True, related_name='eleves')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    sexe = models.CharField(max_length=1, choices=Sexe.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    matricule = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['school', 'classe', 'last_name', 'first_name']
        indexes = [models.Index(fields=['school', 'last_name', 'first_name'])]

    def __str__(self):
        return f"{self.last_name} {self.first_name}"
