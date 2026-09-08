from django.conf import settings


class SmsProvider:
    """Interface d'un fournisseur SMS réel. Implémenter `send()` suffit à brancher un
    vrai gateway (ex. SMSPro Africa) sans toucher au reste de `messaging/services.py`."""

    def send(self, contact, body):
        raise NotImplementedError


class SimulatedSmsProvider(SmsProvider):
    """Simulation héritée : ne contacte aucun fournisseur, répond toujours succès."""

    def send(self, contact, body):
        return True, ''


def get_sms_provider():
    """Fournisseur SMS actif, ou None si aucun n'est configuré.

    Aujourd'hui seul le mode simulé existe (`SIMULATE_UNWIRED_CHANNELS=success`) ; un vrai
    fournisseur se branche ici en retournant sa propre implémentation de `SmsProvider`.
    """
    if getattr(settings, 'SIMULATE_UNWIRED_CHANNELS', 'fail') == 'success':
        return SimulatedSmsProvider()
    return None
