from django.contrib import admin

from .models import Parent, StudentGuardian


class StudentGuardianInline(admin.TabularInline):
    model = StudentGuardian
    extra = 1


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'phone_number', 'preferred_channel', 'is_active')
    search_fields = ('last_name', 'first_name', 'phone_number', 'email')
    list_filter = ('preferred_channel', 'is_active')
    inlines = [StudentGuardianInline]
