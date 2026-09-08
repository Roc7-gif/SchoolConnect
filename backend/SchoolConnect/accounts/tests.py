"""Tests du flux de réinitialisation de mot de passe.

Le token est stateless (`PasswordResetTokenGenerator`, dérivé du hash du mot de passe et
d'un timestamp) : pas de nouveau champ DB, mais un token doit être invalidé dès que le mot
de passe change, et la demande ne doit jamais révéler si un email existe en base.
"""

from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import mail
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from schools.models import School

from .models import User

password_reset_token = PasswordResetTokenGenerator()


class PasswordResetTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École A', country='CI')
        self.user = User.objects.create_user(
            username='dir', email='dir@ecole-a.test', password='ancien-mdp-123', school=self.school,
        )
        self.client = APIClient()

    def _reset_link_parts(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = password_reset_token.make_token(self.user)
        return uid, token

    def test_demande_avec_email_existant_envoie_un_email(self):
        reponse = self.client.post('/api/password-reset/', {'email': self.user.email}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.first_name or self.user.username, mail.outbox[0].body)

    def test_demande_avec_email_inconnu_repond_pareil_sans_envoyer_email(self):
        reponse = self.client.post('/api/password-reset/', {'email': 'inconnu@ecole-a.test'}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirmation_avec_token_valide_change_le_mot_de_passe(self):
        uid, token = self._reset_link_parts()
        reponse = self.client.post(
            '/api/password-reset/confirm/',
            {'uid': uid, 'token': token, 'new_password': 'nouveau-mdp-456'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('nouveau-mdp-456'))

    def test_confirmation_avec_token_invalide_echoue(self):
        uid, _token = self._reset_link_parts()
        reponse = self.client.post(
            '/api/password-reset/confirm/',
            {'uid': uid, 'token': 'faux-token', 'new_password': 'nouveau-mdp-456'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ancien-mdp-123'))

    def test_token_invalide_apres_changement_de_mot_de_passe(self):
        uid, token = self._reset_link_parts()
        self.user.set_password('mdp-change-entre-temps-789')
        self.user.save()
        reponse = self.client.post(
            '/api/password-reset/confirm/',
            {'uid': uid, 'token': token, 'new_password': 'nouveau-mdp-456'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)


class ProfileUpdateTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École A', country='CI')
        self.user = User.objects.create_user(
            username='dir', email='dir@ecole-a.test', password='ancien-mdp-123', school=self.school,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_met_a_jour_le_nom(self):
        reponse = self.client.patch('/api/me/', {'first_name': 'Nouveau'}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Nouveau')

    def test_changement_de_mdp_sans_mdp_actuel_echoue(self):
        reponse = self.client.patch('/api/me/', {'new_password': 'nouveau-mdp-456'}, format='json')
        self.assertEqual(reponse.status_code, 400)

    def test_changement_de_mdp_avec_mauvais_mdp_actuel_echoue(self):
        reponse = self.client.patch(
            '/api/me/',
            {'current_password': 'mauvais', 'new_password': 'nouveau-mdp-456'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ancien-mdp-123'))

    def test_changement_de_mdp_avec_bon_mdp_actuel_reussit(self):
        reponse = self.client.patch(
            '/api/me/',
            {'current_password': 'ancien-mdp-123', 'new_password': 'nouveau-mdp-456'},
            format='json',
        )
        self.assertEqual(reponse.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('nouveau-mdp-456'))


class RegisterTest(TestCase):
    """`/api/register/` crée l'école et le compte ensemble : c'est la seule façon
    d'obtenir une école dans le système (pas de création manuelle par un tiers)."""

    def setUp(self):
        self.client = APIClient()
        self.payload = {
            'school_name': 'École Nouvelle',
            'school_country': 'CI',
            'username': 'directeur1',
            'email': 'directeur1@ecole-nouvelle.test',
            'first_name': 'Awa',
            'last_name': 'Koné',
            'password': 'mot-de-passe-solide-123',
        }

    def test_inscription_cree_ecole_et_connecte_lutilisateur(self):
        reponse = self.client.post('/api/register/', self.payload, format='json')
        self.assertEqual(reponse.status_code, 201)

        user = User.objects.get(username='directeur1')
        self.assertEqual(user.school.name, 'École Nouvelle')
        self.assertTrue(user.check_password('mot-de-passe-solide-123'))

        # La session ouverte par le register doit permettre d'appeler /api/me/ sans relogin.
        moi = self.client.get('/api/me/')
        self.assertEqual(moi.status_code, 200)
        self.assertEqual(moi.data['username'], 'directeur1')

    def test_inscription_username_deja_pris_refusee(self):
        User.objects.create_user(username='directeur1', password='autre-mdp-123')
        reponse = self.client.post('/api/register/', self.payload, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('username', reponse.data)

    def test_inscription_email_deja_utilise_refusee(self):
        User.objects.create_user(username='autre', email=self.payload['email'], password='autre-mdp-123')
        reponse = self.client.post('/api/register/', self.payload, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('email', reponse.data)

    def test_inscription_mot_de_passe_trop_faible_refusee(self):
        self.payload['password'] = '1234'
        reponse = self.client.post('/api/register/', self.payload, format='json')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('password', reponse.data)
        self.assertEqual(User.objects.filter(username='directeur1').count(), 0)

    def test_inscription_echouee_ne_cree_pas_decole_orpheline(self):
        """L'école et le compte sont créés dans la même transaction : un mot de passe
        refusé après coup ne doit pas laisser une École sans utilisateur derrière."""
        from schools.models import School

        self.payload['password'] = '1234'
        self.client.post('/api/register/', self.payload, format='json')
        self.assertEqual(School.objects.filter(name='École Nouvelle').count(), 0)


class LoginTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École A', country='CI')
        self.user = User.objects.create_user(
            username='dir', email='dir@ecole-a.test', password='mot-de-passe-123', school=self.school,
        )
        self.client = APIClient()

    def test_connexion_reussie_ouvre_une_session(self):
        reponse = self.client.post('/api/login/', {'username': 'dir', 'password': 'mot-de-passe-123'}, format='json')
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse.data['username'], 'dir')

        moi = self.client.get('/api/me/')
        self.assertEqual(moi.status_code, 200)

    def test_connexion_mauvais_mot_de_passe_refusee(self):
        reponse = self.client.post('/api/login/', {'username': 'dir', 'password': 'mauvais'}, format='json')
        self.assertEqual(reponse.status_code, 401)

    def test_connexion_utilisateur_inconnu_refusee(self):
        reponse = self.client.post('/api/login/', {'username': 'fantome', 'password': 'peu-importe'}, format='json')
        self.assertEqual(reponse.status_code, 401)

    def test_deconnexion_termine_la_session(self):
        # `force_authenticate` court-circuite la session : pour vérifier que le logout
        # la termine réellement, il faut passer par un vrai login (cookie de session).
        self.client.post('/api/login/', {'username': 'dir', 'password': 'mot-de-passe-123'}, format='json')
        self.client.post('/api/logout/')

        moi = self.client.get('/api/me/')
        self.assertIn(moi.status_code, (401, 403))

    def test_me_sans_authentification_refusee(self):
        moi = self.client.get('/api/me/')
        self.assertIn(moi.status_code, (401, 403))
