"""Crée le modèle Inscription et bascule l'existant dessus.

Chaque élève ayant une classe reçoit une inscription INSCRIT sur l'année de cette
classe. `Eleve.classe` est conservé, mais devient un simple cache de l'année courante.
"""

import django.db.models.deletion
from django.db import migrations, models


def creer_inscriptions(apps, schema_editor):
    Eleve = apps.get_model('academics', 'Eleve')
    Inscription = apps.get_model('academics', 'Inscription')

    inscriptions = [
        Inscription(
            eleve=eleve,
            classe_id=eleve.classe_id,
            annee_id=eleve.classe.annee_id,
            statut='INSCRIT',
        )
        for eleve in Eleve.objects.filter(classe__isnull=False).select_related('classe')
    ]
    Inscription.objects.bulk_create(inscriptions, batch_size=500)


def supprimer_inscriptions(apps, schema_editor):
    apps.get_model('academics', 'Inscription').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0005_classe_annee'),
    ]

    operations = [
        migrations.CreateModel(
            name='Inscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('statut', models.CharField(
                    choices=[
                        ('INSCRIT', 'Inscrit'),
                        ('PARTI', "Parti en cours d'année"),
                        ('DIPLOME', 'Diplômé'),
                        ('TRANSFERE', 'Transféré'),
                    ],
                    default='INSCRIT', max_length=10,
                )),
                ('date_inscription', models.DateField(auto_now_add=True)),
                ('annee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='inscriptions', to='academics.anneescolaire',
                )),
                ('classe', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='inscriptions', to='academics.classe',
                )),
                ('eleve', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='inscriptions', to='academics.eleve',
                )),
            ],
            options={
                'ordering': ['-annee__label', 'classe'],
                'unique_together': {('eleve', 'annee')},
            },
        ),
        migrations.AlterField(
            model_name='eleve',
            name='classe',
            field=models.ForeignKey(
                blank=True,
                help_text="Cache de la classe de l'année courante, pour l'affichage. Ne jamais "
                          'écrire directement : passer par academics.services.inscrire(), qui '
                          "tient l'inscription (source de vérité) et ce champ synchronisés.",
                null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='eleves', to='academics.classe',
            ),
        ),
        migrations.RunPython(creer_inscriptions, supprimer_inscriptions),
    ]
