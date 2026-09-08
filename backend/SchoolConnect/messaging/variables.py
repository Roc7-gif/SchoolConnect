"""Moteur de variables des messages.

Un corps de message peut citer des variables entre accolades — `{eleve_nom}`,
`{classe}`, mais aussi n'importe quelle colonne libre créée à l'import
(`CustomFieldDefinition`, lue dans `Eleve.extra_data`). Ce module décide de la liste
disponible, construit le contexte d'un couple (élève, parent) et effectue le rendu.

Deux règles structurent le reste :

- Les variables de la famille **élève** varient d'un enfant à l'autre ; les familles
  **parent** et **école** non. C'est `student_variable_names()` qui tranche, et c'est de
  là que dépend la déduplication par famille — donc la facturation (cf.
  `services.is_per_student`).
- Le rendu ne passe **jamais** par `str.format` : une accolade parasite dans un texte
  saisi par un directeur ferait échouer tout l'envoi. On substitue par expression
  régulière, et une variable inconnue ou vide devient une chaîne vide.
"""

import re

from academics.models import CustomFieldDefinition

# Les noms acceptent lettres, chiffres, tirets et underscores : les slugs générés par
# `slugify` pour les champs personnalisés contiennent des tirets (« moyenne-generale »).
VARIABLE_PATTERN = re.compile(r'\{([a-zA-Z0-9_-]+)\}')


def normalize(name):
    """Forme canonique d'un nom de variable — tirets et underscores équivalents, casse
    ignorée, pour que `{moyenne-generale}` et `{moyenne_generale}` désignent la même chose."""
    return (name or '').strip().lower().replace('-', '_')


# (nom, libellé). L'ordre est celui affiché dans l'aide du frontend.
SCHOOL_VARIABLES = [
    ('ecole', "Nom de l'école"),
    ('ecole_telephone', "Téléphone de l'école"),
    ('annee', 'Année scolaire'),
]

PARENT_VARIABLES = [
    ('parent_nom', 'Nom du parent'),
    ('parent_prenom', 'Prénom du parent'),
    ('parent_nom_complet', 'Nom complet du parent'),
    ('parent_telephone', 'Téléphone du parent'),
    ('parent_email', 'Email du parent'),
]

STUDENT_BUILTIN_VARIABLES = [
    ('eleve_nom', "Nom de l'élève"),
    ('eleve_prenom', "Prénom de l'élève"),
    ('eleve_nom_complet', "Nom complet de l'élève"),
    ('matricule', 'Matricule'),
    ('sexe', 'Sexe'),
    ('date_naissance', 'Date de naissance'),
    ('classe', 'Classe'),
    ('niveau', 'Niveau'),
]


def custom_field_variables(school):
    """Champs personnalisés de l'école, utilisables comme variables élève."""
    if school is None:
        return []
    return [
        (normalize(f.slug), f.name)
        for f in CustomFieldDefinition.objects.filter(school=school).order_by('name')
    ]


def available_variables(school):
    """Toutes les variables utilisables, pour l'aide à la saisie côté frontend."""
    groups = [
        ('eleve', STUDENT_BUILTIN_VARIABLES + custom_field_variables(school), True),
        ('parent', PARENT_VARIABLES, False),
        ('ecole', SCHOOL_VARIABLES, False),
    ]
    return [
        {'name': name, 'label': label, 'group': group, 'per_student': per_student}
        for group, entries, per_student in groups
        for name, label in entries
    ]


def student_variable_names(school):
    """Variables qui changent d'un enfant à l'autre — champs personnalisés compris.

    Un message qui en cite une doit partir une fois par élève : c'est ce qui empêche
    deux frères de recevoir un seul message portant la donnée d'un seul des deux.
    """
    return {name for name, _ in STUDENT_BUILTIN_VARIABLES} | {
        name for name, _ in custom_field_variables(school)
    }


def known_variable_names(school):
    return {v['name'] for v in available_variables(school)}


def used_variables(body):
    """Variables citées dans un corps de message, sous forme canonique."""
    return {normalize(m) for m in VARIABLE_PATTERN.findall(body or '')}


def build_context(message, eleve=None, parent=None):
    """Valeurs des variables pour ce couple (élève, parent). Toujours des chaînes."""
    school = message.school
    annee = message.annee

    context = {
        'ecole': school.name if school else '',
        'ecole_telephone': school.phone_number if school else '',
        'annee': annee.label if annee else '',
    }

    if parent is not None:
        context.update({
            'parent_nom': parent.last_name,
            'parent_prenom': parent.first_name,
            'parent_nom_complet': f'{parent.last_name} {parent.first_name}'.strip(),
            'parent_telephone': parent.phone_number,
            'parent_email': parent.email,
        })

    if eleve is not None:
        # La classe est celle de l'année du message, pas le cache `Eleve.classe`, qui ne
        # vaut que pour l'année courante (cf. academics/services.py).
        classe = eleve.classe_pour(annee) if annee is not None else eleve.classe
        context.update({
            'eleve_nom': eleve.last_name,
            'eleve_prenom': eleve.first_name,
            'eleve_nom_complet': f'{eleve.last_name} {eleve.first_name}'.strip(),
            'matricule': eleve.matricule,
            'sexe': eleve.get_sexe_display() if eleve.sexe else '',
            'date_naissance': eleve.date_of_birth.strftime('%d/%m/%Y') if eleve.date_of_birth else '',
            'classe': classe.name if classe else '',
            'niveau': classe.level if classe else '',
        })
        for key, value in (eleve.extra_data or {}).items():
            context[normalize(key)] = '' if value is None else str(value)

    return {key: ('' if value is None else str(value)) for key, value in context.items()}


def render(body, context):
    """Substitue les variables. Retourne (texte rendu, variables restées vides).

    Une variable inconnue ou sans valeur donne une chaîne vide — jamais le texte brut
    `{...}`, qui partirait tel quel chez le parent.
    """
    missing = set()

    def replace(match):
        name = normalize(match.group(1))
        value = context.get(name, '')
        if not value:
            missing.add(name)
        return value

    return VARIABLE_PATTERN.sub(replace, body or ''), missing


def analyse(body, school):
    """Ce que le frontend a besoin de savoir avant l'envoi : variables citées, inconnues,
    et si le message est personnalisé par élève."""
    used = used_variables(body)
    known = known_variable_names(school)
    return {
        'used': sorted(used),
        'unknown': sorted(used - known),
        'per_student': bool(used & student_variable_names(school)),
    }
