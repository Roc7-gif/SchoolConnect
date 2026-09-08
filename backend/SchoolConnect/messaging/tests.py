"""Tests du ciblage, du rendu des variables et de la facturation des envois.

L'enjeu est financier autant que relationnel : un destinataire de trop est un SMS
facturé, et un message mal personnalisé part quand même chez le parent.
"""

from academics import services as academics_services
from academics.models import AnneeScolaire, Classe, CustomFieldDefinition, Eleve, Inscription
from accounts.models import User
from django.core import mail
from django.test import TestCase, override_settings
from parents.models import Parent, StudentGuardian
from rest_framework.test import APIClient
from schools.models import School

from . import variables
from .models import Message, MessageRecipient
from .services import is_per_student, preview_message, resolve_eleves, send_message


class BaseMessagingTest(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='École Test', country='CI', phone_number='+2252700000000')
        self.an_passee = AnneeScolaire.objects.create(school=self.school, label='2024-2025')
        self.an_courante = AnneeScolaire.objects.create(school=self.school, label='2025-2026')
        academics_services.definir_annee_courante(self.an_courante)
        self.an_courante.refresh_from_db()

        self.sixieme = Classe.objects.create(
            school=self.school, annee=self.an_passee, name='6ème A', level='6ème',
        )
        self.cinquieme = Classe.objects.create(
            school=self.school, annee=self.an_courante, name='5ème B', level='5ème',
        )

    def _eleve_avec_parent(self, last_name, first_name, phone, email='', parent=None):
        eleve = Eleve.objects.create(school=self.school, last_name=last_name, first_name=first_name)
        if parent is None:
            parent = Parent.objects.create(
                school=self.school, last_name=last_name, first_name='Parent',
                phone_number=phone, email=email,
            )
        StudentGuardian.objects.create(student=eleve, parent=parent, is_primary_contact=True)
        return eleve, parent

    def _message(self, scope_type=Message.ScopeType.ECOLE, annee=None, body='Réunion samedi', **kwargs):
        return Message.objects.create(
            school=self.school, annee=annee or self.an_courante, body=body,
            scope_type=scope_type, channel=Message.Channel.SMS, **kwargs,
        )


# Le ciblage ne doit pas dépendre de la disponibilité d'une passerelle : on simule le
# succès des canaux non câblés pour n'observer ici que le choix des destinataires.
@override_settings(SIMULATE_UNWIRED_CHANNELS='success')
class CiblageParAnneeTest(BaseMessagingTest):
    def setUp(self):
        super().setUp()
        # Élève présent : monté de 6ème A en 5ème B.
        self.present, _ = self._eleve_avec_parent('Koné', 'Awa', '+2250700000001')
        academics_services.inscrire(self.present, self.sixieme, self.an_passee)
        academics_services.inscrire(self.present, self.cinquieme, self.an_courante)

        # Ancien élève : scolarisé l'an dernier seulement, parti depuis.
        self.ancien, _ = self._eleve_avec_parent('Traoré', 'Ali', '+2250700000002')
        academics_services.inscrire(self.ancien, self.sixieme, self.an_passee)
        academics_services.cloturer_inscription(
            self.ancien, self.an_passee, Inscription.Statut.DIPLOME,
        )

    def test_scope_ecole_exclut_les_anciens_eleves(self):
        """Le bug corrigé : sans année, `ancien` recevait aussi le message."""
        self.assertEqual(list(resolve_eleves(self._message())), [self.present])

    def test_scope_niveau_ne_traverse_pas_les_annees(self):
        courant = self._message(Message.ScopeType.NIVEAU, scope_level='6ème')
        self.assertEqual(list(resolve_eleves(courant)), [])

        passe = self._message(Message.ScopeType.NIVEAU, annee=self.an_passee, scope_level='6ème')
        self.assertEqual(list(resolve_eleves(passe)), [self.present])

    def test_scope_classe_utilise_linscription_et_non_le_cache(self):
        message = self._message(
            Message.ScopeType.CLASSE, annee=self.an_passee, scope_classe=self.sixieme,
        )
        self.assertEqual(list(resolve_eleves(message)), [self.present])

    def test_message_sans_annee_garde_lancien_comportement(self):
        message = self._message(annee=None)
        message.annee = None
        message.save(update_fields=['annee'])
        self.assertEqual(set(resolve_eleves(message)), {self.present, self.ancien})

    def test_apercu_compte_et_facture_sur_la_bonne_annee(self):
        resume = preview_message(self._message())
        self.assertEqual(resume['eleves_count'], 1)
        self.assertEqual(resume['reached'], 1)
        self.assertEqual(resume['unreachable'], 0)

    def test_apercu_ventile_dans_la_classe_de_lannee_consultee(self):
        resume = preview_message(self._message(annee=self.an_passee))
        self.assertEqual([l['classe'] for l in resume['by_classe']], ['6ème A'])


