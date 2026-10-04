"""Tests for how tables are laid out on the pages of the book."""

from types import SimpleNamespace

from django.test import SimpleTestCase

from books.booklet import build_book_pages, build_table_pages, split_columns


def make_table(column_names, row_count, name="Members"):
    table = SimpleNamespace(pk=1, name=name)
    columns = [
        SimpleNamespace(pk=index, key=str(index), name=column_name, data_type="text")
        for index, column_name in enumerate(column_names, start=1)
    ]
    rows = [
        SimpleNamespace(pk=row_number, data={column.key: f"{column.name}{row_number}" for column in columns})
        for row_number in range(1, row_count + 1)
    ]
    return table, columns, rows


def names(page):
    return [column["name"] for column in page["columns"]]


class SplitColumnsTests(SimpleTestCase):
    def test_narrow_table_stays_on_one_page(self):
        self.assertEqual(split_columns(list("ABCDE"), 5), [list("ABCDE")])

    def test_first_column_repeats_on_every_continuation_page(self):
        # The librarian example: 10 columns, 5 fit on a phone page.
        self.assertEqual(
            split_columns(list("ABCDEFGHIJ"), 5),
            [list("ABCDE"), list("AFGHI"), list("AJ")],
        )

    def test_never_fewer_than_two_columns_per_page(self):
        self.assertEqual(split_columns(list("ABC"), 1), [list("AB"), list("AC")])

    def test_no_columns(self):
        self.assertEqual(split_columns([], 5), [[]])


class TablePagesTests(SimpleTestCase):
    def test_librarian_example(self):
        table, columns, rows = make_table(list("ABCDEFGHIJ"), 5)
        pages = build_table_pages(table, columns, rows, columns_per_page=5, rows_per_page=15)

        self.assertEqual([names(page) for page in pages], [list("ABCDE"), list("AFGHI"), list("AJ")])
        self.assertEqual([page["first_column_repeated"] for page in pages], [False, True, True])
        self.assertEqual([page["starts_table"] for page in pages], [True, False, False])
        # The same five rows, in the same order, on every page.
        for page in pages:
            self.assertEqual([row["number"] for row in page["rows"]], [1, 2, 3, 4, 5])
            self.assertEqual([row["cells"][0] for row in page["rows"]], ["A1", "A2", "A3", "A4", "A5"])
        self.assertEqual(pages[1]["rows"][2]["cells"], ["A3", "F3", "G3", "H3", "I3"])

    def test_goes_across_before_going_down(self):
        table, columns, rows = make_table(list("ABCDEFG"), 7)
        pages = build_table_pages(table, columns, rows, columns_per_page=4, rows_per_page=3)

        self.assertEqual(
            [(page["row_part"], page["column_part"]) for page in pages],
            [(1, 1), (1, 2), (2, 1), (2, 2), (3, 1), (3, 2)],
        )
        self.assertEqual([row["number"] for row in pages[2]["rows"]], [4, 5, 6])
        self.assertEqual([row["number"] for row in pages[5]["rows"]], [7])
        self.assertEqual(names(pages[3]), list("AEFG"))

    def test_empty_cells_are_none(self):
        table, columns, rows = make_table(list("AB"), 1)
        rows[0].data = {"1": "only A"}
        pages = build_table_pages(table, columns, rows, 5, 15)
        self.assertEqual(pages[0]["rows"][0]["cells"], ["only A", None])

    def test_table_without_rows_still_gets_a_page(self):
        table, columns, _rows = make_table(list("AB"), 0)
        pages = build_table_pages(table, columns, [], 5, 15)
        self.assertEqual(len(pages), 1)
        self.assertEqual(pages[0]["rows"], [])


class BookPagesTests(SimpleTestCase):
    def make_book(self):
        owner = SimpleNamespace(username="ravi", get_full_name=lambda: "")
        return SimpleNamespace(pk=1, title="Library", owner=owner)

    def test_cover_contents_then_tables_with_page_numbers(self):
        members = make_table(list("ABCDEFGHIJ"), 5, name="Members")   # 3 pages
        prices = make_table(list("AB"), 2, name="Prices")             # 1 page
        prices[0].pk = 2
        pages = build_book_pages(self.make_book(), [members, prices], columns_per_page=5, rows_per_page=15)

        self.assertEqual([page["type"] for page in pages], ["cover", "contents", "table", "table", "table", "table"])
        self.assertEqual([page["page_number"] for page in pages], [1, 2, 3, 4, 5, 6])
        self.assertEqual(pages[0]["title"], "Library")
        self.assertEqual(pages[0]["owner"], "ravi")
        self.assertEqual(
            pages[1]["entries"],
            [
                {"table_id": 1, "table_name": "Members", "page_number": 3},
                {"table_id": 2, "table_name": "Prices", "page_number": 6},
            ],
        )
        # The contents page numbers point at the page where each table starts.
        for entry in pages[1]["entries"]:
            target = pages[entry["page_number"] - 1]
            self.assertEqual(target["table_name"], entry["table_name"])
            self.assertTrue(target["starts_table"])

    def test_long_contents_list_spreads_over_pages(self):
        tables = []
        for index in range(1, 6):
            table = make_table(list("AB"), 1, name=f"T{index}")
            table[0].pk = index
            tables.append(table)
        pages = build_book_pages(self.make_book(), tables, columns_per_page=5, rows_per_page=2)

        self.assertEqual([page["type"] for page in pages[:4]], ["cover", "contents", "contents", "contents"])
        first_entry = pages[1]["entries"][0]
        self.assertEqual(first_entry["page_number"], 5)
        self.assertEqual(pages[4]["table_name"], "T1")

    def test_empty_book_has_cover_and_empty_contents(self):
        pages = build_book_pages(self.make_book(), [], 5, 15)
        self.assertEqual([page["type"] for page in pages], ["cover", "contents"])
        self.assertEqual(pages[1]["entries"], [])
