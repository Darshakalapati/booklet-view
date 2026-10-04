"""
How the data is stored.

The site never creates a real database table when someone adds a table to
their book. Instead, four fixed database tables *describe* the books:

    Book    one booklet, owned by one user
    Table   a table inside a book (a ledger, price list, checklist, ...)
    Column  one column of a table, with a name and a type
    Row     one row of a table; its cells live in a JSON field keyed by
            column id, e.g. {"12": "Ravi", "13": 250, "14": true}

Because cells point at column *ids* and not at names, renaming a table or a
column is a one-field update and never touches the data.

Nothing is removed outright. Deleting sets ``deleted_at`` and the item moves
to the trash, from where it can be restored.
"""

from django.conf import settings
from django.db import models
from django.db.models import Max
from django.utils import timezone


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def deleted(self):
        return self.filter(deleted_at__isnull=False)


class AliveManager(models.Manager):
    """Default manager: leaves out anything that is in the trash."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class SoftDeleteModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = AliveManager()
    all_objects = SoftDeleteQuerySet.as_manager()

    class Meta:
        abstract = True

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at"])

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=["deleted_at", "updated_at"])


def next_position(queryset):
    """Position for a new item so that it lands after the existing ones."""
    highest = queryset.aggregate(highest=Max("position"))["highest"]
    return 0 if highest is None else highest + 1


class Book(SoftDeleteModel):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="books")
    title = models.CharField(max_length=200)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return self.title

    def delete_summary(self):
        tables = self.tables.count()
        return f'Book "{self.title}" with {tables} table{"" if tables == 1 else "s"}'


class Table(SoftDeleteModel):
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="tables")
    name = models.CharField(max_length=200)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.name

    def delete_summary(self):
        columns, rows = self.columns.count(), self.rows.count()
        return (
            f'Table "{self.name}" with {columns} column{"" if columns == 1 else "s"} '
            f'and {rows} row{"" if rows == 1 else "s"}'
        )


class Column(SoftDeleteModel):
    class DataType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        CHECKBOX = "checkbox", "Checkbox"

    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name="columns")
    name = models.CharField(max_length=200)
    data_type = models.CharField(max_length=10, choices=DataType.choices, default=DataType.TEXT)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.name

    @property
    def key(self):
        """The key this column's cells use inside ``Row.data``."""
        return str(self.pk)

    def delete_summary(self):
        filled = sum(1 for row in self.table.rows.all() if row.data.get(self.key) is not None)
        return f'Column "{self.name}" with {filled} filled cell{"" if filled == 1 else "s"}'


class Row(SoftDeleteModel):
    table = models.ForeignKey(Table, on_delete=models.CASCADE, related_name="rows")
    data = models.JSONField(default=dict, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"Row {self.pk} of {self.table}"

    def delete_summary(self):
        number = self.table.rows.filter(position__lt=self.position).count() + 1
        return f'Row {number} of table "{self.table.name}"'