class RenduVariablesTest(BaseMessagingTest):
    """Avant ce chantier, aucune variable n'était substituée : les parents auraient reçu
    « Bonjour {parent_nom} » tel quel."""

    def setUp(self):
        super().setUp()
        CustomFieldDefinition.objects.create(school=self.school, name='Moyenne', slug='moyenne')
        self.eleve, self.parent = self._eleve_avec_parent('Koné', 'Awa', '+2250700000001')
        self.eleve.matricule = 'EL001'
        self.eleve.extra_data = {'moyenne': '14,5'}
        self.eleve.save()
        academics_services.inscrire(self.eleve, self.cinquieme, self.an_courante)

    def _rendu(self, body):
        message = self._message(body=body)
        context = variables.build_context(message, self.eleve, self.parent)
        rendu, _ = variables.render(body, context)
        return rendu

    def test_variables_standard(self):
        self.assertEqual(
            self._rendu('Bonjour {parent_nom}, {eleve_nom} est en {classe} à {ecole}.'),
            'Bonjour Koné, Koné est en 5ème B à École Test.',
        )

    def test_champ_personnalise_importe(self):
        """La demande centrale : toute colonne de l'élève, même créée à l'import."""
        self.assertEqual(self._rendu('Moyenne : {moyenne}'), 'Moyenne : 14,5')

    def test_tiret_et_underscore_equivalents(self):
        CustomFieldDefinition.objects.create(
            school=self.school, name='Moyenne générale', slug='moyenne-generale',
        )
        self.eleve.extra_data = {**self.eleve.extra_data, 'moyenne-generale': '12'}
        self.eleve.save()
        self.assertEqual(self._rendu('{moyenne_generale}/{moyenne-generale}'), '12/12')

    def test_variable_inconnue_devient_vide(self):
        self.assertEqual(self._rendu('Note: {inexistante}.'), 'Note: .')

    def test_variable_vide_devient_vide(self):
        self.eleve.matricule = ''
        self.eleve.save()
        self.assertEqual(self._rendu('Mat: {matricule}.'), 'Mat: .')

    def test_accolade_parasite_ne_casse_pas_lenvoi(self):
        """`str.format` lèverait une exception sur `{}` et ferait échouer tout l'envoi.

        Ici `{}` reste littéral (le motif exige au moins un caractère) et `{0}` est traité
        comme n'importe quelle variable inconnue, donc vidé.
        """
        self.assertEqual(self._rendu('Tarif {} et {0} et {eleve_nom}'), 'Tarif {} et  et Koné')

    def test_corps_rendu_persiste_sur_le_destinataire(self):
        message = self._message(body='Bonjour {parent_nom}, moyenne {moyenne}')
        with override_settings(SIMULATE_UNWIRED_CHANNELS='success'):
            send_message(message)
        recipient = MessageRecipient.objects.get(message=message)
        self.assertEqual(recipient.rendered_body, 'Bonjour Koné, moyenne 14,5')

    def test_apercu_signale_les_variables_vides_et_inconnues(self):
        self.eleve.extra_data = {}
        self.eleve.save()
        message = self._message(body='Moyenne {moyenne}, {inexistante}')
        with override_settings(SIMULATE_UNWIRED_CHANNELS='success'):
            resume = preview_message(message)

        alertes = {a['variable']: a for a in resume['variable_warnings']}
        self.assertEqual(alertes['moyenne']['missing_count'], 1)
        self.assertFalse(alertes['moyenne']['unknown'])
        self.assertTrue(alertes['inexistante']['unknown'])
        self.assertEqual(resume['sample_rendered'], 'Moyenne , ')

    def test_endpoint_variables_expose_les_champs_personnalises(self):
        user = User.objects.create_user(username='dir', password='x', school=self.school)
        client = APIClient()
        client.force_authenticate(user)
        noms = {v['name'] for v in client.get('/api/messages/variables/').data}
        self.assertIn('moyenne', noms)
        self.assertIn('eleve_nom', noms)
        self.assertIn('parent_telephone', noms)


