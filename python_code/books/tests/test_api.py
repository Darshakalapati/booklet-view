"""Tests for the books / tables / columns / rows API."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from books.models import Book, Column, Row, Table

User = get_user_model()


class BaseAPITest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("boss", "boss@example.com", "ledger-Pages-42")
        self.ravi = User.objects.create_user("ravi", password="ledger-Pages-42")
        self.sita = User.objects.create_user("sita", password="ledger-Pages-42")
        self.client.force_authenticate(self.ravi)

    def make_table(self, owner=None, column_specs=(("Name", "text"), ("Amount", "number"))):
        """A book with one table and the given columns; returns (book, table, columns)."""
        book = Book.objects.create(owner=owner or self.ravi, title="Shop")
        table = Table.objects.create(book=book, name="Ledger")
        columns = [
            Column.objects.create(table=table, name=name, data_type=data_type, position=index)
            for index, (name, data_type) in enumerate(column_specs)
        ]
        return book, table, columns


class BookTests(BaseAPITest):
    def test_create_rename_and_list_own_books(self):
        created = self.client.post("/api/books/", {"title": "Shop"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["owner"], self.ravi.pk)

        renamed = self.client.patch(f"/api/books/{created.data['id']}/", {"title": "Medical shop"})
        self.assertEqual(renamed.data["title"], "Medical shop")

        Book.objects.create(owner=self.sita, title="Sita's book")
        titles = [book["title"] for book in self.client.get("/api/books/").data]
        self.assertEqual(titles, ["Medical shop"])

    def test_user_cannot_touch_another_users_book(self):
        book = Book.objects.create(owner=self.sita, title="Sita's book")
        self.assertEqual(self.client.get(f"/api/books/{book.pk}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/books/{book.pk}/", {"title": "Mine"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/books/{book.pk}/?confirm=true").status_code, 404)
        self.assertEqual(self.client.get(f"/api/books/{book.pk}/booklet/").status_code, 404)
        self.assertEqual(self.client.post("/api/tables/", {"book": book.pk, "name": "Sneaky"}).status_code, 400)
        self.assertEqual(Table.objects.count(), 0)

    def test_user_cannot_create_a_book_for_someone_else(self):
        response = self.client.post("/api/books/", {"title": "Gift", "owner": self.sita.pk})
        self.assertEqual(response.status_code, 400)

    def test_admin_sees_and_manages_everyones_books(self):
        Book.objects.create(owner=self.ravi, title="Ravi's book")
        sitas = Book.objects.create(owner=self.sita, title="Sita's book")
        self.client.force_authenticate(self.admin)

        self.assertEqual(len(self.client.get("/api/books/").data), 2)
        self.assertEqual(len(self.client.get(f"/api/books/?owner={self.sita.pk}").data), 1)
        self.assertEqual(self.client.patch(f"/api/books/{sitas.pk}/", {"title": "Renamed"}).status_code, 200)
        made = self.client.post("/api/books/", {"title": "For Sita", "owner": self.sita.pk})
        self.assertEqual(made.data["owner"], self.sita.pk)


class TableAndColumnTests(BaseAPITest):
    def test_add_rename_tables_and_columns(self):
        book = Book.objects.create(owner=self.ravi, title="Shop")
        table = self.client.post("/api/tables/", {"book": book.pk, "name": "Price list"})
        self.assertEqual(table.status_code, 201)
        table_id = table.data["id"]

        first = self.client.post("/api/columns/", {"table": table_id, "name": "Item"})
        second = self.client.post("/api/columns/", {"table": table_id, "name": "Price", "data_type": "number"})
        self.assertEqual((first.data["position"], second.data["position"]), (0, 1))
        self.assertEqual(first.data["data_type"], "text")

        self.client.patch(f"/api/tables/{table_id}/", {"name": "Prices 2026"})
        self.client.patch(f"/api/columns/{first.data['id']}/", {"name": "Medicine"})

        detail = self.client.get(f"/api/tables/{table_id}/").data
        self.assertEqual(detail["name"], "Prices 2026")
        self.assertEqual([column["name"] for column in detail["columns"]], ["Medicine", "Price"])
        self.assertEqual(detail["rows"], [])

    def test_renaming_a_column_keeps_its_data(self):
        _book, table, (name, amount) = self.make_table()
        Row.objects.create(table=table, data={name.key: "Ravi", amount.key: 250})
        self.client.patch(f"/api/columns/{name.pk}/", {"name": "Customer"})
        row = self.client.get(f"/api/tables/{table.pk}/").data["rows"][0]
        self.assertEqual(row["data"], {name.key: "Ravi", amount.key: 250})

    def test_tables_cannot_be_moved_between_books(self):
        book, table, _columns = self.make_table()
        other = Book.objects.create(owner=self.ravi, title="Other")
        response = self.client.patch(f"/api/tables/{table.pk}/", {"book": other.pk})
        self.assertEqual(response.status_code, 400)

    def test_list_filters_by_parent(self):
        book, table, _columns = self.make_table()
        Table.objects.create(book=Book.objects.create(owner=self.ravi, title="Other"), name="Elsewhere")
        self.assertEqual(len(self.client.get("/api/tables/").data), 2)
        self.assertEqual(len(self.client.get(f"/api/tables/?book={book.pk}").data), 1)
        self.assertEqual(len(self.client.get(f"/api/columns/?table={table.pk}").data), 2)

    def test_reorder_columns_and_tables(self):
        book, table, (name, amount) = self.make_table()
        response = self.client.post(f"/api/tables/{table.pk}/reorder-columns/", {"order": [amount.pk, name.pk]})
        self.assertEqual([column["name"] for column in response.data["columns"]], ["Amount", "Name"])

        bad = self.client.post(f"/api/tables/{table.pk}/reorder-columns/", {"order": [amount.pk]})
        self.assertEqual(bad.status_code, 400)

        second = Table.objects.create(book=book, name="Second", position=1)
        response = self.client.post(f"/api/books/{book.pk}/reorder-tables/", {"order": [second.pk, table.pk]})
        self.assertEqual([item["name"] for item in response.data], ["Second", "Ledger"])

    def test_change_column_type_converts_values_when_they_all_fit(self):
        _book, table, (name, amount) = self.make_table(column_specs=(("Name", "text"), ("Amount", "text")))
        row = Row.objects.create(table=table, data={amount.key: "1,250"})
        response = self.client.patch(f"/api/columns/{amount.pk}/", {"data_type": "number"})
        self.assertEqual(response.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.data[amount.key], 1250)

    def test_change_column_type_is_refused_when_a_value_does_not_fit(self):
        _book, table, (name, amount) = self.make_table(column_specs=(("Name", "text"), ("Amount", "text")))
        row = Row.objects.create(table=table, data={amount.key: "about 20"})
        response = self.client.patch(f"/api/columns/{amount.pk}/", {"data_type": "number"})
        self.assertEqual(response.status_code, 400)
        amount.refresh_from_db()
        row.refresh_from_db()
        self.assertEqual(amount.data_type, "text")
        self.assertEqual(row.data[amount.key], "about 20")


class RowTests(BaseAPITest):
    def test_add_and_edit_rows(self):
        _book, table, (name, amount) = self.make_table()
        created = self.client.post("/api/rows/", {"table": table.pk, "data": {name.key: "Ravi", amount.key: "250"}})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["data"], {name.key: "Ravi", amount.key: 250})

        # PATCH changes only the cells that are sent.
        patched = self.client.patch(f"/api/rows/{created.data['id']}/", {"data": {amount.key: 300}})
        self.assertEqual(patched.data["data"], {name.key: "Ravi", amount.key: 300})

        second = self.client.post("/api/rows/", {"table": table.pk})
        self.assertEqual(second.data["position"], 1)

    def test_every_column_type_is_checked(self):
        specs = (("Task", "text"), ("Cost", "number"), ("Due", "date"), ("Done", "checkbox"))
        _book, table, (task, cost, due, done) = self.make_table(column_specs=specs)
        good = self.client.post("/api/rows/", {"table": table.pk, "data": {
            task.key: "Order stock", cost.key: 99.5, due.key: "2026-10-10", done.key: True,
        }})
        self.assertEqual(good.status_code, 201)

        bad = self.client.post("/api/rows/", {"table": table.pk, "data": {
            cost.key: "cheap", due.key: "tomorrow", done.key: "maybe", "9999": "x",
        }})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(set(bad.data["data"]), {cost.key, due.key, done.key, "9999"})
        self.assertEqual(Row.objects.count(), 1)

    def test_reorder_rows(self):
        _book, table, (name, _amount) = self.make_table()
        rows = [Row.objects.create(table=table, data={name.key: label}, position=index)
                for index, label in enumerate("ABC")]
        order = [rows[2].pk, rows[0].pk, rows[1].pk]
        response = self.client.post(f"/api/tables/{table.pk}/reorder-rows/", {"order": order})
        self.assertEqual([row["data"][name.key] for row in response.data["rows"]], ["C", "A", "B"])

    def test_user_cannot_add_rows_to_another_users_table(self):
        _book, table, _columns = self.make_table(owner=self.sita)
        self.assertEqual(self.client.post("/api/rows/", {"table": table.pk}).status_code, 400)
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/").status_code, 404)


class DeleteAndTrashTests(BaseAPITest):
    def test_delete_does_nothing_until_confirmed(self):
        _book, table, (name, _amount) = self.make_table()
        Row.objects.create(table=table, data={name.key: "Ravi"})

        response = self.client.delete(f"/api/tables/{table.pk}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["confirm_required"])
        self.assertEqual(response.data["will_delete"], 'Table "Ledger" with 2 columns and 1 row')
        self.assertTrue(Table.objects.filter(pk=table.pk).exists())

        self.assertEqual(self.client.delete(f"/api/tables/{table.pk}/?confirm=true").status_code, 204)
        self.assertFalse(Table.objects.filter(pk=table.pk).exists())
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/").status_code, 404)

    def test_confirmation_can_be_sent_in_the_body(self):
        book, _table, _columns = self.make_table()
        self.assertEqual(self.client.delete(f"/api/books/{book.pk}/", {"confirm": True}).status_code, 204)

    def test_deleted_items_go_to_trash_and_can_be_restored(self):
        _book, table, (name, amount) = self.make_table()
        row = Row.objects.create(table=table, data={name.key: "Ravi", amount.key: 250})

        self.client.delete(f"/api/columns/{amount.pk}/?confirm=true")
        shown = self.client.get(f"/api/tables/{table.pk}/").data
        self.assertEqual([column["name"] for column in shown["columns"]], ["Name"])
        self.assertEqual(shown["rows"][0]["data"], {name.key: "Ravi"})

        trash = self.client.get("/api/trash/").data
        self.assertEqual([column["name"] for column in trash["columns"]], ["Amount"])

        restored = self.client.post(f"/api/columns/{amount.pk}/restore/")
        self.assertEqual(restored.status_code, 200)
        shown = self.client.get(f"/api/tables/{table.pk}/").data
        self.assertEqual(shown["rows"][0]["data"], {name.key: "Ravi", amount.key: 250})
        self.assertEqual(self.client.get("/api/trash/").data["columns"], [])

        self.client.delete(f"/api/rows/{row.pk}/?confirm=true")
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/").data["rows"], [])
        self.client.post(f"/api/rows/{row.pk}/restore/")
        self.assertEqual(len(self.client.get(f"/api/tables/{table.pk}/").data["rows"]), 1)

    def test_deleting_a_book_hides_everything_inside_it(self):
        book, table, (name, _amount) = self.make_table()
        row = Row.objects.create(table=table, data={name.key: "Ravi"})
        self.client.delete(f"/api/books/{book.pk}/?confirm=true")

        self.assertEqual(self.client.get("/api/books/").data, [])
        self.assertEqual(self.client.get("/api/tables/").data, [])
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/rows/{row.pk}/", {"data": {}}).status_code, 404)
        self.assertEqual(self.client.post("/api/rows/", {"table": table.pk}).status_code, 400)

        self.client.post(f"/api/books/{book.pk}/restore/")
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/").status_code, 200)

    def test_trash_is_private(self):
        book, _table, _columns = self.make_table(owner=self.sita)
        book.soft_delete()
        self.assertEqual(self.client.get("/api/trash/").data["books"], [])
        self.assertEqual(self.client.post(f"/api/books/{book.pk}/restore/").status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(self.client.get("/api/trash/").data["books"]), 1)


class BookletEndpointTests(BaseAPITest):
    def test_table_pages_repeat_the_first_column(self):
        specs = tuple((letter, "text") for letter in "ABCDEFGHIJ")
        _book, table, columns = self.make_table(column_specs=specs)
        for number in range(1, 6):
            Row.objects.create(
                table=table, position=number,
                data={column.key: f"{column.name}{number}" for column in columns},
            )
        response = self.client.get(f"/api/tables/{table.pk}/pages/?columns_per_page=5&rows_per_page=15")
        self.assertEqual(response.data["page_count"], 3)
        layout = [[column["name"] for column in page["columns"]] for page in response.data["pages"]]
        self.assertEqual(layout, [list("ABCDE"), list("AFGHI"), list("AJ")])

    def test_book_booklet_has_cover_contents_and_tables(self):
        book, table, (name, amount) = self.make_table()
        Row.objects.create(table=table, data={name.key: "Ravi", amount.key: 250})
        response = self.client.get(f"/api/books/{book.pk}/booklet/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([page["type"] for page in response.data["pages"]], ["cover", "contents", "table"])
        self.assertEqual(response.data["pages"][2]["rows"][0]["cells"], ["Ravi", 250])

    def test_deleted_columns_and_rows_are_not_in_the_booklet(self):
        book, table, (name, amount) = self.make_table()
        Row.objects.create(table=table, data={name.key: "Ravi", amount.key: 250})
        gone = Row.objects.create(table=table, data={name.key: "Gone"}, position=1)
        amount.soft_delete()
        gone.soft_delete()
        page = self.client.get(f"/api/books/{book.pk}/booklet/").data["pages"][2]
        self.assertEqual([column["name"] for column in page["columns"]], ["Name"])
        self.assertEqual([row["cells"] for row in page["rows"]], [["Ravi"]])

    def test_page_size_must_be_a_number(self):
        _book, table, _columns = self.make_table()
        self.assertEqual(self.client.get(f"/api/tables/{table.pk}/pages/?rows_per_page=lots").status_code, 400)
