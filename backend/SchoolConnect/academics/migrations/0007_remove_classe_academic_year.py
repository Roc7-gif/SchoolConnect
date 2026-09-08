"""Retire `Classe.academic_year`, remplacé par la FK vers AnneeScolaire (cf. 0005)."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0006_inscription'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='classe',
            name='academic_year',
        ),
    ]
