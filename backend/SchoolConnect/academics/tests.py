"""Tests du cloisonnement par année scolaire et de la cohérence inscriptions / cache."""

from accounts.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from schools.models import School

from . import services
from .models import AnneeScolaire, Classe, Eleve, Inscription


class BaseAnneeTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École Test', country='CI')
        self.an1 = AnneeScolaire.objects.create(school=self.school, label='2024-2025')
        self.an2 = AnneeScolaire.objects.create(school=self.school, label='2025-2026')
        services.definir_annee_courante(self.an2)
        self.an1.refresh_from_db()
        self.an2.refresh_from_db()

        self.sixieme = Classe.objects.create(school=self.school, annee=self.an1, name='6ème A', level='6ème')
        self.cinquieme = Classe.objects.create(school=self.school, annee=self.an2, name='5ème B', level='5ème')

    def _eleve(self, last_name='Koné', first_name='Awa'):
        return Eleve.objects.create(school=self.school, last_name=last_name, first_name=first_name)


class AnneeCouranteTest(BaseAnneeTest):
    def test_une_seule_annee_courante(self):
        self.assertTrue(self.an2.is_current)
        self.assertFalse(self.an1.is_current)

    def test_bascule_decoche_la_precedente(self):
        services.definir_annee_courante(self.an1)
        self.an1.refresh_from_db()
        self.an2.refresh_from_db()
        self.assertTrue(self.an1.is_current)
        self.assertFalse(self.an2.is_current)
        self.assertEqual(AnneeScolaire.objects.filter(school=self.school, is_current=True).count(), 1)

    def test_deux_annees_courantes_refusees_en_base(self):
        """La contrainte partielle doit rejeter l'incohérence même si on court-circuite
        le service — c'est tout l'intérêt de la poser en base."""
        with self.assertRaises(IntegrityError), transaction.atomic():
            AnneeScolaire.objects.create(school=self.school, label='2026-2027', is_current=True)

    def test_meme_nom_de_classe_sur_deux_annees(self):
        """Le blocage principal de l'ancien schéma : une « 6ème A » par année."""
        Classe.objects.create(school=self.school, annee=self.an2, name='6ème A', level='6ème')
        self.assertEqual(Classe.objects.filter(school=self.school, name='6ème A').count(), 2)

    def test_doublon_dans_la_meme_annee_refuse(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Classe.objects.create(school=self.school, annee=self.an1, name='6ème A')


class InscriptionTest(BaseAnneeTest):
    def test_inscrire_annee_courante_met_a_jour_le_cache(self):
        eleve = self._eleve()
        services.inscrire(eleve, self.cinquieme, self.an2)
        eleve.refresh_from_db()
        self.assertEqual(eleve.classe, self.cinquieme)

    def test_inscrire_annee_passee_ne_touche_pas_le_cache(self):
        """Compléter l'historique ne doit pas changer la classe affichée aujourd'hui."""
        eleve = self._eleve()
        services.inscrire(eleve, self.cinquieme, self.an2)
        services.inscrire(eleve, self.sixieme, self.an1)
        eleve.refresh_from_db()
        self.assertEqual(eleve.classe, self.cinquieme)
        self.assertEqual(eleve.inscriptions.count(), 2)

    def test_historique_conserve_lors_du_passage_de_classe(self):
        """La régression que corrige tout ce chantier : l'ancien import écrasait
        `eleve.classe` et perdait l'année précédente."""
        eleve = self._eleve()
        services.inscrire(eleve, self.sixieme, self.an1)
        services.inscrire(eleve, self.cinquieme, self.an2)

        self.assertEqual(eleve.classe_pour(self.an1), self.sixieme)
        self.assertEqual(eleve.classe_pour(self.an2), self.cinquieme)

    def test_un_eleve_une_seule_classe_par_annee(self):
        eleve = self._eleve()
        autre_5e = Classe.objects.create(school=self.school, annee=self.an2, name='5ème C')
        services.inscrire(eleve, self.cinquieme, self.an2)
        services.inscrire(eleve, autre_5e, self.an2)

        self.assertEqual(eleve.inscriptions.filter(annee=self.an2).count(), 1)
        self.assertEqual(eleve.classe_pour(self.an2), autre_5e)

    def test_pour_annee_ne_retourne_que_les_inscrits(self):
        present = self._eleve('Koné', 'Awa')
        parti = self._eleve('Traoré', 'Ali')
        services.inscrire(present, self.cinquieme, self.an2)
        services.inscrire(parti, self.cinquieme, self.an2)
        services.cloturer_inscription(parti, self.an2, Inscription.Statut.PARTI)

        inscrits = Eleve.objects.pour_annee(self.an2)
        self.assertIn(present, inscrits)
        self.assertNotIn(parti, inscrits)

    def test_cloture_vide_le_cache_sur_annee_courante(self):
        eleve = self._eleve()
        services.inscrire(eleve, self.cinquieme, self.an2)
        services.cloturer_inscription(eleve, self.an2, Inscription.Statut.PARTI)
        eleve.refresh_from_db()
        self.assertIsNone(eleve.classe)

    def test_eleve_absent_dune_annee_ou_il_nest_pas_inscrit(self):
        eleve = self._eleve()
        services.inscrire(eleve, self.cinquieme, self.an2)
        self.assertNotIn(eleve, Eleve.objects.pour_annee(self.an1))


class PromotionTest(BaseAnneeTest):
    def test_promouvoir_reinscrit_et_conserve_lhistorique(self):
        eleve = self._eleve()
        services.inscrire(eleve, self.sixieme, self.an1)

        resultat = services.promouvoir(self.an1, self.an2, {str(self.sixieme.id): self.cinquieme.id})

        self.assertEqual(resultat, {'promus': 1, 'sortants': 0})
        self.assertEqual(eleve.classe_pour(self.an1), self.sixieme)
        self.assertEqual(eleve.classe_pour(self.an2), self.cinquieme)

    def test_classe_absente_du_mapping_sort_les_eleves(self):
        """Fin de cycle : sans classe cible, les élèves sont diplômés, pas promus."""
        eleve = self._eleve()
        services.inscrire(eleve, self.sixieme, self.an1)

        resultat = services.promouvoir(self.an1, self.an2, {})

        self.assertEqual(resultat, {'promus': 0, 'sortants': 1})
        inscription = eleve.inscriptions.get(annee=self.an1)
        self.assertEqual(inscription.statut, Inscription.Statut.DIPLOME)
        self.assertNotIn(eleve, Eleve.objects.pour_annee(self.an2))

    def test_promotion_entre_ecoles_refusee(self):
        autre_ecole = School.objects.create(name='Autre', country='CI')
        annee_autre = AnneeScolaire.objects.create(school=autre_ecole, label='2025-2026')
        with self.assertRaises(ValueError):
            services.promouvoir(self.an1, annee_autre, {})


class ApiCloisonnementTest(BaseAnneeTest):
    """Le cloisonnement doit tenir au niveau des endpoints, pas seulement du modèle."""

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username='directeur', password='motdepasse', school=self.school,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.eleve = self._eleve()
        services.inscrire(self.eleve, self.sixieme, self.an1)
        services.inscrire(self.eleve, self.cinquieme, self.an2)

    def test_liste_eleves_sans_parametre_utilise_lannee_courante(self):
        reponse = self.client.get('/api/eleves/')
        resultats = reponse.data['results']
        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0]['classe_name'], '5ème B')

    def test_liste_eleves_sur_annee_passee_montre_la_classe_dalors(self):
        reponse = self.client.get('/api/eleves/', {'annee': self.an1.id})
        resultats = reponse.data['results']
        self.assertEqual(len(resultats), 1)
        self.assertEqual(resultats[0]['classe_name'], '6ème A')

    def test_annee_vide_ne_retourne_aucun_eleve(self):
        an3 = AnneeScolaire.objects.create(school=self.school, label='2026-2027')
        reponse = self.client.get('/api/eleves/', {'annee': an3.id})
        self.assertEqual(reponse.data['results'], [])

    def test_liste_classes_cloisonnee_par_annee(self):
        reponse = self.client.get('/api/classes/', {'annee': self.an1.id})
        noms = [c['name'] for c in reponse.data['results']]
        self.assertEqual(noms, ['6ème A'])

    def test_parcours_expose_lhistorique_complet(self):
        reponse = self.client.get(f'/api/eleves/{self.eleve.id}/')
        parcours = reponse.data['parcours']
        self.assertEqual(
            [(p['annee_label'], p['classe_name']) for p in parcours],
            [('2025-2026', '5ème B'), ('2024-2025', '6ème A')],
        )

    def test_creation_eleve_cree_une_inscription(self):
        reponse = self.client.post(
            '/api/eleves/',
            {'first_name': 'Ali', 'last_name': 'Traoré', 'classe': self.cinquieme.id},
            format='json',
        )
        self.assertEqual(reponse.status_code, 201)
        nouveau = Eleve.objects.get(id=reponse.data['id'])
        self.assertEqual(nouveau.classe_pour(self.an2), self.cinquieme)
        self.assertEqual(nouveau.classe, self.cinquieme)

    def test_definir_courante_bascule_lannee(self):
        reponse = self.client.post(f'/api/annees/{self.an1.id}/definir-courante/')
        self.assertEqual(reponse.status_code, 200)
        self.an1.refresh_from_db()
        self.an2.refresh_from_db()
        self.assertTrue(self.an1.is_current)
        self.assertFalse(self.an2.is_current)

    def test_filtre_sans_classe_annee_courante(self):
        sans_classe = self._eleve(last_name='Diallo', first_name='Fatou')
        reponse = self.client.get('/api/eleves/', {'classe': 'sans-classe'})
        ids = [e['id'] for e in reponse.data['results']]
        self.assertEqual(ids, [sans_classe.id])

    def test_filtre_sans_classe_annee_passee(self):
        # Inscrit sur an1 (via self.eleve dans setUp) : n'est pas « sans classe » cette année-là.
        sans_classe_an1 = self._eleve(last_name='Diallo', first_name='Fatou')
        services.inscrire(sans_classe_an1, self.cinquieme, self.an2)  # inscrit sur an2 seulement

        reponse = self.client.get('/api/eleves/', {'classe': 'sans-classe', 'annee': self.an1.id})
        ids = [e['id'] for e in reponse.data['results']]
        self.assertEqual(ids, [sans_classe_an1.id])

    def test_classe_dune_autre_ecole_refusee(self):
        autre = School.objects.create(name='Autre', country='CI')
        annee_autre = AnneeScolaire.objects.create(school=autre, label='2025-2026')
        classe_autre = Classe.objects.create(school=autre, annee=annee_autre, name='6ème Z')

        reponse = self.client.post(
            '/api/eleves/',
            {'first_name': 'X', 'last_name': 'Y', 'classe': classe_autre.id},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
