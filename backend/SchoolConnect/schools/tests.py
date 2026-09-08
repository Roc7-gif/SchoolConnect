"""Tests du panneau admin AfriLab : un superuser voit toutes les écoles avec leurs
compteurs, une école normale ne voit que la sienne sans compteurs (non annotés)."""

from academics.models import Eleve
from accounts.models import User
from django.test import TestCase
from parents.models import Parent
from rest_framework.test import APIClient

from .models import School


class SchoolAdminPanelTest(TestCase):
    def setUp(self):
        self.school_a = School.objects.create(name='École A', country='CI')
        self.school_b = School.objects.create(name='École B', country='CI')
        Eleve.objects.create(school=self.school_a, last_name='Koné', first_name='Awa')
        Eleve.objects.create(school=self.school_a, last_name='Traoré', first_name='Ali')
        Parent.objects.create(school=self.school_a, last_name='Koné', first_name='Fatou')

        self.superuser = User.objects.create_superuser(username='afrilab', password='x')
        self.directeur = User.objects.create_user(username='dir', password='x', school=self.school_a)
        self.client = APIClient()

    def test_superuser_voit_toutes_les_ecoles_avec_compteurs(self):
        self.client.force_authenticate(self.superuser)
        resultats = self.client.get('/api/schools/').data['results']
        self.assertEqual(len(resultats), 2)
        ecole_a = next(r for r in resultats if r['id'] == self.school_a.id)
        self.assertEqual(ecole_a['eleves_count'], 2)
        self.assertEqual(ecole_a['parents_count'], 1)

    def test_ecole_normale_ne_voit_que_la_sienne(self):
        self.client.force_authenticate(self.directeur)
        resultats = self.client.get('/api/schools/').data['results']
        self.assertEqual([r['id'] for r in resultats], [self.school_a.id])

    def test_ecole_normale_ne_peut_pas_lire_une_autre_ecole_par_id(self):
        self.client.force_authenticate(self.directeur)
        reponse = self.client.get(f'/api/schools/{self.school_b.id}/')
        self.assertEqual(reponse.status_code, 404)

    def test_ecole_normale_ne_peut_pas_modifier_une_autre_ecole_par_id(self):
        self.client.force_authenticate(self.directeur)
        reponse = self.client.patch(f'/api/schools/{self.school_b.id}/', {'name': 'Piraté'}, format='json')
        self.assertEqual(reponse.status_code, 404)
        self.school_b.refresh_from_db()
        self.assertEqual(self.school_b.name, 'École B')

    def test_superuser_peut_desactiver_une_ecole(self):
        self.client.force_authenticate(self.superuser)
        reponse = self.client.patch(
            f'/api/schools/{self.school_b.id}/', {'is_active': False}, format='json',
        )
        self.assertEqual(reponse.status_code, 200)
        self.school_b.refresh_from_db()
        self.assertFalse(self.school_b.is_active)
