import datetime

from django.test import SimpleTestCase

from books.values import clean_value


class CleanValueTests(SimpleTestCase):
    def test_empty_is_none_for_every_type(self):
        for data_type in ("text", "number", "date", "checkbox"):
            self.assertIsNone(clean_value(data_type, None))
            self.assertIsNone(clean_value(data_type, "   "))

    def test_text(self):
        self.assertEqual(clean_value("text", "  Ravi "), "Ravi")
        self.assertEqual(clean_value("text", 250), "250")
        self.assertEqual(clean_value("text", 12.0), "12")
        self.assertEqual(clean_value("text", True), "Yes")
        self.assertEqual(clean_value("text", datetime.date(2026, 10, 4)), "2026-10-04")

    def test_number(self):
        self.assertEqual(clean_value("number", 250), 250)
        self.assertEqual(clean_value("number", "1,250"), 1250)
        self.assertEqual(clean_value("number", "12.50"), 12.5)
        self.assertIsInstance(clean_value("number", 7.0), int)
        for bad in ("abc", True, "nan", [1]):
            with self.assertRaises(ValueError):
                clean_value("number", bad)

    def test_date(self):
        self.assertEqual(clean_value("date", "2026-10-04"), "2026-10-04")
        self.assertEqual(clean_value("date", datetime.datetime(2026, 10, 4, 9, 30)), "2026-10-04")
        for bad in ("04/10/2026", "soon", 20261004):
            with self.assertRaises(ValueError):
                clean_value("date", bad)

    def test_checkbox(self):
        self.assertIs(clean_value("checkbox", True), True)
        self.assertIs(clean_value("checkbox", "Yes"), True)
        self.assertIs(clean_value("checkbox", "no"), False)
        self.assertIs(clean_value("checkbox", 0), False)
        with self.assertRaises(ValueError):
            clean_value("checkbox", "maybe")
