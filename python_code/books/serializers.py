from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import Book, Column, Row, Table, next_position
from .values import clean_value

User = get_user_model()


def user_can_access_book(user, book):
    return user.is_booklet_admin or book.owner_id == user.pk


class ParentFieldMixin:
    """Shared rules for the ``book`` / ``table`` field that says where an item lives.

    * The parent must exist, must not be in the trash, and must belong to the
      signed-in user (admins may use anyone's).
    * Once an item is created it cannot be moved to a different parent.
    """

    parent_field = None  # "book" or "table"

    def book_of(self, parent):
        raise NotImplementedError

    def check_parent(self, parent):
        book = self.book_of(parent)
        user = self.context["request"].user
        if book.is_deleted or not user_can_access_book(user, book):
            # Same message as "does not exist", so nothing leaks about other users' data.
            raise serializers.ValidationError(f'Invalid pk "{parent.pk}" - object does not exist.')
        if self.instance is not None and getattr(self.instance, f"{self.parent_field}_id") != parent.pk:
            raise serializers.ValidationError("This cannot be moved to a different place.")
        return parent


class BookSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    table_count = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = ["id", "title", "owner", "owner_username", "table_count", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_table_count(self, book):
        return book.tables.count()

    def validate_owner(self, owner):
        user = self.context["request"].user
        if not user.is_booklet_admin and owner.pk != user.pk:
            raise serializers.ValidationError("You can only create books for yourself.")
        if self.instance is not None and owner.pk != self.instance.owner_id and not user.is_booklet_admin:
            raise serializers.ValidationError("Only an admin can give a book to another user.")
        return owner

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        return super().create(validated_data)


class ColumnSerializer(ParentFieldMixin, serializers.ModelSerializer):
    parent_field = "table"
    table = serializers.PrimaryKeyRelatedField(queryset=Table.objects.all())

    class Meta:
        model = Column
        fields = ["id", "table", "name", "data_type", "position"]
        read_only_fields = ["id", "position"]

    def book_of(self, table):
        return table.book

    def validate_table(self, table):
        return self.check_parent(table)

    def create(self, validated_data):
        validated_data["position"] = next_position(validated_data["table"].columns)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        new_type = validated_data.get("data_type", instance.data_type)
        if new_type != instance.data_type:
            self.convert_cells(instance, new_type)
        return super().update(instance, validated_data)

    def convert_cells(self, column, new_type):
        """Change a column's type only if every existing value fits the new type."""
        changed, failures = [], 0
        for row in column.table.rows.all():
            value = row.data.get(column.key)
            try:
                converted = clean_value(new_type, value)
            except ValueError:
                failures += 1
                continue
            if converted != value or type(converted) is not type(value):
                row.data[column.key] = converted
                changed.append(row)
        if failures:
            raise serializers.ValidationError({
                "data_type": f'{failures} value{"" if failures == 1 else "s"} in this column cannot be '
                             f'turned into "{new_type}". Fix or clear them first.'
            })
        Row.objects.bulk_update(changed, ["data"])


class RowSerializer(ParentFieldMixin, serializers.ModelSerializer):
    """A row. ``data`` maps column id -> value, e.g. {"12": "Ravi", "13": 250}.

    On PATCH only the cells that are sent are changed; the others are kept.
    """

    parent_field = "table"
    table = serializers.PrimaryKeyRelatedField(queryset=Table.objects.all())
    data = serializers.DictField(required=False)

    class Meta:
        model = Row
        fields = ["id", "table", "data", "position"]
        read_only_fields = ["id", "position"]

    def book_of(self, table):
        return table.book

    def validate_table(self, table):
        return self.check_parent(table)

    def validate(self, attrs):
        table = attrs.get("table") or self.instance.table
        if "data" in attrs:
            attrs["data"] = self.clean_cells(table, attrs["data"])
        return attrs

    def clean_cells(self, table, cells):
        columns = {column.key: column for column in table.columns.all()}
        cleaned, errors = {}, {}
        for key, raw in cells.items():
            column = columns.get(str(key))
            if column is None:
                errors[str(key)] = "This table has no column with this id."
                continue
            try:
                cleaned[column.key] = clean_value(column.data_type, raw)
            except ValueError as error:
                errors[column.key] = f"{column.name}: {error}"
        if errors:
            raise serializers.ValidationError({"data": errors})
        return cleaned

    def create(self, validated_data):
        validated_data.setdefault("data", {})
        validated_data["position"] = next_position(validated_data["table"].rows)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "data" in validated_data and self.partial:
            validated_data["data"] = {**instance.data, **validated_data["data"]}
        elif "data" in validated_data:
            # Full replace: keep the cells of columns that are in the trash, so
            # restoring such a column brings its values back.
            live_keys = set(instance.table.columns.values_list("pk", flat=True))
            hidden = {key: value for key, value in instance.data.items() if int(key) not in live_keys}
            validated_data["data"] = {**hidden, **validated_data["data"]}
        return super().update(instance, validated_data)

    def to_representation(self, row):
        shown = super().to_representation(row)
        live_keys = self.context.get("live_column_keys")
        if live_keys is None:
            live_keys = {str(pk) for pk in row.table.columns.values_list("pk", flat=True)}
        shown["data"] = {key: value for key, value in row.data.items() if key in live_keys}
        return shown


class TableSerializer(ParentFieldMixin, serializers.ModelSerializer):
    """A table without its contents; used for lists."""

    parent_field = "book"
    book = serializers.PrimaryKeyRelatedField(queryset=Book.objects.all())
    column_count = serializers.SerializerMethodField()
    row_count = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = ["id", "book", "name", "position", "column_count", "row_count", "created_at", "updated_at"]
        read_only_fields = ["id", "position", "created_at", "updated_at"]

    def book_of(self, book):
        return book

    def validate_book(self, book):
        return self.check_parent(book)

    def get_column_count(self, table):
        return table.columns.count()

    def get_row_count(self, table):
        return table.rows.count()

    def create(self, validated_data):
        validated_data["position"] = next_position(validated_data["book"].tables)
        return super().create(validated_data)


class TableDetailSerializer(TableSerializer):
    """A table with its columns and rows; used when one table is opened."""

    columns = serializers.SerializerMethodField()
    rows = serializers.SerializerMethodField()

    class Meta(TableSerializer.Meta):
        fields = TableSerializer.Meta.fields + ["columns", "rows"]

    def get_columns(self, table):
        return ColumnSerializer(table.columns.all(), many=True, context=self.context).data

    def get_rows(self, table):
        live_keys = {str(pk) for pk in table.columns.values_list("pk", flat=True)}
        context = {**self.context, "live_column_keys": live_keys}
        return RowSerializer(table.rows.all(), many=True, context=context).data


class ReorderSerializer(serializers.Serializer):
    """The ids of every item, listed in the order they should appear."""

    order = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
