"""
Fill the database with a small demo book, so there is something to look at.

    python manage.py seed_demo

Creates the user "demo" (password "demo-Booklet-2026") with one book that
holds a wide ledger-style table, a price list and a checklist. Running it
again does nothing if the demo user already has a book.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from books.models import Book, Column, Row, Table

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo-Booklet-2026"

TABLES = [
    (
        "Library members",
        [("Name", "text"), ("Member no.", "number"), ("Joined", "date"), ("Phone", "text"), ("Area", "text"),
         ("Books out", "number"), ("Last visit", "date"), ("Fees due", "number"), ("Fees paid", "checkbox"),
         ("Notes", "text")],
        [
            ["Ravi Kumar", 101, "2025-01-12", "0891 234 567", "Benz Circle", 2, "2026-09-28", 0, True, "Prefers history"],
            ["Sita Devi", 102, "2025-02-03", "0897 654 321", "Governorpet", 0, "2026-09-30", 40, False, ""],
            ["Kiran Rao", 103, "2025-03-21", "0866 111 222", "Patamata", 1, "2026-10-01", 0, True, "Student"],
            ["Lakshmi N", 104, "2025-06-09", "0866 333 444", "Moghalrajpuram", 3, "2026-10-02", 15.5, False, ""],
            ["Arjun P", 105, "2026-01-17", "0891 555 666", "Labbipet", 0, "2026-08-14", 0, True, "Renew in January"],
        ],
    ),
    (
        "Price list",
        [("Item", "text"), ("Pack", "text"), ("Price", "number")],
        [["Forest honey", "250 g", 240], ["Forest honey", "500 g", 450], ["Forest honey", "1 kg", 850]],
    ),
    (
        "Opening checklist",
        [("Task", "text"), ("Done", "checkbox")],
        [["Unlock the shutters", True], ["Count the cash drawer", True], ["Check the fridge temperature", False]],
    ),
]


class Command(BaseCommand):
    help = "Create a demo user with a sample book."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(username=DEMO_USERNAME, defaults={"first_name": "Demo"})
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        if user.books.exists():
            self.stdout.write("The demo user already has a book; nothing was changed.")
            return

        book = Book.objects.create(owner=user, title="My first booklet")
        for table_position, (name, column_specs, rows) in enumerate(TABLES):
            table = Table.objects.create(book=book, name=name, position=table_position)
            columns = [
                Column.objects.create(table=table, name=column_name, data_type=data_type, position=index)
                for index, (column_name, data_type) in enumerate(column_specs)
            ]
            Row.objects.bulk_create([
                Row(
                    table=table,
                    position=index,
                    data={column.key: cell for column, cell in zip(columns, cells) if cell != ""},
                )
                for index, cells in enumerate(rows)
            ])
        self.stdout.write(self.style.SUCCESS(
            f'Created user "{DEMO_USERNAME}" (password "{DEMO_PASSWORD}") with the book "{book.title}".'
        ))
