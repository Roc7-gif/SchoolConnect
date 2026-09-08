from django.db import models
from django.db.models import Q, UniqueConstraint
from django.utils.text import slugify


class AnneeScolaire(models.Model):
    """Année scolaire d'une école — le second axe de cloisonnement, après `school`.

    Une école a au plus une année courante : la contrainte partielle ci-dessous le
    garantit en base plutôt qu'à coups de règles applicatives. La bascule d'année passe
    par `services.definir_annee_courante()`.
    """

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='annees')
    label = models.CharField(max_length=9, help_text='Ex. 2025-2026')
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-label']
        unique_together = [('school', 'label')]
        constraints = [
            UniqueConstraint(
                fields=['school'], condition=Q(is_current=True),
                name='une_seule_annee_courante_par_ecole',
            ),
        ]

    def __str__(self):
        return f'{self.label} — {self.school.name}'


class CustomFieldDefinition(models.Model):
    """Déclare une fois par école un champ additionnel réutilisable sur Eleve.extra_data,
    pour éviter que chaque import invente des clés différentes pour la même info."""

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='custom_fields')
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('school', 'slug')]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Classe(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='classes')
    annee = models.ForeignKey(AnneeScolaire, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=100)
    level = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['school', 'level', 'name']
        # Une « 6ème A » par année : le même libellé peut donc réapparaître chaque rentrée.
        unique_together = [('school', 'annee', 'name')]

    def __str__(self):
        return f'{self.name} ({self.annee.label}) - {self.school.name}'


class EleveQuerySet(models.QuerySet):
    def pour_annee(self, annee):
        """Élèves effectivement inscrits sur cette année.

        Passe par les inscriptions et non par le cache `Eleve.classe` : c'est la seule
        lecture juste pour une année passée. Toutes les listes doivent l'utiliser.
        """
        return self.filter(
            inscriptions__annee=annee,
            inscriptions__statut=Inscription.Statut.INSCRIT,
        ).distinct()


class Eleve(models.Model):
    class Sexe(models.TextChoices):
        M = 'M', 'Masculin'
        F = 'F', 'Féminin'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='eleves')
    classe = models.ForeignKey(
        Classe, on_delete=models.SET_NULL, null=True, blank=True, related_name='eleves',
        help_text="Cache de la classe de l'année courante, pour l'affichage. Ne jamais "
                  "écrire directement : passer par academics.services.inscrire(), qui "
                  "tient l'inscription (source de vérité) et ce champ synchronisés.",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    sexe = models.CharField(max_length=1, choices=Sexe.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    matricule = models.CharField(max_length=50, blank=True)
    extra_data = models.JSONField(
        default=dict, blank=True,
        help_text='Champs personnalisés additionnels (créés depuis un import ou la fiche élève).',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = EleveQuerySet.as_manager()

    class Meta:
        ordering = ['school', 'classe', 'last_name', 'first_name']
        indexes = [models.Index(fields=['school', 'last_name', 'first_name'])]

    def __str__(self):
        return f"{self.last_name} {self.first_name}"

    def classe_pour(self, annee):
        """Classe suivie cette année-là, ou None. Sert aux écrans qui consultent une
        année autre que la courante, pour laquelle le cache `classe` ne vaut rien."""
        inscription = next((i for i in self.inscriptions.all() if i.annee_id == annee.id), None)
        return inscription.classe if inscription else None


class Inscription(models.Model):
    """Scolarité d'un élève pour une année donnée — la source de vérité du lien
    élève/classe. L'élève est une identité stable ; c'est son inscription qui change
    chaque rentrée, ce qui préserve l'historique (et rend le redoublement représentable :
    deux inscriptions d'années différentes vers la même classe)."""

    class Statut(models.TextChoices):
        INSCRIT = 'INSCRIT', 'Inscrit'
        PARTI = 'PARTI', 'Parti en cours d\'année'
        DIPLOME = 'DIPLOME', 'Diplômé'
        TRANSFERE = 'TRANSFERE', 'Transféré'

    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='inscriptions')
    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name='inscriptions')
    annee = models.ForeignKey(AnneeScolaire, on_delete=models.CASCADE, related_name='inscriptions')
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.INSCRIT)
    date_inscription = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ['-annee__label', 'classe']
        # Un élève ne suit qu'une classe par année.
        unique_together = [('eleve', 'annee')]

    def __str__(self):
        return f'{self.eleve} — {self.classe.name} ({self.annee.label})'
