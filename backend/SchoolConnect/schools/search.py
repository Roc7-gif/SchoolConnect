"""Recherche texte partagée par les listes élèves / classes / parents.

Deux passes : d'abord un LIKE insensible à la casse (rapide, fait en base), puis —
seulement s'il ne remonte rien — une comparaison floue RapidFuzz en Python, pour que
« Kone », « Koné » ou « Konne » retrouvent quand même le bon élève. Volontairement
sans extension Postgres (pg_trgm) : la liste d'une école tient largement dans la
limite ci-dessous, et ça marche à l'identique sur n'importe quelle base.
"""

import unicodedata

from django.db.models import Q
from rapidfuzz import fuzz

FUZZY_THRESHOLD = 75
MAX_FUZZY_CANDIDATES = 3000


def normalize(value):
    """Minuscule et sans accents, pour comparer « Koné » et « kone »."""
    text = unicodedata.normalize('NFKD', str(value or ''))
    return ''.join(c for c in text if not unicodedata.combining(c)).lower().strip()


def filter_search(qs, term, fields, related_fields=()):
    """Filtre `qs` sur `term`. Chaque mot saisi doit apparaître dans au moins un des
    champs cherchés. `fields` doit lister des attributs directs du modèle (seuls
    ceux-là passent dans la comparaison floue) ; `related_fields` accepte des lookups
    traversant une relation, utilisés uniquement au LIKE."""
    term = (term or '').strip()
    if not term:
        return qs

    lookups = [*fields, *related_fields]
    matched = qs
    for word in term.split():
        clause = Q()
        for lookup in lookups:
            clause |= Q(**{f'{lookup}__icontains': word})
        matched = matched.filter(clause)

    if related_fields:
        matched = matched.distinct()
    if matched.exists():
        return matched
    return _fuzzy(qs, term, fields)


def _fuzzy(qs, term, fields):
    needle = normalize(term)
    ids = [
        obj.pk
        for obj in qs[:MAX_FUZZY_CANDIDATES]
        if fuzz.partial_ratio(needle, normalize(' '.join(str(getattr(obj, f) or '') for f in fields)))
        >= FUZZY_THRESHOLD
    ]
    return qs.filter(pk__in=ids)
