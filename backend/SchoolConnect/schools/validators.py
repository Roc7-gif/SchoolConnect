from django.core.validators import RegexValidator

phone_validator = RegexValidator(
    regex=r'^\+[1-9]\d{6,14}$',
    message="Le numéro doit être au format international, ex: +2250700000000",
)
