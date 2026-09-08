from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count

from messaging.models import Message
from SchoolConnect.admin_utils import fk_change_link, related_count_link

from .emails import send_password_reset_email
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        'username', 'email', 'first_name', 'last_name', 'school_link',
        'is_staff', 'is_superuser', 'is_active', 'messages_link',
    )
    list_filter = ('school', 'is_staff', 'is_superuser', 'is_active')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('SchoolConnect', {'fields': ('school', 'phone_number')}),
    )
    actions = ('activer', 'desactiver', 'envoyer_lien_reinitialisation')

    school_link = fk_change_link('school')
    messages_link = related_count_link(Message, 'created_by__id__exact', 'messages_count', 'message(s)')

    @admin.action(description='Activer les comptes sélectionnés')
    def activer(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} compte(s) activé(s).')

    @admin.action(description='Désactiver les comptes sélectionnés')
    def desactiver(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} compte(s) désactivé(s).')

    @admin.action(description='Envoyer un lien de réinitialisation de mot de passe')
    def envoyer_lien_reinitialisation(self, request, queryset):
        sent = sum(1 for user in queryset if send_password_reset_email(user))
        skipped = queryset.count() - sent
        message = f'Lien envoyé à {sent} compte(s).'
        if skipped:
            message += f' {skipped} ignoré(s) (pas d\'email renseigné).'
        self.message_user(request, message)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(messages_count=Count('messages', distinct=True))
