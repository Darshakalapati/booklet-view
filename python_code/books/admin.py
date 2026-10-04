from django.contrib import admin

from .models import Book, Column, Row, Table


class TrashAwareAdmin(admin.ModelAdmin):
    """Shows items in the trash too, so an admin can inspect them."""

    def get_queryset(self, request):
        return self.model.all_objects.all()


@admin.register(Book)
class BookAdmin(TrashAwareAdmin):
    list_display = ("title", "owner", "created_at", "deleted_at")
    list_filter = ("owner",)
    search_fields = ("title",)


@admin.register(Table)
class TableAdmin(TrashAwareAdmin):
    list_display = ("name", "book", "position", "deleted_at")
    search_fields = ("name",)


@admin.register(Column)
class ColumnAdmin(TrashAwareAdmin):
    list_display = ("name", "table", "data_type", "position", "deleted_at")
    list_filter = ("data_type",)


@admin.register(Row)
class RowAdmin(TrashAwareAdmin):
    list_display = ("id", "table", "position", "deleted_at")
