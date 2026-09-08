import os

from celery import shared_task
from django.core.files.storage import default_storage

from academics.models import AnneeScolaire
from schools.models import School

from .ai_parser import parse_with_ai


@shared_task
def run_ai_preview_task(stored_path, school_id, annee_id):
    school = School.objects.get(id=school_id)
    annee = AnneeScolaire.objects.get(id=annee_id, school_id=school_id)
    with default_storage.open(stored_path, 'rb') as f:
        plan = parse_with_ai(f, school, annee)
    plan['annee'] = annee.id
    plan['annee_label'] = annee.label
    default_storage.delete(stored_path)
    return plan
