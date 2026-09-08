"""Rattache les messages à une année scolaire.

Les messages déjà envoyés sont datés de l'année courante de leur école. C'est une
approximation assumée : ils sont historiques et ne seront pas réémis, mais les laisser
sans année ferait retomber `resolve_eleves` sur son ciblage non scopé si on les rejouait.
"""

import django.db.models.deletion
from django.db import migrations, models


def rattacher_annee_courante(apps, schema_editor):
    AnneeScolaire = apps.get_model('academics', 'AnneeScolaire')
    Message = apps.get_model('messaging', 'Message')

    courantes = {
        a.school_id: a.id for a in AnneeScolaire.objects.filter(is_current=True)
    }
    for message in Message.objects.filter(annee__isnull=True):
        annee_id = courantes.get(message.school_id)
        if annee_id:
            message.annee_id = annee_id
            message.save(update_fields=['annee'])


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0007_remove_classe_academic_year'),
        ('messaging', '0006_messagerecipient_eleves_count'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='annee',
            field=models.ForeignKey(blank=True, help_text='Année scolaire ciblée. Détermine quels élèves sont concernés : sans elle, un envoi « école entière » toucherait aussi les familles des anciens élèves.', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='messages', to='academics.anneescolaire'),
        ),
        migrations.RunPython(rattacher_annee_courante, migrations.RunPython.noop),
    ]
