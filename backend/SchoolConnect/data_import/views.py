import uuid

import openpyxl
from celery.result import AsyncResult
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from academics import services as academics_services
from academics.models import Classe, Eleve
from parents.models import Parent, StudentGuardian

from .matching import build_plan

ANNEE_MANQUANTE = (
    "Aucune année scolaire n'est définie pour cette école. Créez-en une avant d'importer."
)


def _resolve_annee(request):
    """Année visée par l'import : celle du formulaire, sinon l'année courante.

    Un import doit toujours atterrir dans une année précise — c'est elle qui décide des
    classes candidates au rapprochement et des inscriptions créées.
    """
    return academics_services.resolve_annee(request.user.school, request.data.get('annee'))
from .parsers import ALL_COLUMNS, OPTIONAL_COLUMNS, REQUIRED_COLUMNS, parse_deterministic
from .tasks import run_ai_preview_task


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def import_columns_view(request):
    return Response({'required': REQUIRED_COLUMNS, 'optional': OPTIONAL_COLUMNS})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def import_template_view(request):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Élèves'
    ws.append(ALL_COLUMNS)
    ws.append([
        'Kouassi', 'Awa', 'CM2 A', 'F', '2014-05-12', 'EL001',
        'Kouassi', 'Fatou', '+2250700000000', 'MERE',
    ])

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="modele_import_schoolconnect.xlsx"'
    wb.save(response)
    return response


class ImportPreviewView(APIView):
    """Mode déterministe uniquement — rapide, reste synchrone. Le mode IA passe par
    ImportPreviewAsyncView (appels API externes, potentiellement longs)."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'file': 'Fichier requis.'}, status=status.HTTP_400_BAD_REQUEST)

        annee = _resolve_annee(request)
        if annee is None:
            return Response({'annee': ANNEE_MANQUANTE}, status=status.HTTP_400_BAD_REQUEST)

        rows, notices = parse_deterministic(file_obj)
        plan = build_plan(rows, request.user.school, annee)
        plan['notices'] = notices
        plan['annee'] = annee.id
        plan['annee_label'] = annee.label
        return Response(plan)


class ImportPreviewAsyncView(APIView):
    """Mode IA : dispatche une tâche Celery et renvoie tout de suite un task_id à suivre
    via ImportPreviewStatusView, pour ne pas bloquer un worker web le temps des appels API."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'file': 'Fichier requis.'}, status=status.HTTP_400_BAD_REQUEST)

        annee = _resolve_annee(request)
        if annee is None:
            return Response({'annee': ANNEE_MANQUANTE}, status=status.HTTP_400_BAD_REQUEST)

        stored_path = default_storage.save(
            f'imports/tmp/{uuid.uuid4()}_{file_obj.name}', file_obj,
        )
        task = run_ai_preview_task.delay(stored_path, request.user.school_id, annee.id)
        return Response({'task_id': task.id}, status=status.HTTP_202_ACCEPTED)


class ImportPreviewStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, task_id):
        result = AsyncResult(task_id)
        if result.successful():
            return Response({'status': 'done', 'plan': result.result})
        if result.failed():
            exc = result.result
            detail = getattr(exc, 'detail', None)
            if isinstance(detail, dict) and 'file' in detail:
                message = str(detail['file'])
            else:
                message = str(exc)
            return Response({'status': 'error', 'detail': message})
        return Response({'status': 'pending'})


class ImportCommitView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        school = request.user.school
        plan = request.data

        annee = _resolve_annee(request)
        if annee is None:
            return Response({'annee': ANNEE_MANQUANTE}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            classe_objs = {}
            classes_created = 0
            for c in plan.get('classes', []):
                if c.get('action') == 'match' and c.get('match_id'):
                    obj = Classe.objects.get(id=c['match_id'], school=school, annee=annee)
                else:
                    obj, created = Classe.objects.get_or_create(
                        school=school,
                        annee=annee,
                        name=c.get('name') or c.get('source_name'),
                        defaults={'level': c.get('level') or ''},
                    )
                    if created:
                        classes_created += 1
                classe_objs[c['ref']] = obj

            parent_cache = {}
            eleves_created = 0
            eleves_updated = 0
            links_created = 0
            for row in plan.get('rows', []):
                classe_obj = classe_objs.get(row.get('classe_ref'))
                match_id = row.get('match_id')
                eleve = Eleve.objects.filter(id=match_id, school=school).first() if match_id else None

                extra_data = dict(eleve.extra_data) if eleve else {}
                extra_data.update(row.get('extra') or {})

                if eleve is None:
                    eleve = Eleve.objects.create(
                        school=school,
                        first_name=row.get('first_name') or '',
                        last_name=row.get('last_name') or '',
                        sexe=row.get('sexe') or '',
                        date_of_birth=row.get('date_of_birth') or None,
                        matricule=row.get('matricule') or '',
                        extra_data=extra_data,
                    )
                    eleves_created += 1
                else:
                    eleve.first_name = row.get('first_name') or ''
                    eleve.last_name = row.get('last_name') or ''
                    eleve.sexe = row.get('sexe') or ''
                    eleve.date_of_birth = row.get('date_of_birth') or None
                    eleve.matricule = row.get('matricule') or ''
                    eleve.extra_data = extra_data
                    eleve.save()
                    eleves_updated += 1

                # L'affectation de classe passe par le service : il crée l'inscription de
                # l'année importée sans toucher à celles des années précédentes. Écrire
                # `eleve.classe` ici, comme avant, effaçait la scolarité de l'an dernier.
                if classe_obj is not None:
                    academics_services.inscrire(eleve, classe_obj, annee)

                phone = (row.get('parent_phone') or '').strip()
                parent_first_name = row.get('parent_first_name') or ''
                parent_last_name = row.get('parent_last_name') or ''
                if phone or parent_first_name or parent_last_name:
                    cache_key = phone or f'{parent_first_name}|{parent_last_name}'
                    parent_obj = parent_cache.get(cache_key)
                    if parent_obj is None:
                        # Rapprochement borné à l'école : sans ce filtre, importer un
                        # numéro déjà connu d'un autre établissement rattacherait sa fiche,
                        # et cette école pourrait ensuite en modifier les coordonnées.
                        parent_obj = (
                            Parent.objects.filter(school=school, phone_number=phone).first()
                            if phone else None
                        )
                        if parent_obj is None:
                            parent_obj = Parent.objects.create(
                                school=school,
                                first_name=parent_first_name,
                                last_name=parent_last_name,
                                phone_number=phone,
                            )
                        parent_cache[cache_key] = parent_obj
                    _, link_created = StudentGuardian.objects.get_or_create(
                        student=eleve,
                        parent=parent_obj,
                        defaults={
                            'relationship': row.get('parent_relationship') or 'TUTEUR',
                            'is_primary_contact': True,
                        },
                    )
                    if link_created:
                        links_created += 1

        return Response({
            'classes_created': classes_created,
            'eleves_created': eleves_created,
            'eleves_updated': eleves_updated,
            'parents_linked': links_created,
        }, status=status.HTTP_201_CREATED)
