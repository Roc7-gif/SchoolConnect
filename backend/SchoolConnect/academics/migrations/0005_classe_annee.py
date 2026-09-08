"""Rattache chaque classe existante à une AnneeScolaire.

Reprise des données : l'ancien `Classe.academic_year` était un texte libre presque
toujours vide. Chaque valeur distincte devient une année scolaire de l'école — ce qui
préserve l'unicité, l'ancienne contrainte `('school', 'name', 'academic_year')`
garantissant déjà qu'aucun couple (nom, année) n'était en double. Les classes sans
année rejoignent une année par défaut, marquée courante.
"""

import django.db.models.deletion
from django.db import migrations, models

DEFAULT_LABEL = '2025-2026'
FALLBACK_LABEL = 'Non datée'


def creer_annees(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    AnneeScolaire = apps.get_model('academics', 'AnneeScolaire')
    Classe = apps.get_model('academics', 'Classe')

    for school in School.objects.all():
        libelles = set(
            Classe.objects.filter(school=school).values_list('academic_year', flat=True),
        )
        explicites = {lib for lib in libelles if lib}
        # Si « 2025-2026 » est déjà utilisé explicitement, les classes sans année ne
        # peuvent pas le rejoindre sans risquer une collision de noms : on les isole.
        label_defaut = FALLBACK_LABEL if DEFAULT_LABEL in explicites else DEFAULT_LABEL

        a_creer = set(explicites)
        if '' in libelles or not libelles:
            a_creer.add(label_defaut)

        annees = {}
        for label in sorted(a_creer):
            annee, _ = AnneeScolaire.objects.get_or_create(school=school, label=label)
            annees[label] = annee

        # Une seule année courante : la valeur par défaut si elle existe, sinon la plus récente.
        courante = annees.get(label_defaut) or (annees[max(annees)] if annees else None)
        if courante is not None:
            courante.is_current = True
            courante.save(update_fields=['is_current'])

        for classe in Classe.objects.filter(school=school):
            annee = annees[classe.academic_year or label_defaut]
            classe.annee = annee
            classe.save(update_fields=['annee'])


def supprimer_annees(apps, schema_editor):
    apps.get_model('academics', 'AnneeScolaire').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0004_anneescolaire'),
    ]

    operations = [
        # L'ancienne contrainte porte sur academic_year : la lever avant d'introduire la FK.
        migrations.AlterUniqueTogether(
            name='classe',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='classe',
            name='annee',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='classes', to='academics.anneescolaire',
            ),
        ),
        migrations.RunPython(creer_annees, supprimer_annees),
        migrations.AlterField(
            model_name='classe',
            name='annee',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='classes', to='academics.anneescolaire',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='classe',
            unique_together={('school', 'annee', 'name')},
        ),
    ]
