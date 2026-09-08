"""Écritures de scolarité — inscriptions, bascule d'année, passage en classe supérieure.

`Inscription` est la source de vérité du lien élève/classe ; `Eleve.classe` n'en est
qu'un cache pour l'affichage de l'année courante. Les deux ne peuvent diverger que si
quelqu'un écrit `eleve.classe` à la main : tout le code applicatif doit passer par
`inscrire()`.
"""

from django.db import transaction

from .models import AnneeScolaire, Classe, Inscription


def get_current_year(school):
    """Année courante de l'école, ou None si aucune n'a encore été définie."""
    return AnneeScolaire.objects.filter(school=school, is_current=True).first()


def resolve_annee(school, annee_id=None):
    """Année demandée explicitement, à défaut l'année courante de l'école."""
    if annee_id:
        return AnneeScolaire.objects.filter(school=school, pk=annee_id).first()
    return get_current_year(school)


@transaction.atomic
def definir_annee_courante(annee):
    """Bascule l'école sur cette année. Décoche l'ancienne d'abord : la contrainte
    partielle `une_seule_annee_courante_par_ecole` refuserait les deux simultanément."""
    AnneeScolaire.objects.filter(school_id=annee.school_id, is_current=True).exclude(
        pk=annee.pk,
    ).update(is_current=False)
    if not annee.is_current:
        annee.is_current = True
        annee.save(update_fields=['is_current'])
    return annee


@transaction.atomic
def inscrire(eleve, classe, annee=None, statut=Inscription.Statut.INSCRIT):
    """Inscrit (ou réinscrit) un élève dans une classe pour une année.

    Met à jour le cache `Eleve.classe` uniquement si l'inscription concerne l'année
    courante — inscrire quelqu'un sur une année passée ne doit pas changer la classe
    qu'affichent les écrans du jour.
    """
    annee = annee or classe.annee
    inscription, _ = Inscription.objects.update_or_create(
        eleve=eleve, annee=annee,
        defaults={'classe': classe, 'statut': statut},
    )

    est_courante = annee.is_current
    if est_courante and eleve.classe_id != classe.id:
        eleve.classe = classe
        eleve.save(update_fields=['classe', 'updated_at'])
    return inscription


@transaction.atomic
def cloturer_inscription(eleve, annee, statut):
    """Marque la sortie d'un élève (PARTI / DIPLOME / TRANSFERE). Il cesse d'être ciblé
    par les listes et les messages de cette année, sans perdre son historique."""
    inscription = Inscription.objects.filter(eleve=eleve, annee=annee).first()
    if inscription is None:
        return None
    inscription.statut = statut
    inscription.save(update_fields=['statut'])

    if annee.is_current and eleve.classe_id == inscription.classe_id:
        eleve.classe = None
        eleve.save(update_fields=['classe', 'updated_at'])
    return inscription


@transaction.atomic
def promouvoir(annee_source, annee_cible, mapping, statut_sortants=Inscription.Statut.DIPLOME):
    """Passage en classe supérieure : réinscrit en masse les élèves d'une année sur la
    suivante d'après une correspondance classe→classe validée par l'utilisateur.

    `mapping` : {id_classe_source: id_classe_cible}. Une classe source absente du mapping
    (ou pointant sur None) correspond à une promotion de sortie — ses élèves sont clôturés
    avec `statut_sortants` plutôt que réinscrits. C'est le cas des classes de fin de cycle.
    """
    if annee_source.school_id != annee_cible.school_id:
        raise ValueError('Les deux années doivent appartenir à la même école.')

    # Clé en str : `mapping` vient du JSON envoyé par le frontend, où clés et valeurs
    # sont toutes des chaînes (y compris les id de classe) — comparer un id de classe
    # (int) à cette valeur sans normaliser ne matchait jamais, et personne n'était
    # jamais promu.
    classes_cibles = {
        str(c.id): c for c in Classe.objects.filter(school_id=annee_cible.school_id, annee=annee_cible)
    }
    inscriptions = (
        Inscription.objects
        .filter(annee=annee_source, statut=Inscription.Statut.INSCRIT)
        .select_related('eleve')
    )

    promus, sortants = 0, 0
    for inscription in inscriptions:
        cible_id = mapping.get(str(inscription.classe_id)) or mapping.get(inscription.classe_id)
        classe_cible = classes_cibles.get(str(cible_id)) if cible_id else None
        if classe_cible is None:
            cloturer_inscription(inscription.eleve, annee_source, statut_sortants)
            sortants += 1
            continue
        inscrire(inscription.eleve, classe_cible, annee_cible)
        promus += 1

    return {'promus': promus, 'sortants': sortants}
