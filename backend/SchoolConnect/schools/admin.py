from django.contrib import admin

from .models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'country', 'city', 'is_active')
    list_filter = ('country', 'is_active')
    search_fields = ('name', 'city')
