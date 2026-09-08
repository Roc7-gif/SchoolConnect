"""Tests de l'import, au niveau API.

C'est ici que vivait la perte d'historique : le commit écrivait `eleve.classe`, donc un
ré-import de rentrée effaçait la scolarité de l'année précédente.
"""

from academics import services as academics_services
from academics.models import AnneeScolaire, Classe, Eleve, Inscription
from accounts.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from schools.models import School

from .matching import build_plan


class ImportAnneeTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École Test', country='CI')
        self.an1 = AnneeScolaire.objects.create(school=self.school, label='2025-2026')
        self.an2 = AnneeScolaire.objects.create(school=self.school, label='2026-2027')
        academics_services.definir_annee_courante(self.an1)
        self.an1.refresh_from_db()

        self.user = User.objects.create_user(
            username='directeur', password='motdepasse', school=self.school,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _commit(self, annee, classe_name, eleve, match_id=None):
        return self.client.post(
            '/api/imports/commit/',
            {
                'annee': annee.id,
                'classes': [
                    {'ref': 'c0', 'source_name': classe_name, 'action': 'create',
                     'name': classe_name, 'level': ''},
                ],
                'rows': [
                    {
                        'first_name': eleve[0], 'last_name': eleve[1], 'classe_ref': 'c0',
                        'match_id': match_id, 'sexe': '', 'date_of_birth': '',
                        'matricule': eleve[2], 'extra': {},
                        'parent_first_name': '', 'parent_last_name': '', 'parent_phone': '',
                    },
                ],
            },
            format='json',
        )

    def test_import_de_rentree_conserve_lannee_precedente(self):
        """Le scénario complet : un élève importé en 6ème A, puis réimporté en 5ème B
        l'année suivante, doit garder ses deux inscriptions."""
        self._commit(self.an1, '6ème A', ('Awa', 'Koné', 'EL001'))
        eleve = Eleve.objects.get(matricule='EL001')
        self.assertEqual(eleve.classe_pour(self.an1).name, '6ème A')

        self._commit(self.an2, '5ème B', ('Awa', 'Koné', 'EL001'), match_id=eleve.id)

        eleve.refresh_from_db()
        self.assertEqual(eleve.inscriptions.count(), 2)
        self.assertEqual(eleve.classe_pour(self.an1).name, '6ème A')
        self.assertEqual(eleve.classe_pour(self.an2).name, '5ème B')
        # Un seul élève : le rapprochement a bien joué, pas de doublon.
        self.assertEqual(Eleve.objects.filter(school=self.school).count(), 1)

    def test_cache_classe_suit_lannee_courante_seulement(self):
        self._commit(self.an1, '6ème A', ('Awa', 'Koné', 'EL001'))
        eleve = Eleve.objects.get(matricule='EL001')

        # Import sur 2026-2027, qui n'est pas l'année en cours.
        self._commit(self.an2, '5ème B', ('Awa', 'Koné', 'EL001'), match_id=eleve.id)

        eleve.refresh_from_db()
        self.assertEqual(eleve.classe.name, '6ème A')

    def test_meme_nom_de_classe_sur_deux_annees(self):
        self._commit(self.an1, '6ème A', ('Awa', 'Koné', 'EL001'))
        self._commit(self.an2, '6ème A', ('Ali', 'Traoré', 'EL002'))

        classes = Classe.objects.filter(school=self.school, name='6ème A')
        self.assertEqual(classes.count(), 2)
        self.assertEqual({c.annee_id for c in classes}, {self.an1.id, self.an2.id})

    def test_import_sans_annee_definie_est_refuse(self):
        AnneeScolaire.objects.filter(school=self.school).delete()
        reponse = self.client.post('/api/imports/commit/', {'classes': [], 'rows': []}, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('annee', reponse.data)


class MatchingAnneeTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École Test', country='CI')
        self.an1 = AnneeScolaire.objects.create(school=self.school, label='2025-2026')
        self.an2 = AnneeScolaire.objects.create(school=self.school, label='2026-2027')
        self.sixieme_an1 = Classe.objects.create(school=self.school, annee=self.an1, name='6ème A')

    def test_le_rapprochement_de_classe_ne_traverse_pas_les_annees(self):
        """Une « 6ème A » importée sur 2026-2027 ne doit pas se rapprocher de celle de
        2025-2026, sinon la nouvelle promotion atterrirait dans l'ancienne classe."""
        plan = build_plan([{'classe_name': '6ème A', 'first_name': 'Awa', 'last_name': 'Koné'}],
                          self.school, self.an2)
        self.assertEqual(plan['classes'][0]['action'], 'create')

        plan_an1 = build_plan([{'classe_name': '6ème A', 'first_name': 'Awa', 'last_name': 'Koné'}],
                              self.school, self.an1)
        self.assertEqual(plan_an1['classes'][0]['action'], 'match')
        self.assertEqual(plan_an1['classes'][0]['match_id'], self.sixieme_an1.id)

    def test_un_eleve_diplome_nest_plus_propose_au_rapprochement(self):
        eleve = Eleve.objects.create(school=self.school, first_name='Awa', last_name='Koné')
        academics_services.inscrire(eleve, self.sixieme_an1, self.an1)
        academics_services.cloturer_inscription(eleve, self.an1, Inscription.Statut.DIPLOME)

        plan = build_plan([{'classe_name': '6ème A', 'first_name': 'Awa', 'last_name': 'Koné'}],
                          self.school, self.an2)
        self.assertIsNone(plan['rows'][0]['match_id'])

    def test_un_eleve_encore_inscrit_reste_rapprochable(self):
        """Il monte de classe : on doit le reconnaître pour ne pas le dupliquer."""
        eleve = Eleve.objects.create(school=self.school, first_name='Awa', last_name='Koné')
        academics_services.inscrire(eleve, self.sixieme_an1, self.an1)

        plan = build_plan([{'classe_name': '5ème B', 'first_name': 'Awa', 'last_name': 'Koné'}],
                          self.school, self.an2)
        self.assertEqual(plan['rows'][0]['match_id'], eleve.id)
