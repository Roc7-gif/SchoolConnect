from django.contrib import admin, messages
from django.db.models import Count, Q

from messaging.models import Message, MessageRecipient
from parents.admin import StudentGuardianInline
from SchoolConnect.admin_utils import fk_change_link, related_count_link

from .models import AnneeScolaire, Classe, CustomFieldDefinition, Eleve, Inscription
from .services import cloturer_inscription, definir_annee_courante, inscrire


@admin.register(AnneeScolaire)
class AnneeScolaireAdmin(admin.ModelAdmin):
    list_display = (
        'label', 'school_link', 'is_current', 'start_date', 'end_date',
        'classes_link', 'messages_link', 'created_at',
    )
    list_filter = ('school', 'is_current')
    search_fields = ('label',)
    ordering = ('school', '-label')
    readonly_fields = ('created_at',)
    actions = ('definir_courante',)

    school_link = fk_change_link('school')
    classes_link = related_count_link(Classe, 'annee__id__exact', 'classes_count', 'classe(s)')
    messages_link = related_count_link(Message, 'annee__id__exact', 'messages_count', 'message(s)')

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            classes_count=Count('classes', distinct=True),
            messages_count=Count('messages', distinct=True),
        )

    @admin.action(description="Définir comme année en cours (décoche l'ancienne automatiquement)")
    def definir_courante(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, 'Sélectionnez une seule année scolaire.', level=messages.ERROR)
            return
        annee = definir_annee_courante(queryset.first())
        self.message_user(request, f'« {annee} » est désormais l\'année en cours de son école.')

    def save_model(self, request, obj, form, change):
        # Passer directement `is_current` à True en édition court-circuiterait la
        # contrainte « une seule année courante par école » (l'ancienne n'est pas
        # décochée) : on la décoche nous-mêmes avant de laisser Django sauvegarder,
        # comme le fait services.definir_annee_courante().
        if obj.is_current:
            AnneeScolaire.objects.filter(
                school_id=obj.school_id, is_current=True,
            ).exclude(pk=obj.pk).update(is_current=False)
        super().save_model(request, obj, form, change)


@admin.register(Classe)
class ClasseAdmin(admin.ModelAdmin):
    list_display = ('name', 'level', 'school_link', 'annee_link', 'eleves_link', 'messages_link')
    list_filter = ('school', 'annee', 'level')
    search_fields = ('name', 'level')
    ordering = ('school', 'annee', 'level', 'name')

    school_link = fk_change_link('school')
    annee_link = fk_change_link('annee')
    eleves_link = related_count_link(Eleve, 'inscriptions__classe__id__exact', 'eleves_count', 'élève(s)')
    messages_link = related_count_link(Message, 'scope_classe__id__exact', 'messages_count', 'message(s)')

    def get_queryset(self, request):
        # eleves_count passe par les inscriptions, pas par le cache Eleve.classe (faux
        # pour toute année autre que la courante) — voir EleveQuerySet.pour_annee.
        return super().get_queryset(request).annotate(
            eleves_count=Count(
                'inscriptions', filter=Q(inscriptions__statut=Inscription.Statut.INSCRIT), distinct=True,
            ),
            messages_count=Count('messages', distinct=True),
        )


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    list_display = ('eleve_link', 'classe_link', 'annee_link', 'statut', 'date_inscription')
    list_filter = ('annee', 'statut', 'classe__school')
    search_fields = ('eleve__first_name', 'eleve__last_name')
    autocomplete_fields = ('eleve', 'classe')
    readonly_fields = ('date_inscription',)
    actions = ('marquer_parti', 'marquer_diplome', 'marquer_transfere')

    eleve_link = fk_change_link('eleve')
    classe_link = fk_change_link('classe')
    annee_link = fk_change_link('annee')

    def save_model(self, request, obj, form, change):
        # Toujours passer par les services de scolarité : ils tiennent à jour le cache
        # `Eleve.classe` (utilisé par tous les écrans pour l'année courante), qu'un
        # enregistrement direct de l'Inscription laisserait périmé.
        if obj.statut == Inscription.Statut.INSCRIT:
            inscrire(obj.eleve, obj.classe, obj.annee, obj.statut)
        else:
            cloturer_inscription(obj.eleve, obj.annee, obj.statut)

    def _cloturer(self, request, queryset, statut, label):
        count = sum(
            1 for i in queryset if cloturer_inscription(i.eleve, i.annee, statut) is not None
        )
        self.message_user(request, f'{count} inscription(s) {label}.')

    @admin.action(description="Marquer « parti en cours d'année »")
    def marquer_parti(self, request, queryset):
        self._cloturer(request, queryset, Inscription.Statut.PARTI, 'marquée(s) parti')

    @admin.action(description='Marquer « diplômé »')
    def marquer_diplome(self, request, queryset):
        self._cloturer(request, queryset, Inscription.Statut.DIPLOME, 'marquée(s) diplômé')

    @admin.action(description='Marquer « transféré »')
    def marquer_transfere(self, request, queryset):
        self._cloturer(request, queryset, Inscription.Statut.TRANSFERE, 'marquée(s) transféré')


@admin.register(CustomFieldDefinition)
class CustomFieldDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'school_link', 'created_at')
    list_filter = ('school',)
    search_fields = ('name', 'slug')
    readonly_fields = ('created_at',)

    school_link = fk_change_link('school')


class InscriptionInline(admin.TabularInline):
    model = Inscription
    extra = 0
    autocomplete_fields = ('classe',)
    readonly_fields = ('date_inscription',)


@admin.register(Eleve)
class EleveAdmin(admin.ModelAdmin):
    list_display = (
        'last_name', 'first_name', 'classe_link', 'school_link', 'matricule',
        'is_active', 'messages_recus_link',
    )
    # 'inscriptions__classe' est nécessaire (et pas seulement 'classe', le cache de
    # l'année courante) pour que le lien "Voir les élèves" de ClasseAdmin — qui doit
    # rester correct pour une classe d'une année passée — soit un lookup autorisé.
    list_filter = ('school', 'classe', 'inscriptions__classe', 'sexe', 'is_active')
    search_fields = ('first_name', 'last_name', 'matricule')
    ordering = ('school', 'last_name', 'first_name')
    readonly_fields = ('classe', 'created_at', 'updated_at')
    fields = (
        'school', 'first_name', 'last_name', 'sexe', 'date_of_birth', 'matricule',
        'extra_data', 'is_active', 'classe', 'created_at', 'updated_at',
    )
    inlines = [InscriptionInline, StudentGuardianInline]
    actions = ('archiver', 'desarchiver')

    school_link = fk_change_link('school')
    classe_link = fk_change_link('classe')
    messages_recus_link = related_count_link(
        MessageRecipient, 'eleve__id__exact', 'messages_recus_count', 'message(s)',
    )

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            messages_recus_count=Count('messages_about', distinct=True),
        )

    @admin.action(description='Archiver les élèves sélectionnés')
    def archiver(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} élève(s) archivé(s).')

    @admin.action(description='Désarchiver les élèves sélectionnés')
    def desarchiver(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} élève(s) désarchivé(s).')

    def save_formset(self, request, form, formset, change):
        if formset.model is not Inscription:
            return super().save_formset(request, form, formset, change)

        instances = formset.save(commit=False)
        for obj in instances:
            if obj.statut == Inscription.Statut.INSCRIT:
                inscrire(obj.eleve, obj.classe, obj.annee, obj.statut)
            else:
                cloturer_inscription(obj.eleve, obj.annee, obj.statut)
        for obj in formset.deleted_objects:
            obj.delete()
        formset.save_m2m()
