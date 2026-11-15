"""Tests for read-only sharing, the shelf fields and cash-book totals."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from books.booklet import build_table_pages
from books.models import Book, BookShare, Column, Row, Table

User = get_user_model()
PASSWORD = "ledger-Pages-42"


class SharingTests(APITestCase):
    def setUp(self):
        self.ravi = User.objects.create_user("ravi", password=PASSWORD)
        self.sita = User.objects.create_user("sita", password=PASSWORD)
        self.book = Book.objects.create(owner=self.ravi, title="Shop", color="green", subtitle="Daily cash")
        self.table = Table.objects.create(book=self.book, name="Ledger")
        self.name = Column.objects.create(table=self.table, name="Name")
        self.row = Row.objects.create(table=self.table, data={self.name.key: "Ravi"})

    def test_owner_shares_and_unshares(self):
        self.client.force_authenticate(self.ravi)
        missing = self.client.post(f"/api/books/{self.book.pk}/shares/", {"username": "nobody"})
        self.assertEqual(missing.status_code, 400)
        shared = self.client.post(f"/api/books/{self.book.pk}/shares/", {"username": "Sita"})
        self.assertEqual(shared.status_code, 200)
        self.assertEqual([s["username"] for s in shared.data], ["sita"])
        self.assertEqual(self.client.get(f"/api/books/{self.book.pk}/").data["reader_count"], 1)
        removed = self.client.delete(f"/api/books/{self.book.pk}/shares/", {"username": "sita"})
        self.assertEqual(removed.data, [])

    def test_reader_can_read_but_not_change(self):
        BookShare.objects.create(book=self.book, user=self.sita)
        self.client.force_authenticate(self.sita)
        books = self.client.get("/api/books/").data
        self.assertEqual([(b["title"], b["access"]) for b in books], [("Shop", "reader")])
        self.assertEqual(self.client.get(f"/api/books/{self.book.pk}/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/tables/?book={self.book.pk}").status_code, 200)
        self.assertEqual(len(self.client.get(f"/api/tables/{self.table.pk}/").data["rows"]), 1)
        booklet = self.client.get(f"/api/books/{self.book.pk}/booklet/").data
        self.assertFalse(booklet["can_edit"])
        self.assertEqual(booklet["color"], "green")

        self.assertEqual(self.client.patch(f"/api/books/{self.book.pk}/", {"title": "Mine"}).status_code, 404)
        self.assertEqual(self.client.patch(f"/api/rows/{self.row.pk}/", {"data": {}}).status_code, 404)
        self.assertEqual(self.client.post("/api/rows/", {"table": self.table.pk}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/tables/{self.table.pk}/?confirm=true").status_code, 404)
        self.assertEqual(self.client.post(f"/api/books/{self.book.pk}/shares/", {"username": "ravi"}).status_code, 404)
        self.assertTrue(Table.objects.filter(pk=self.table.pk).exists())

    def test_owner_sees_access_and_last_written(self):
        self.client.force_authenticate(self.ravi)
        book = self.client.get(f"/api/books/{self.book.pk}/").data
        self.assertEqual(book["access"], "owner")
        self.assertEqual(book["color"], "green")
        self.assertEqual(book["subtitle"], "Daily cash")
        self.assertIsNotNone(book["last_written_at"])
        empty = self.client.post("/api/books/", {"title": "Empty", "color": "maroon"}).data
        self.assertIsNone(empty["last_written_at"])
        self.assertEqual(self.client.post("/api/books/", {"title": "Bad", "color": "pink"}).status_code, 400)


class TotalsTests(APITestCase):
    def test_pages_carry_totals_like_a_cash_book(self):
        ravi = User.objects.create_user("ravi", password=PASSWORD)
        book = Book.objects.create(owner=ravi, title="Shop")
        table = Table.objects.create(book=book, name="Cash")
        item = Column.objects.create(table=table, name="Item", position=0)
        amount = Column.objects.create(table=table, name="Amount", data_type="number", position=1)
        for index, value in enumerate([10, 20.5, 30, 40, "x"]):
            Row.objects.create(table=table, position=index, data={item.key: f"R{index}", amount.key: value if value != "x" else None})
        pages = build_table_pages(table, [item, amount], list(table.rows.all()), 5, 2)
        self.assertEqual([page["totals"][1] for page in pages], [
            {"brought_forward": 0, "page": 30.5, "running": 30.5},
            {"brought_forward": 30.5, "page": 70, "running": 100.5},
            {"brought_forward": 100.5, "page": 0, "running": 100.5},
        ])
        self.assertEqual([page["totals"][0] for page in pages], [None, None, None])
        self.assertEqual([page["last_rows"] for page in pages], [False, False, True])

    def test_no_totals_without_number_columns(self):
        ravi = User.objects.create_user("ravi", password=PASSWORD)
        table = Table.objects.create(book=Book.objects.create(owner=ravi, title="Shop"), name="Tasks")
        task = Column.objects.create(table=table, name="Task")
        pages = build_table_pages(table, [task], [], 5, 10)
        self.assertIsNone(pages[0]["totals"])
