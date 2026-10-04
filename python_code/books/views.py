from django.conf import settings
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .booklet import build_book_pages, build_table_pages
from .importers import ImportProblem, read_upload
from .models import Book, Column, Row, Table, next_position
from .serializers import (
    BookSerializer,
    ColumnSerializer,
    ReorderSerializer,
    RowSerializer,
    TableDetailSerializer,
    TableSerializer,
)

YES = ("1", "true", "yes")


def is_confirmed(request):
    """True when the request says the person has confirmed the delete."""
    if str(request.query_params.get("confirm", "")).lower() in YES:
        return True
    body = request.data if isinstance(request.data, dict) else {}
    return body.get("confirm") is True or str(body.get("confirm", "")).lower() in YES


def page_size(request, name, default):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValidationError({name: "This must be a whole number."})


def apply_order(items, ordered_ids):
    """Save new positions for ``items`` so they follow ``ordered_ids``."""
    items = list(items)
    if len(set(ordered_ids)) != len(ordered_ids) or {item.pk for item in items} != set(ordered_ids):
        raise ValidationError({"order": "List every item exactly once."})
    by_id = {item.pk: item for item in items}
    for position, item_id in enumerate(ordered_ids):
        by_id[item_id].position = position
    type(items[0]).all_objects.bulk_update(items, ["position"])


