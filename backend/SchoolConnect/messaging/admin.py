from django.contrib import admin, messages
from django.db.models import Count

from SchoolConnect.admin_utils import fk_change_link, related_count_link

from .models import Message, MessageRecipient, MessageTemplate
from .services import resend_message
from .tasks import send_message_task


class MessageRecipientInline(admin.TabularInline):
    model = MessageRecipient
    extra = 0
    readonly_fields = ('rendered_body', 'attempts', 'sent_at')


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'school_link', 'messages_link')
    list_filter = ('school', 'category')
    search_fields = ('name',)
    ordering = ('school', 'name')

    school_link = fk_change_link('school')
    messages_link = related_count_link(Message, 'template__id__exact', 'messages_count', 'message(s)')

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(messages_count=Count('messages', distinct=True))


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = (
        'school_link', 'annee_link', 'scope_type', 'channel', 'status',
        'recipient_count', 'cost', 'created_by_link', 'created_at', 'sent_at',
    )
    list_filter = ('school', 'scope_type', 'channel', 'status')
    search_fields = ('school__name', 'body')
    date_hierarchy = 'created_at'
    readonly_fields = (
        'recipient_count', 'cost', 'created_by', 'retry_of', 'created_at', 'sent_at',
    )
    inlines = [MessageRecipientInline]
    actions = ('renvoyer',)

    school_link = fk_change_link('school')
    annee_link = fk_change_link('annee')
    created_by_link = fk_change_link('created_by')

    @admin.action(description='Renvoyer aux destinataires encore injoignables')
    def renvoyer(self, request, queryset):
        renvoyes, ignores = 0, 0
        for message in queryset:
            retry = resend_message(message, created_by=request.user)
            if retry is None:
                ignores += 1
                continue
            send_message_task.delay(retry.id)
            renvoyes += 1
        text = f'{renvoyes} message(s) relancé(s) en tâche de fond.'
        if ignores:
            text += f' {ignores} ignoré(s) (aucun destinataire injoignable).'
        self.message_user(request, text, level=messages.INFO)


@admin.register(MessageRecipient)
class MessageRecipientAdmin(admin.ModelAdmin):
    """Vue transverse des destinataires, en plus de l'inline sur Message — sert à
    l'équipe support pour retrouver un envoi précis sans connaître son message d'origine."""

    list_display = ('message_link', 'parent_link', 'eleve_link', 'channel_used', 'status', 'cost', 'sent_at')
    list_filter = ('status', 'skip_reason', 'channel_used')
    search_fields = ('parent__first_name', 'parent__last_name', 'eleve__first_name', 'eleve__last_name')
    readonly_fields = ('rendered_body', 'attempts', 'sent_at')

    message_link = fk_change_link('message')
    parent_link = fk_change_link('parent')
    eleve_link = fk_change_link('eleve')
