"""Tests du cloisonnement des parents par école.

Avant l'ajout de `Parent.school`, une fiche parent n'appartenait à personne : l'import
la rapprochait par téléphone sur toute la base, si bien que deux écoles important le même
numéro partageaient la fiche — et que l'une pouvait modifier les coordonnées de l'autre.
"""

from academics import services as academics_services
from academics.models import AnneeScolaire, Classe, Eleve
from accounts.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient
from schools.models import School

from .models import Parent, StudentGuardian


class BaseParentTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École A', country='CI')
        self.autre_school = School.objects.create(name='École B', country='CI')

        self.annee = AnneeScolaire.objects.create(school=self.school, label='2025-2026')
        academics_services.definir_annee_courante(self.annee)
        self.classe = Classe.objects.create(school=self.school, annee=self.annee, name='6ème A')

        self.user = User.objects.create_user(username='dir', password='x', school=self.school)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.parent = Parent.objects.create(
            school=self.school, last_name='Koné', first_name='Fatou',
            phone_number='+2250700000001',
        )
        self.parent_autre = Parent.objects.create(
            school=self.autre_school, last_name='Traoré', first_name='Ali',
            phone_number='+2250700000002',
        )


class CloisonnementParentTest(BaseParentTest):
    def test_liste_ne_montre_que_les_parents_de_lecole(self):
        resultats = self.client.get('/api/parents/').data['results']
        self.assertEqual([p['id'] for p in resultats], [self.parent.id])

    def test_parent_dune_autre_ecole_non_modifiable(self):
        reponse = self.client.patch(
            f'/api/parents/{self.parent_autre.id}/', {'first_name': 'Piraté'}, format='json',
        )
        self.assertEqual(reponse.status_code, 404)
        self.parent_autre.refresh_from_db()
        self.assertEqual(self.parent_autre.first_name, 'Ali')

    def test_creation_rattache_a_lecole_de_lutilisateur(self):
        reponse = self.client.post(
            '/api/parents/',
            {'last_name': 'Diallo', 'first_name': 'Awa', 'phone_number': '+2250700000009'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 201)
        self.assertEqual(Parent.objects.get(id=reponse.data['id']).school, self.school)

    def test_parent_sans_enfant_reste_visible(self):
        """La liste filtre désormais sur la fiche et non sur l'école des enfants : un
        parent créé à la main, pas encore rattaché, ne doit pas disparaître."""
        resultats = self.client.get('/api/parents/').data['results']
        self.assertIn(self.parent.id, [p['id'] for p in resultats])

    def test_rattachement_a_un_parent_dune_autre_ecole_refuse(self):
        eleve = Eleve.objects.create(school=self.school, last_name='Koné', first_name='Awa')
        academics_services.inscrire(eleve, self.classe, self.annee)

        reponse = self.client.post(
            '/api/student-guardians/',
            {'student': eleve.id, 'parent': self.parent_autre.id, 'relationship': 'MERE'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('parent', reponse.data)

    def test_meme_telephone_autorise_dans_deux_ecoles(self):
        """Un même numéro peut légitimement exister dans deux établissements : chacun a
        sa propre fiche, indépendante."""
        Parent.objects.create(
            school=self.autre_school, last_name='Koné', first_name='Fatou',
            phone_number='+2250700000001',
        )
        self.assertEqual(Parent.objects.filter(phone_number='+2250700000001').count(), 2)

    def test_doublon_de_telephone_refuse_dans_une_meme_ecole(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Parent.objects.create(
                school=self.school, last_name='Autre', first_name='Personne',
                phone_number='+2250700000001',
            )

    def test_plusieurs_parents_sans_telephone_autorises(self):
        """La contrainte d'unicité est conditionnelle : sans elle, deux fiches sans
        numéro entreraient en collision."""
        Parent.objects.create(school=self.school, last_name='A', first_name='A', phone_number='')
        Parent.objects.create(school=self.school, last_name='B', first_name='B', phone_number='')
        self.assertEqual(Parent.objects.filter(school=self.school, phone_number='').count(), 2)


class ImportParentTest(BaseParentTest):
    def test_import_ne_rapproche_pas_un_parent_dune_autre_ecole(self):
        """Le correctif de la fuite : le numéro existe déjà dans l'École B, l'import de
        l'École A doit créer sa propre fiche au lieu de réutiliser celle du voisin."""
        reponse = self.client.post(
            '/api/imports/commit/',
            {
                'annee': self.annee.id,
                'classes': [
                    {'ref': 'c0', 'source_name': '6ème A', 'action': 'match',
                     'match_id': self.classe.id, 'name': '6ème A', 'level': ''},
                ],
                'rows': [{
                    'first_name': 'Awa', 'last_name': 'Diallo', 'classe_ref': 'c0',
                    'match_id': None, 'sexe': '', 'date_of_birth': '', 'matricule': '',
                    'extra': {},
                    'parent_first_name': 'Ali', 'parent_last_name': 'Traoré',
                    'parent_phone': '+2250700000002',
                }],
            },
            format='json',
        )
        self.assertEqual(reponse.status_code, 201)

        fiches = Parent.objects.filter(phone_number='+2250700000002')
        self.assertEqual(fiches.count(), 2)
        self.assertEqual({f.school_id for f in fiches}, {self.school.id, self.autre_school.id})
        # Le parent de l'autre école n'a récupéré aucun enfant au passage.
        self.assertEqual(StudentGuardian.objects.filter(parent=self.parent_autre).count(), 0)
