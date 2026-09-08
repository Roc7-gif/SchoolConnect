from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import EmailMessage
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

password_reset_token = PasswordResetTokenGenerator()


def send_password_reset_email(user):
    """Envoie le lien de réinitialisation à `user`. Ne fait rien si le compte n'a pas
    d'email (compte AfriLab créé sans, ou fiche incomplète)."""
    if not user.email:
        return False
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = password_reset_token.make_token(user)
    link = f'{settings.FRONTEND_URL}/reinitialiser-mot-de-passe/{uid}/{token}'
    message = EmailMessage(
        subject='Réinitialisation de votre mot de passe School Connect',
        body=(
            f'Bonjour {user.first_name or user.username},\n\n'
            f'Cliquez sur ce lien pour choisir un nouveau mot de passe :\n{link}\n\n'
            "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
        ),
        to=[user.email],
    )
    message.send(fail_silently=True)
    return True