@override_settings(SIMULATE_UNWIRED_CHANNELS='success')
class DeduplicationFamilleTest(BaseMessagingTest):
    """Un parent de deux enfants ne doit être contacté qu'une fois pour un message
    générique, mais une fois par enfant dès que le texte porte une donnée de l'élève."""

    def setUp(self):
        super().setUp()
        CustomFieldDefinition.objects.create(school=self.school, name='Moyenne', slug='moyenne')
        self.aine, self.parent = self._eleve_avec_parent('Koné', 'Awa', '+2250700000001')
        self.cadet, _ = self._eleve_avec_parent('Koné', 'Ali', '', parent=self.parent)
        for eleve, moyenne in ((self.aine, '14'), (self.cadet, '11')):
            eleve.extra_data = {'moyenne': moyenne}
            eleve.save()
            academics_services.inscrire(eleve, self.cinquieme, self.an_courante)

    def test_message_generique_dedouble_pas(self):
        resume = preview_message(self._message(body='Réunion samedi'))
        self.assertEqual(resume['eleves_count'], 2)
        self.assertEqual(resume['messages_count'], 1)
        self.assertTrue(resume['deduplicated'])

    def test_champ_personnalise_rend_le_message_par_eleve(self):
        """Régression protégée : `{moyenne}` varie par enfant, dédupliquer enverrait à la
        fratrie un seul message portant la note d'un seul des deux."""
        self.assertTrue(is_per_student('Moyenne : {moyenne}', self.school))

        resume = preview_message(self._message(body='Moyenne de {eleve_prenom} : {moyenne}'))
        self.assertEqual(resume['messages_count'], 2)
        self.assertFalse(resume['deduplicated'])

    def test_variable_parent_ne_rend_pas_le_message_par_eleve(self):
        self.assertFalse(is_per_student('Bonjour {parent_nom}, réunion samedi', self.school))