class OwnedViewSet(viewsets.ModelViewSet):
    """Base for books, tables, columns and rows.

    * A user only ever sees items in their own books. An admin sees everyone's.
    * DELETE does nothing until it is confirmed (``?confirm=true``), and then
      moves the item to the trash instead of destroying it.
    * ``POST .../restore/`` brings an item back from the trash.
    """

    model = None
    owner_path = None         # lookup from this model to the book's owner
    parent_alive_filters = {}  # parents must not be in the trash
    filter_param = None       # e.g. ?book=3 or ?table=7

    def get_queryset(self):
        if self.action == "restore":
            queryset = self.model.all_objects.deleted()
        else:
            queryset = self.model.objects.all()
        queryset = queryset.filter(**self.parent_alive_filters)
        user = self.request.user
        if not user.is_booklet_admin:
            queryset = queryset.filter(**{self.owner_path: user})
        if self.filter_param and self.action == "list":
            value = self.request.query_params.get(self.filter_param)
            if value:
                if not value.isdigit():
                    raise ValidationError({self.filter_param: "This must be an id."})
                queryset = queryset.filter(**{f"{self.filter_param}_id": int(value)})
        return queryset

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        if not is_confirmed(request):
            return Response(
                {
                    "detail": "Deleting needs confirmation. Send the request again with confirm=true.",
                    "confirm_required": True,
                    "will_delete": item.delete_summary(),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        item = self.get_object()
        item.restore()
        return Response(self.get_serializer(item).data)


class BookViewSet(OwnedViewSet):
    model = Book
    owner_path = "owner"
    serializer_class = BookSerializer

    def get_queryset(self):
        queryset = super().get_queryset().select_related("owner")
        owner = self.request.query_params.get("owner")
        if owner and owner.isdigit() and self.action == "list":
            queryset = queryset.filter(owner_id=int(owner))
        return queryset

    @action(detail=True, methods=["post"], url_path="reorder-tables")
    def reorder_tables(self, request, pk=None):
        book = self.get_object()
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        apply_order(book.tables.all(), serializer.validated_data["order"])
        return Response(TableSerializer(book.tables.all(), many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"])
    def booklet(self, request, pk=None):
        """Every page of the book, ready to draw.

        ``?columns_per_page=5&rows_per_page=15`` says how much fits on one page
        of the reader's screen.
        """
        book = self.get_object()
        columns_per_page = page_size(request, "columns_per_page", settings.BOOKLET_DEFAULT_COLUMNS_PER_PAGE)
        rows_per_page = page_size(request, "rows_per_page", settings.BOOKLET_DEFAULT_ROWS_PER_PAGE)
        content = [(table, list(table.columns.all()), list(table.rows.all())) for table in book.tables.all()]
        pages = build_book_pages(book, content, columns_per_page, rows_per_page)
        return Response({"book_id": book.pk, "title": book.title, "page_count": len(pages), "pages": pages})

    @action(
        detail=True,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_file(self, request, pk=None):
        """Create tables in this book from an uploaded .xlsx or .csv file.

        Form fields: ``file`` (required) and ``name`` (optional table name,
        used when the file holds a single table).
        """
        book = self.get_object()
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise ValidationError({"file": "Choose a file to upload."})
        try:
            parsed_tables = read_upload(uploaded)
        except ImportProblem as problem:
            raise ValidationError({"file": str(problem)})

        custom_name = (request.data.get("name") or "").strip()
        if custom_name and len(parsed_tables) == 1:
            parsed_tables[0].name = custom_name[:200]

        created = []
        with transaction.atomic():
            position = next_position(book.tables)
            for parsed in parsed_tables:
                table = Table.objects.create(book=book, name=parsed.name, position=position)
                position += 1
                columns = [
                    Column.objects.create(table=table, name=name, data_type=data_type, position=index)
                    for index, (name, data_type) in enumerate(parsed.columns)
                ]
                Row.objects.bulk_create([
                    Row(
                        table=table,
                        position=index,
                        data={column.key: cell for column, cell in zip(columns, cells) if cell is not None},
                    )
                    for index, cells in enumerate(parsed.rows)
                ])
                created.append(table)
        data = TableDetailSerializer(created, many=True, context=self.get_serializer_context()).data
        return Response({"tables": data}, status=status.HTTP_201_CREATED)


class TableViewSet(OwnedViewSet):
    model = Table
    owner_path = "book__owner"
    parent_alive_filters = {"book__deleted_at__isnull": True}
    filter_param = "book"
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_serializer_class(self):
        if self.action in ("retrieve", "restore"):
            return TableDetailSerializer
        return TableSerializer

    def reorder(self, request, related_name):
        table = self.get_object()
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        apply_order(getattr(table, related_name).all(), serializer.validated_data["order"])
        return Response(TableDetailSerializer(table, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="reorder-columns")
    def reorder_columns(self, request, pk=None):
        return self.reorder(request, "columns")

    @action(detail=True, methods=["post"], url_path="reorder-rows")
    def reorder_rows(self, request, pk=None):
        return self.reorder(request, "rows")

    @action(detail=True, methods=["get"])
    def pages(self, request, pk=None):
        """The booklet pages for this one table (see ``books/booklet.py``)."""
        table = self.get_object()
        columns_per_page = page_size(request, "columns_per_page", settings.BOOKLET_DEFAULT_COLUMNS_PER_PAGE)
        rows_per_page = page_size(request, "rows_per_page", settings.BOOKLET_DEFAULT_ROWS_PER_PAGE)
        pages = build_table_pages(table, table.columns.all(), table.rows.all(), columns_per_page, rows_per_page)
        for number, page in enumerate(pages, start=1):
            page["page_number"] = number
        return Response({"table_id": table.pk, "table_name": table.name, "page_count": len(pages), "pages": pages})


class ColumnViewSet(OwnedViewSet):
    model = Column
    owner_path = "table__book__owner"
    parent_alive_filters = {"table__deleted_at__isnull": True, "table__book__deleted_at__isnull": True}
    filter_param = "table"
    serializer_class = ColumnSerializer


class RowViewSet(OwnedViewSet):
    model = Row
    owner_path = "table__book__owner"
    parent_alive_filters = {"table__deleted_at__isnull": True, "table__book__deleted_at__isnull": True}
    filter_param = "table"
    serializer_class = RowSerializer


class TrashView(APIView):
    """Everything the signed-in user has deleted and can still restore.

    Items whose parent is also in the trash are left out: restore the parent
    first and they come back with it.
    """

    def get(self, request):
        user = request.user

        def mine(queryset, owner_path, **parent_alive):
            queryset = queryset.filter(**parent_alive)
            return queryset if user.is_booklet_admin else queryset.filter(**{owner_path: user})

        books = mine(Book.all_objects.deleted(), "owner")
        tables = mine(Table.all_objects.deleted(), "book__owner", book__deleted_at__isnull=True)
        parents_alive = {"table__deleted_at__isnull": True, "table__book__deleted_at__isnull": True}
        columns = mine(Column.all_objects.deleted(), "table__book__owner", **parents_alive)
        rows = mine(Row.all_objects.deleted(), "table__book__owner", **parents_alive)

        return Response({
            "books": [
                {"id": book.pk, "title": book.title, "deleted_at": book.deleted_at}
                for book in books
            ],
            "tables": [
                {"id": table.pk, "name": table.name, "book": table.book_id, "deleted_at": table.deleted_at}
                for table in tables
            ],
            "columns": [
                {"id": column.pk, "name": column.name, "table": column.table_id, "deleted_at": column.deleted_at}
                for column in columns
            ],
            "rows": [
                {"id": row.pk, "table": row.table_id, "data": row.data, "deleted_at": row.deleted_at}
                for row in rows
            ],
        })
