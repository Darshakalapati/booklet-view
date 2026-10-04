"""Tests for uploading Excel and CSV files."""

import datetime
import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from openpyxl import Workbook
from rest_framework.test import APITestCase

from books.models import Book, Table

User = get_user_model()

CSV_LEDGER = (
    "Date,Customer,Amount,Paid,Phone\n"
    "2026-10-01,Ravi,\"1,250\",yes,0891234567\n"
    "2026-10-02,Sita,80.5,no,0897654321\n"
    ",,,,\n"
    "2026-10-03,Kiran,,yes,\n"
)


def xlsx_bytes(sheets):
    """Build an .xlsx file in memory from {sheet name: [rows]}."""
    workbook = Workbook()
    workbook.remove(workbook.active)
    for name, rows in sheets.items():
        sheet = workbook.create_sheet(name)
        for row in rows:
            sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ImportTests(APITestCase):
    def setUp(self):
        self.ravi = User.objects.create_user("ravi", password="ledger-Pages-42")
        self.sita = User.objects.create_user("sita", password="ledger-Pages-42")
        self.book = Book.objects.create(owner=self.ravi, title="Shop")
        self.client.force_authenticate(self.ravi)
        self.url = f"/api/books/{self.book.pk}/import/"

    def upload(self, filename, content, **extra):
        if isinstance(content, str):
            content = content.encode("utf-8")
        data = {"file": SimpleUploadedFile(filename, content), **extra}
        return self.client.post(self.url, data, format="multipart")

    def test_csv_becomes_a_table_with_guessed_column_types(self):
        response = self.upload("october ledger.csv", CSV_LEDGER)
        self.assertEqual(response.status_code, 201, response.data)
        table = response.data["tables"][0]

        self.assertEqual(table["name"], "october ledger")
        self.assertEqual(
            [(column["name"], column["data_type"]) for column in table["columns"]],
            [("Date", "date"), ("Customer", "text"), ("Amount", "number"), ("Paid", "checkbox"), ("Phone", "text")],
        )
        keys = [str(column["id"]) for column in table["columns"]]
        rows = [[row["data"].get(key) for key in keys] for row in table["rows"]]
        self.assertEqual(rows, [
            ["2026-10-01", "Ravi", 1250, True, "0891234567"],
            ["2026-10-02", "Sita", 80.5, False, "0897654321"],
            ["2026-10-03", "Kiran", None, True, None],   # the blank line was skipped
        ])

    def test_custom_table_name(self):
        response = self.upload("data.csv", "A,B\n1,2\n", name="Stock count")
        self.assertEqual(response.data["tables"][0]["name"], "Stock count")

    def test_blank_and_duplicate_headers_get_usable_names(self):
        response = self.upload("data.csv", "Name,,Name\nx,y,z\n")
        names = [column["name"] for column in response.data["tables"][0]["columns"]]
        self.assertEqual(names, ["Name", "Column 2", "Name (2)"])

    def test_semicolon_separated_csv(self):
        response = self.upload("data.csv", "Item;Price\nSoap;20\nHoney;450\n")
        table = response.data["tables"][0]
        self.assertEqual([column["name"] for column in table["columns"]], ["Item", "Price"])
        self.assertEqual(table["columns"][1]["data_type"], "number")

    def test_excel_file_with_two_sheets_makes_two_tables(self):
        content = xlsx_bytes({
            "Prices": [["Item", "Price", "In stock"], ["Honey 500g", 450, True], ["Honey 1kg", 850.5, False]],
            "Tasks": [["Task", "Due"], ["Order jars", datetime.datetime(2026, 10, 10)], ["Pay rent", datetime.date(2026, 11, 1)]],
            "Empty": [],
        })
        response = self.upload("shop.xlsx", content)
        self.assertEqual(response.status_code, 201, response.data)
        tables = response.data["tables"]
        self.assertEqual([table["name"] for table in tables], ["Prices", "Tasks"])
        self.assertEqual([table["position"] for table in tables], [0, 1])

        prices, tasks = tables
        self.assertEqual([column["data_type"] for column in prices["columns"]], ["text", "number", "checkbox"])
        self.assertEqual([column["data_type"] for column in tasks["columns"]], ["text", "date"])
        due_key = str(tasks["columns"][1]["id"])
        self.assertEqual([row["data"][due_key] for row in tasks["rows"]], ["2026-10-10", "2026-11-01"])
        price_key = str(prices["columns"][1]["id"])
        self.assertEqual([row["data"][price_key] for row in prices["rows"]], [450, 850.5])

    def test_single_sheet_excel_uses_the_file_name(self):
        response = self.upload("price list.xlsx", xlsx_bytes({"Sheet1": [["Item"], ["Soap"]]}))
        self.assertEqual(response.data["tables"][0]["name"], "price list")

    def test_new_tables_go_after_existing_ones(self):
        Table.objects.create(book=self.book, name="Existing", position=0)
        response = self.upload("data.csv", "A\n1\n")
        self.assertEqual(response.data["tables"][0]["position"], 1)

    def test_bad_files_are_refused_and_nothing_is_saved(self):
        cases = {
            "notes.pdf": b"%PDF-1.4",
            "old.xls": b"old excel",
            "fake.xlsx": b"this is not a real excel file",
            "empty.csv": b"\n\n",
        }
        for filename, content in cases.items():
            response = self.upload(filename, content)
            self.assertEqual(response.status_code, 400, filename)
            self.assertIn("file", response.data, filename)
        self.assertEqual(self.client.post(self.url, {}, format="multipart").status_code, 400)
        self.assertEqual(Table.objects.count(), 0)

    @override_settings(IMPORT_MAX_ROWS=2)
    def test_too_many_rows_is_refused(self):
        response = self.upload("big.csv", "A\n1\n2\n3\n")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Table.objects.count(), 0)

    def test_cannot_import_into_another_users_book(self):
        self.client.force_authenticate(self.sita)
        self.assertEqual(self.upload("data.csv", "A\n1\n").status_code, 404)
        self.assertEqual(Table.objects.count(), 0)
