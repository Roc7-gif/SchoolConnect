from django.contrib import admin

from parents.admin import StudentGuardianInline

from .models import Classe, Eleve


@admin.register(Classe)
class ClasseAdmin(admin.ModelAdmin):
    list_display = ('name', 'level', 'school', 'academic_year')
    list_filter = ('school', 'level', 'academic_year')
    search_fields = ('name',)


@admin.register(Eleve)
class EleveAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'classe', 'school', 'is_active')
    list_filter = ('school', 'classe', 'sexe', 'is_active')
    search_fields = ('first_name', 'last_name', 'matricule')
    inlines = [StudentGuardianInline]
