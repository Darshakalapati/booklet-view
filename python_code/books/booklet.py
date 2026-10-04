"""
Turning tables into the pages of a book.

This module decides *what goes on each page*. It knows nothing about the
screen: the caller says how many columns and rows fit on one page (a phone
fits fewer than a laptop) and gets back a list of pages to draw.

Rules:

1. A table wider than one page is split across pages, and the FIRST COLUMN IS
   REPEATED on every continuation page, so the reader always sees which row
   they are looking at.

       10 columns A..J, 5 fit on a page:
           page 1:  A  B  C  D  E
           page 2:  A  F  G  H  I
           page 3:  A  J

2. A table longer than one page continues on later pages. The reader goes
   ACROSS first, then DOWN: every column page for rows 1-15, then every
   column page for rows 16-30, and so on.

3. Each table starts on a new page with its name as the heading. The book
   opens with a cover and a contents page.
"""

MIN_COLUMNS_PER_PAGE = 2  # the repeated first column plus at least one more
MAX_COLUMNS_PER_PAGE = 50
MIN_ROWS_PER_PAGE = 1
MAX_ROWS_PER_PAGE = 200


def clamp(value, low, high):
    return max(low, min(high, value))


def chunk(items, size):
    return [items[start:start + size] for start in range(0, len(items), size)]


def split_columns(columns, columns_per_page):
    """Split columns into page-sized groups, repeating the first column."""
    columns = list(columns)
    columns_per_page = clamp(columns_per_page, MIN_COLUMNS_PER_PAGE, MAX_COLUMNS_PER_PAGE)
    if len(columns) <= columns_per_page:
        return [columns]
    first, rest = columns[0], columns[1:]
    return [[first] + group for group in chunk(rest, columns_per_page - 1)]


def build_table_pages(table, columns, rows, columns_per_page, rows_per_page):
    """Pages for one table. ``columns`` and ``rows`` must already be in order."""
    columns, rows = list(columns), list(rows)
    rows_per_page = clamp(rows_per_page, MIN_ROWS_PER_PAGE, MAX_ROWS_PER_PAGE)

    column_groups = split_columns(columns, columns_per_page)
    row_groups = chunk(rows, rows_per_page) or [[]]

    pages = []
    for row_part, row_group in enumerate(row_groups, start=1):
        first_row_number = (row_part - 1) * rows_per_page + 1
        for column_part, column_group in enumerate(column_groups, start=1):
            pages.append({
                "type": "table",
                "table_id": table.pk,
                "table_name": table.name,
                "starts_table": row_part == 1 and column_part == 1,
                "column_part": column_part,
                "column_parts": len(column_groups),
                "row_part": row_part,
                "row_parts": len(row_groups),
                "first_column_repeated": column_part > 1,
                "columns": [
                    {"id": column.pk, "name": column.name, "data_type": column.data_type}
                    for column in column_group
                ],
                "rows": [
                    {
                        "id": row.pk,
                        "number": first_row_number + offset,
                        "cells": [row.data.get(column.key) for column in column_group],
                    }
                    for offset, row in enumerate(row_group)
                ],
            })
    return pages


def build_book_pages(book, tables_with_content, columns_per_page, rows_per_page):
    """Every page of a book, numbered, starting with the cover.

    ``tables_with_content`` is a list of ``(table, columns, rows)`` in order.
    """
    rows_per_page = clamp(rows_per_page, MIN_ROWS_PER_PAGE, MAX_ROWS_PER_PAGE)

    table_page_groups = [
        build_table_pages(table, columns, rows, columns_per_page, rows_per_page)
        for table, columns, rows in tables_with_content
    ]

    # The contents list is itself paged, so its length has to be known before
    # the table page numbers can be worked out.
    contents_page_count = max(1, -(-len(table_page_groups) // rows_per_page))
    next_page_number = 1 + contents_page_count + 1  # cover, contents, then tables

    entries = []
    for (table, _columns, _rows), pages in zip(tables_with_content, table_page_groups):
        entries.append({"table_id": table.pk, "table_name": table.name, "page_number": next_page_number})
        next_page_number += len(pages)

    pages = [{"type": "cover", "title": book.title, "owner": book.owner.get_full_name() or book.owner.username}]
    for entry_group in chunk(entries, rows_per_page) or [[]]:
        pages.append({"type": "contents", "entries": entry_group})
    for table_pages in table_page_groups:
        pages.extend(table_pages)

    for number, page in enumerate(pages, start=1):
        page["page_number"] = number
    return pages
