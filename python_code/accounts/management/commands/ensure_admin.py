"""
Make sure the site has an admin account.

    python manage.py ensure_admin

A new server has an empty database and no way to type `createsuperuser`, so
the first admin comes from two settings on the server:

    BOOKLET_ADMIN_USERNAME
    BOOKLET_ADMIN_PASSWORD

The account is created only when no admin exists yet. An existing admin is
never changed, so it is safe to run this every time the site starts.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create the first admin account from BOOKLET_ADMIN_USERNAME / BOOKLET_ADMIN_PASSWORD."

    def handle(self, *args, **options):
        User = get_user_model()
        if User.objects.filter(role=User.Role.ADMIN).exists():
            self.stdout.write("An admin account already exists; nothing was changed.")
            return

        username = os.environ.get("BOOKLET_ADMIN_USERNAME", "").strip()
        password = os.environ.get("BOOKLET_ADMIN_PASSWORD", "")
        if not username or not password:
            self.stdout.write(self.style.WARNING(
                "There is no admin account yet. Set BOOKLET_ADMIN_USERNAME and "
                "BOOKLET_ADMIN_PASSWORD, then start the site again."
            ))
            return
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(
                f'The username "{username}" is already used by a non-admin account; choose another.'
            ))
            return

        User.objects.create_superuser(username=username, password=password)
        self.stdout.write(self.style.SUCCESS(f'Created the admin account "{username}".'))
