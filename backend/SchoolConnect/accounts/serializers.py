from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from schools.models import School

from .models import User


class RegisterSerializer(serializers.Serializer):
    school_name = serializers.CharField(max_length=255)
    school_country = serializers.CharField(max_length=100)
    school_city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    school_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec cet email.")
        return value

    def validate_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

    def create(self, validated_data):
        with transaction.atomic():
            school = School.objects.create(
                name=validated_data['school_name'],
                country=validated_data['school_country'],
                city=validated_data.get('school_city', ''),
                phone_number=validated_data.get('school_phone', ''),
            )
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                first_name=validated_data['first_name'],
                last_name=validated_data['last_name'],
                password=validated_data['password'],
                school=school,
            )
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value


class ProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    current_password = serializers.CharField(write_only=True, required=False)
    new_password = serializers.CharField(write_only=True, required=False)

    def validate(self, attrs):
        if attrs.get('new_password') and not attrs.get('current_password'):
            raise serializers.ValidationError(
                {'current_password': 'Requis pour changer de mot de passe.'}
            )
        return attrs

    def validate_new_password(self, value):
        try:
            django_validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

    def save(self, **kwargs):
        user = self.instance
        for field in ('first_name', 'last_name', 'phone_number'):
            if field in self.validated_data:
                setattr(user, field, self.validated_data[field])
        new_password = self.validated_data.get('new_password')
        if new_password:
            if not user.check_password(self.validated_data['current_password']):
                raise serializers.ValidationError(
                    {'current_password': 'Mot de passe actuel incorrect.'}
                )
            user.set_password(new_password)
        user.save()
        return user
