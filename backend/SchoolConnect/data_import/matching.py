from collections import defaultdict

from rapidfuzz import fuzz, process

from academics.models import Classe, Eleve, Inscription

FUZZY_THRESHOLD = 80

# Statuts qui signent une sortie de l'école : ces élèves ne doivent plus être proposés
# au rapprochement, sinon un import de rentrée « reconnaîtrait » un ancien parti depuis
# trois ans au lieu de créer le nouvel homonyme.
STATUTS_SORTIS = (Inscription.Statut.DIPLOME, Inscription.Statut.TRANSFERE)


def _match_existing_eleve(row, classe_id, eleves_by_matricule, eleves_by_name):
    """Retrouve un élève déjà présent dans l'école, pour éviter de le dupliquer
    lors d'un ré-import (ex : même fichier importé deux fois)."""
    matricule = (row.get('matricule') or '').strip().lower()
    if matricule:
        match = eleves_by_matricule.get(matricule)
        if match:
            return match

    first_name = (row.get('first_name') or '').strip().lower()
    last_name = (row.get('last_name') or '').strip().lower()
    if not first_name or not last_name:
        return None

    candidates = eleves_by_name.get((first_name, last_name), [])
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Homonymes : on ne tranche que si un seul candidat est dans la même classe —
    # sinon on préfère créer un doublon plutôt que risquer d'écraser le mauvais élève.
    if classe_id:
        same_classe = [c for c in candidates if c['classe_id'] == classe_id]
        if len(same_classe) == 1:
            return same_classe[0]
    return None


def build_plan(rows, school, annee):
    # Les classes candidates sont celles de l'année importée : rapprocher une « 6ème A »
    # de 2024 lors d'un import 2026 y déverserait la nouvelle promotion.
    existing_classes = list(
        Classe.objects.filter(school=school, annee=annee).values('id', 'name', 'level'),
    )
    existing_names = [c['name'] for c in existing_classes]

    # Les élèves, eux, sont cherchés dans toute l'école et pas seulement sur l'année
    # importée : c'est ce qui permet de reconnaître un élève qui monte de 6ème A à 5ème B
    # au lieu d'en créer un doublon. Seuls les sortants définitifs sont écartés.
    sortis = set(
        Inscription.objects
        .filter(eleve__school=school, statut__in=STATUTS_SORTIS)
        .exclude(eleve__inscriptions__statut=Inscription.Statut.INSCRIT)
        .values_list('eleve_id', flat=True),
    )
    existing_eleves = [
        e for e in Eleve.objects.filter(school=school).values(
            'id', 'first_name', 'last_name', 'matricule', 'classe_id',
        )
        if e['id'] not in sortis
    ]
    eleves_by_matricule = {
        e['matricule'].strip().lower(): e for e in existing_eleves if (e['matricule'] or '').strip()
    }
    eleves_by_name = defaultdict(list)
    for e in existing_eleves:
        key = (e['first_name'].strip().lower(), e['last_name'].strip().lower())
        eleves_by_name[key].append(e)

    classes_by_source = {}
    classes_plan = []
    for row in rows:
        name = (row.get('classe_name') or '').strip()
        if not name or name in classes_by_source:
            continue
        match = None
        score = None
        if existing_names:
            result = process.extractOne(name, existing_names, scorer=fuzz.WRatio)
            if result and result[1] >= FUZZY_THRESHOLD:
                score = result[1]
                match = next(c for c in existing_classes if c['name'] == result[0])
        ref = f'c{len(classes_plan)}'
        classes_by_source[name] = ref
        classes_plan.append({
            'ref': ref,
            'source_name': name,
            'action': 'match' if match else 'create',
            'match_id': match['id'] if match else None,
            'match_score': score,
            'name': match['name'] if match else name,
            'level': match['level'] if match else '',
        })

    plan_rows = []
    for row in rows:
        classe_name = (row.get('classe_name') or '').strip()
        classe_ref = classes_by_source.get(classe_name)
        classe_plan = next((c for c in classes_plan if c['ref'] == classe_ref), None)
        classe_id = classe_plan['match_id'] if classe_plan else None

        match = _match_existing_eleve(row, classe_id, eleves_by_matricule, eleves_by_name)
        plan_rows.append({
            'first_name': row.get('first_name') or '',
            'last_name': row.get('last_name') or '',
            'sexe': row.get('sexe') or '',
            'date_of_birth': row.get('date_of_birth') or '',
            'matricule': row.get('matricule') or '',
            'classe_ref': classe_ref,
            'parent_first_name': row.get('parent_first_name') or '',
            'parent_last_name': row.get('parent_last_name') or '',
            'parent_phone': row.get('parent_phone') or '',
            'parent_relationship': row.get('parent_relationship') or 'TUTEUR',
            'extra': {},
            'action': 'update' if match else 'create',
            'match_id': match['id'] if match else None,
        })

    return {'classes': classes_plan, 'rows': plan_rows}
