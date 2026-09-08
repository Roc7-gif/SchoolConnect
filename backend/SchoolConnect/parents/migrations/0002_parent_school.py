"""Rattache chaque parent à une école.

Jusqu'ici `Parent` n'avait pas de FK `school` : il n'était visible que par ricochet, via
ses enfants. L'import rapprochait donc les parents **par téléphone sur toute la base**,
si bien que deux écoles important le même numéro partageaient une fiche — et que l'une
pouvait modifier les coordonnées vues par l'autre.

Reprise des données : l'école du premier enfant rattaché. Un parent ayant des enfants
dans plusieurs écoles est dupliqué (une fiche par école, liens repointés) ; un parent
sans enfant — invisible dans l'application, qui filtre sur les enfants — est rattaché à
la première école plutôt que supprimé.
"""

import django.db.models.deletion
from django.db import migrations, models


def rattacher_ecoles(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    Parent = apps.get_model('parents', 'Parent')
    StudentGuardian = apps.get_model('parents', 'StudentGuardian')

    ecole_par_defaut = School.objects.order_by('pk').first()
    if ecole_par_defaut is None:
        return

    for parent in Parent.objects.all():
        liens = list(StudentGuardian.objects.filter(parent=parent).select_related('student'))
        ecoles = []
        for lien in liens:
            if lien.student.school_id not in ecoles:
                ecoles.append(lien.student.school_id)

        if not ecoles:
            parent.school_id = ecole_par_defaut.pk
            parent.save(update_fields=['school'])
            continue

        parent.school_id = ecoles[0]
        parent.save(update_fields=['school'])

        # Enfants dans d'autres écoles : une fiche distincte par école, pour que chacune
        # reste maîtresse des coordonnées qu'elle voit.
        for autre_ecole in ecoles[1:]:
            copie = Parent.objects.create(
                school_id=autre_ecole,
                first_name=parent.first_name,
                last_name=parent.last_name,
                phone_number=parent.phone_number,
                whatsapp_number=parent.whatsapp_number,
                email=parent.email,
                preferred_channel=parent.preferred_channel,
                is_active=parent.is_active,
            )
            for lien in liens:
                if lien.student.school_id == autre_ecole:
                    lien.parent_id = copie.pk
                    lien.save(update_fields=['parent'])


class Migration(migrations.Migration):

    dependencies = [
        ('parents', '0001_initial'),
        ('schools', '0001_initial'),
        ('academics', '0007_remove_classe_academic_year'),
    ]

    operations = [
        migrations.AddField(
            model_name='parent',
            name='school',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='parents',
                to='schools.school',
            ),
        ),
        migrations.RunPython(rattacher_ecoles, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='parent',
            name='school',
            field=models.ForeignKey(
                help_text="Établissement propriétaire de la fiche. Un parent ayant des enfants "
                          'dans deux écoles a une fiche par école : chacune gère ses propres '
                          "coordonnées sans pouvoir modifier celles de l'autre.",
                on_delete=django.db.models.deletion.CASCADE,
                related_name='parents',
                to='schools.school',
            ),
        ),
        migrations.AddConstraint(
            model_name='parent',
            constraint=models.UniqueConstraint(
                condition=models.Q(('phone_number', ''), _negated=True),
                fields=('school', 'phone_number'),
                name='un_parent_par_telephone_et_ecole',
            ),
        ),
    ]
