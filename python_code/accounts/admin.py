from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class BookletUserAdmin(UserAdmin):
    list_display = ("username", "email", "role", "is_active", "date_joined")
    list_filter = ("role", "is_active")
    fieldsets = UserAdmin.fieldsets + (("Booklet", {"fields": ("role",)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Booklet", {"fields": ("role",)}),)
