from django.contrib import admin
from django.urls import include, path, re_path

from . import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", views.health, name="health"),
    path("api/", include("accounts.urls")),
    path("api/", include("books.urls")),
    # Everything else is a page of the screens.
    re_path(r"^(?!api/|admin/|static/).*$", views.screens, name="screens"),
]
