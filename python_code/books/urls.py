from django.urls import include, path
from rest_framework.routers import SimpleRouter

from .views import BookViewSet, ColumnViewSet, RowViewSet, TableViewSet, TrashView

router = SimpleRouter()
router.register("books", BookViewSet, basename="book")
router.register("tables", TableViewSet, basename="table")
router.register("columns", ColumnViewSet, basename="column")
router.register("rows", RowViewSet, basename="row")

urlpatterns = [
    path("trash/", TrashView.as_view(), name="trash"),
    path("", include(router.urls)),
]
