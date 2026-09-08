import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0003_customfielddefinition'),
        ('schools', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='AnneeScolaire',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(help_text='Ex. 2025-2026', max_length=9)),
                ('start_date', models.DateField(blank=True, null=True)),
                ('end_date', models.DateField(blank=True, null=True)),
                ('is_current', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='annees', to='schools.school',
                )),
            ],
            options={
                'ordering': ['-label'],
                'unique_together': {('school', 'label')},
            },
        ),
        migrations.AddConstraint(
            model_name='anneescolaire',
            constraint=models.UniqueConstraint(
                condition=models.Q(('is_current', True)),
                fields=('school',),
                name='une_seule_annee_courante_par_ecole',
            ),
        ),
    ]
