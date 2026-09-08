import datetime
import os
import unicodedata

import openpyxl
import pdfplumber
from rest_framework.exceptions import ValidationError

REQUIRED_COLUMNS = ['Nom', 'Prenom', 'ParentNom', 'ParentPrenom', 'ParentTelephone']
OPTIONAL_COLUMNS = ['Classe', 'Sexe', 'DateNaissance', 'Matricule', 'ParentRelation']
# Ordre d'affichage naturel (Classe juste après Prenom) — distinct de required+optional.
ALL_COLUMNS = ['Nom', 'Prenom', 'Classe', 'ParentNom', 'ParentPrenom', 'ParentTelephone', 'Sexe', 'DateNaissance', 'Matricule', 'ParentRelation']

HEADER_SEARCH_DEPTH = 10


def _normalize_header(value):
    """Insensible à la casse, aux espaces et aux accents : 'nom', 'NOM ', 'Nôm' matchent tous 'Nom'."""
    value = (value or '').strip().lower()
    value = unicodedata.normalize('NFKD', value)
    return ''.join(c for c in value if not unicodedata.combining(c))


_NORMALIZED_TO_CANONICAL = {_normalize_header(c): c for c in ALL_COLUMNS}


def _cell_str(val):
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime('%Y-%m-%d')
    return str(val).strip()


def _to_canonical(row):
    return [_NORMALIZED_TO_CANONICAL.get(_normalize_header(c), c) for c in row]


def _is_header_row(row):
    """Une ligne d'en-tête contient au moins 2 noms de colonnes attendus. Sert à la fois à
    repérer le début du tableau (ligne de titre au-dessus) et à ignorer les en-têtes répétés
    quand un fichier contient plusieurs tableaux à la suite."""
    found = {c for c in _to_canonical(row) if c in REQUIRED_COLUMNS}
    return len(found) >= 2


def _clean_rows(raw_rows):
    return [
        [_cell_str(v) or '' for v in row]
        for row in raw_rows
        if row is not None and not all(v is None for v in row)
    ]


def _read_excel_blocks(file_obj):
    """Un bloc par feuille — un classeur avec une feuille par classe est un cas courant."""
    try:
        wb = openpyxl.load_workbook(file_obj, data_only=True)
    except Exception as exc:
        raise ValidationError({'file': f'Fichier illisible : {exc}'})

    blocks = []
    for sheet in wb.worksheets:
        rows = _clean_rows(sheet.iter_rows(values_only=True))
        if rows:
            blocks.append((f'Feuille « {sheet.title} »', rows))
    return blocks


def _read_pdf_blocks(file_obj):
    """Un bloc par tableau détecté — un PDF avec un tableau par salle est un cas courant."""
    try:
        with pdfplumber.open(file_obj) as pdf:
            blocks = []
            for page_num, page in enumerate(pdf.pages, 1):
                for table_num, table in enumerate(page.extract_tables(), 1):
                    rows = _clean_rows(table)
                    if rows:
                        blocks.append((f'Page {page_num}, tableau {table_num}', rows))
    except Exception as exc:
        raise ValidationError({'file': f'Fichier illisible : {exc}'})

    if not blocks:
        raise ValidationError({
            'file': (
                "Aucun tableau détecté dans ce PDF. S'il s'agit d'un document scanné (image), "
                'le mode standard ne peut pas le lire — essayez le mode IA, ou un export Excel.'
            ),
        })
    return blocks


def _parse_block(block_rows):
    """Retourne (lignes_élèves, colonnes_manquantes). Un bloc sans en-tête reconnaissable
    retourne (None, None) — c'est probablement une feuille de notes/résumé, pas un tableau d'élèves."""
    header_idx = next(
        (i for i, r in enumerate(block_rows[:HEADER_SEARCH_DEPTH]) if _is_header_row(r)),
        None,
    )
    if header_idx is None:
        return None, None

    canonical = _to_canonical(block_rows[header_idx])
    missing = [c for c in REQUIRED_COLUMNS if c not in canonical]
    if missing:
        return None, missing

    col_index = {h: i for i, h in enumerate(canonical)}

    def get(raw_row, col):
        idx = col_index.get(col)
        if idx is None or idx >= len(raw_row):
            return None
        return raw_row[idx]

    rows = []
    for raw_row in block_rows[header_idx + 1:]:
        if _is_header_row(raw_row):
            continue  # en-tête répété (plusieurs tableaux à la suite)
        rows.append({
            'last_name': get(raw_row, 'Nom'),
            'first_name': get(raw_row, 'Prenom'),
            'classe_name': get(raw_row, 'Classe'),
            'sexe': (get(raw_row, 'Sexe') or '').upper()[:1],
            'date_of_birth': get(raw_row, 'DateNaissance'),
            'matricule': get(raw_row, 'Matricule') or '',
            'parent_last_name': get(raw_row, 'ParentNom'),
            'parent_first_name': get(raw_row, 'ParentPrenom'),
            'parent_phone': get(raw_row, 'ParentTelephone'),
            'parent_relationship': (get(raw_row, 'ParentRelation') or 'TUTEUR').upper(),
        })
    return rows, None


def parse_deterministic(file_obj):
    """Retourne (lignes, avertissements). Lit toutes les feuilles d'un classeur et tous les
    tableaux d'un PDF ; les blocs non exploitables sont signalés plutôt qu'ignorés en silence."""
    filename = getattr(file_obj, 'name', '') or ''
    ext = os.path.splitext(filename)[1].lower()
    blocks = _read_pdf_blocks(file_obj) if ext == '.pdf' else _read_excel_blocks(file_obj)

    if not blocks:
        raise ValidationError({'file': 'Le fichier est vide.'})

    rows = []
    notices = []
    missing_seen = []

    for label, block_rows in blocks:
        block_result, missing = _parse_block(block_rows)
        if missing:
            missing_seen.append(missing)
            notices.append(f"{label} ignoré : colonnes manquantes ({', '.join(missing)}).")
        elif block_result is None:
            notices.append(f"{label} ignoré : aucune colonne d'élèves reconnue.")
        elif not block_result:
            notices.append(f'{label} ignoré : aucune ligne d\'élève.')
        else:
            rows.extend(block_result)
            if len(blocks) > 1:
                notices.append(f'{label} : {len(block_result)} élève(s) lu(s).')

    if not rows:
        missing = missing_seen[0] if missing_seen else REQUIRED_COLUMNS
        raise ValidationError({
            'file': (
                'Colonnes manquantes : ' + ', '.join(missing) +
                '. Colonnes attendues : ' + ', '.join(ALL_COLUMNS)
            ),
        })

    return rows, notices
