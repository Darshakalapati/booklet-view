from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class BookletUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # `python manage.py createsuperuser` makes the first admin of the site.
        extra_fields.setdefault("role", "admin")
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """A person who can sign in.

    There are two roles:

    * admin - sees and manages every user's books, and manages the users.
    * user  - sees and manages only their own books.
    """

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        USER = "user", "User"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.USER)

    objects = BookletUserManager()

    @property
    def is_booklet_admin(self):
        return self.is_superuser or self.role == self.Role.ADMIN

    def __str__(self):
        return f"{self.username} ({self.role})"
