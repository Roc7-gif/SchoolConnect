from django.contrib import admin
from django.db.models import Count

from messaging.models import MessageRecipient
from SchoolConnect.admin_utils import fk_change_link, related_count_link

from .models import Parent, StudentGuardian


class StudentGuardianInline(admin.TabularInline):
    model = StudentGuardian
    extra = 1


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = (
        'last_name', 'first_name', 'phone_number', 'email', 'school_link',
        'preferred_channel', 'is_active', 'messages_recus_link',
    )
    search_fields = ('last_name', 'first_name', 'phone_number', 'email')
    list_filter = ('school', 'preferred_channel', 'is_active')
    ordering = ('last_name', 'first_name')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [StudentGuardianInline]
    actions = ('activer', 'desactiver')

    school_link = fk_change_link('school')
    messages_recus_link = related_count_link(
        MessageRecipient, 'parent__id__exact', 'messages_recus_count', 'message(s)',
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            messages_recus_count=Count('messages_received', distinct=True),
        )

    @admin.action(description='Activer les parents sélectionnés')
    def activer(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} parent(s) activé(s).')

    @admin.action(description='Désactiver les parents sélectionnés')
    def desactiver(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} parent(s) désactivé(s).')


@admin.register(StudentGuardian)
class StudentGuardianAdmin(admin.ModelAdmin):
    """Vue transverse des liens élève↔parent, en plus des inlines sur Eleve et Parent —
    utile pour retrouver ou corriger un lien sans passer par l'une des deux fiches."""

    list_display = ('student_link', 'parent_link', 'relationship', 'is_primary_contact')
    list_filter = ('relationship', 'is_primary_contact', 'parent__school')
    search_fields = (
        'student__first_name', 'student__last_name',
        'parent__first_name', 'parent__last_name', 'parent__phone_number',
    )
    autocomplete_fields = ('student', 'parent')

    student_link = fk_change_link('student')
    parent_link = fk_change_link('parent')
