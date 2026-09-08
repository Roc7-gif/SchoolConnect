from django.contrib import admin
from django.db.models import Count
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from academics.models import Classe, Eleve
from accounts.models import User
from messaging.models import Message
from messaging.services import CHANNEL_LIMIT_FIELDS, channel_usage
from parents.models import Parent
from SchoolConnect.admin_utils import related_count_link

from .models import School


class StaffInline(admin.TabularInline):
    """Affiche le(s) compte(s) propriétaire(s) de l'école directement sur sa fiche —
    la gestion complète (mot de passe, droits) reste sur la fiche compte elle-même."""

    model = User
    extra = 0
    fields = ('lien_compte', 'email', 'is_active')
    readonly_fields = ('lien_compte', 'email', 'is_active')
    can_delete = False
    verbose_name = 'Compte'
    verbose_name_plural = 'Comptes rattachés à cette école'

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description='Compte')
    def lien_compte(self, obj):
        url = reverse('admin:accounts_user_change', args=[obj.pk])
        return format_html('<a href="{}">{}</a>', url, obj.get_full_name() or obj.username)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'country', 'city', 'phone_number', 'email', 'is_active',
        'classes_link', 'eleves_link', 'parents_link', 'messages_link', 'created_at',
    )
    list_filter = ('country', 'is_active')
    search_fields = ('name', 'city', 'phone_number', 'email')
    ordering = ('name',)
    date_hierarchy = 'created_at'
    readonly_fields = ('usage_quotas', 'created_at', 'updated_at')
    inlines = [StaffInline]
    actions = ('activer', 'desactiver', 'reinitialiser_quotas')

    classes_link = related_count_link(Classe, 'school__id__exact', 'classes_count', 'classe(s)')
    eleves_link = related_count_link(Eleve, 'school__id__exact', 'eleves_count', 'élève(s)')
    parents_link = related_count_link(Parent, 'school__id__exact', 'parents_count', 'parent(s)')
    messages_link = related_count_link(Message, 'school__id__exact', 'messages_count', 'message(s)')

    @admin.action(description='Activer les écoles sélectionnées')
    def activer(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} école(s) activée(s).')

    @admin.action(description='Désactiver les écoles sélectionnées')
    def desactiver(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} école(s) désactivée(s).')

    @admin.action(description="Réinitialiser les compteurs d'envoi maintenant")
    def reinitialiser_quotas(self, request, queryset):
        updated = queryset.update(quota_reset_at=timezone.now())
        self.message_user(request, f"Compteurs remis à zéro pour {updated} école(s).")

    @admin.display(description="Utilisation des quotas ce mois")
    def usage_quotas(self, obj):
        if obj.pk is None:
            return '—'
        lignes = []
        for channel, field in CHANNEL_LIMIT_FIELDS.items():
            limite = getattr(obj, field)
            utilise = channel_usage(obj, channel)
            valeur = f'{utilise} envoyé(s), illimité' if limite is None else f'{utilise} / {limite} envoyé(s)'
            lignes.append((channel, valeur))
        return format_html_join('', '{} : {}<br>', lignes)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            classes_count=Count('classes', distinct=True),
            eleves_count=Count('eleves', distinct=True),
            parents_count=Count('parents', distinct=True),
            messages_count=Count('messages', distinct=True),
        )