class EnvoiEmailTest(BaseMessagingTest):
    """L'email est le seul canal réellement câblé (Resend). Avec les canaux non câblés en
    échec, la cascade doit y aboutir — c'est ce qui rend le flux testable de bout en bout."""

    def setUp(self):
        super().setUp()
        self.eleve, self.parent = self._eleve_avec_parent(
            'Koné', 'Awa', '+2250700000001', email='parent@example.com',
        )
        academics_services.inscrire(self.eleve, self.cinquieme, self.an_courante)

    @override_settings(SIMULATE_UNWIRED_CHANNELS='fail')
    def test_cascade_retombe_sur_lemail_reellement_envoye(self):
        message = self._message(body='Bonjour {parent_nom}, {eleve_nom} est en {classe}.')
        message.channel = Message.Channel.CASCADE
        message.save(update_fields=['channel'])
        send_message(message)

        self.assertEqual(len(mail.outbox), 1)
        envoi = mail.outbox[0]
        self.assertEqual(envoi.to, ['parent@example.com'])
        self.assertEqual(envoi.body, 'Bonjour Koné, Koné est en 5ème B.')
        # Objet vide => nom de l'école.
        self.assertEqual(envoi.subject, 'École Test')

        recipient = MessageRecipient.objects.get(message=message)
        self.assertEqual(recipient.channel_used, Message.Channel.EMAIL)
        self.assertEqual(recipient.cost, 0)
        self.assertEqual(
            [(a['channel'], a['status']) for a in recipient.attempts],
            [('SMS', 'ECHEC'), ('WHATSAPP', 'ECHEC'), ('EMAIL', 'ENVOYE')],
        )

    @override_settings(SIMULATE_UNWIRED_CHANNELS='fail')
    def test_objet_personnalise_rendu(self):
        message = self._message(body='Corps', subject='Bulletin de {eleve_prenom}')
        message.channel = Message.Channel.EMAIL
        message.save(update_fields=['channel'])
        send_message(message)
        self.assertEqual(mail.outbox[0].subject, 'Bulletin de Awa')

    @override_settings(SIMULATE_UNWIRED_CHANNELS='fail')
    def test_sms_seul_echoue_sans_passerelle(self):
        message = self._message(body='Corps')
        send_message(message)
        self.assertEqual(len(mail.outbox), 0)
        message.refresh_from_db()
        self.assertEqual(message.status, Message.Status.ECHEC)
        self.assertEqual(message.cost, 0)

    @override_settings(SIMULATE_UNWIRED_CHANNELS='fail')
    def test_apercu_et_envoi_annoncent_le_meme_cout(self):
        """Invariant : l'aperçu ne doit pas pouvoir diverger de l'envoi réel. Sans la
        règle de canal câblé côté dry_run, il annoncerait un coût SMS ici."""
        message = self._message(body='Corps')
        message.channel = Message.Channel.CASCADE
        message.save(update_fields=['channel'])

        resume = preview_message(message)
        send_message(message)
        message.refresh_from_db()

        self.assertEqual(resume['cost'], message.cost)
        self.assertEqual(resume['reached'], 1)
        self.assertEqual(
            resume['by_channel'], [{'channel': Message.Channel.EMAIL, 'count': 1}],
        )


@override_settings(SIMULATE_UNWIRED_CHANNELS='success')
class FacturationTest(BaseMessagingTest):
    def setUp(self):
        super().setUp()
        self.eleve, _ = self._eleve_avec_parent('Koné', 'Awa', '+2250700000001')
        academics_services.inscrire(self.eleve, self.cinquieme, self.an_courante)
        self.user = User.objects.create_user(username='dir', password='x', school=self.school)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_releve_agrege_les_envois_du_mois(self):
        send_message(self._message(body='Un'))
        send_message(self._message(body='Deux'))

        data = self.client.get('/api/billing/summary/').data
        self.assertEqual(data['current_month']['messages_count'], 2)
        self.assertEqual(data['current_month']['cost'], 50)  # 2 SMS à 25
        self.assertEqual(
            data['current_month']['by_channel'],
            [{'channel': 'SMS', 'count': 2, 'cost': 50}],
        )
        self.assertEqual(len(data['recent_messages']), 2)
        self.assertEqual(data['months'][0]['messages_count'], 2)

    def test_les_destinataires_en_echec_ne_sont_pas_factures(self):
        sans_contact = Eleve.objects.create(school=self.school, last_name='X', first_name='Y')
        academics_services.inscrire(sans_contact, self.cinquieme, self.an_courante)
        send_message(self._message(body='Un'))

        data = self.client.get('/api/billing/summary/').data
        self.assertEqual(data['current_month']['messages_count'], 1)
        self.assertEqual(data['current_month']['cost'], 25)

    def test_releve_cloisonne_par_ecole(self):
        autre = School.objects.create(name='Autre', country='CI')
        autre_annee = AnneeScolaire.objects.create(school=autre, label='2025-2026')
        Message.objects.create(
            school=autre, annee=autre_annee, body='X',
            scope_type=Message.ScopeType.ECOLE, channel=Message.Channel.SMS,
            recipient_count=5, cost=125, status=Message.Status.ENVOYE,
            sent_at=self.an_courante.created_at,
        )
        send_message(self._message(body='Un'))

        data = self.client.get('/api/billing/summary/').data
        self.assertEqual(len(data['recent_messages']), 1)
        self.assertEqual(data['current_month']['cost'], 25)
