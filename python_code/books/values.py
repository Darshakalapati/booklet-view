"""
Cleaning the value of one cell.

Every column has a type. ``clean_value`` turns whatever was typed or uploaded
into the form that is stored, or raises ``ValueError`` with a message that can
be shown to the person.

    text      stored as a string
    number    stored as a number (whole numbers stay whole)
    date      stored as "YYYY-MM-DD"
    checkbox  stored as true / false

An empty cell is stored as ``None`` for every type.
"""

import datetime
import math
from decimal import Decimal, InvalidOperation

TRUE_WORDS = {"true", "yes", "y", "1", "checked", "done", "✓", "✔"}
FALSE_WORDS = {"false", "no", "n", "0", "unchecked", "✗", "✘"}


def is_empty(raw):
    return raw is None or (isinstance(raw, str) and raw.strip() == "")


def clean_text(raw):
    if isinstance(raw, bool):
        return "Yes" if raw else "No"
    if isinstance(raw, float) and raw.is_integer():
        return str(int(raw))
    if isinstance(raw, datetime.datetime):
        return raw.date().isoformat() if raw.time() == datetime.time(0) else raw.isoformat(sep=" ")
    if isinstance(raw, datetime.date):
        return raw.isoformat()
    return str(raw).strip()


def clean_number(raw):
    if isinstance(raw, bool):
        raise ValueError("Expected a number.")
    if isinstance(raw, (int, float)):
        number = Decimal(str(raw))
    elif isinstance(raw, Decimal):
        number = raw
    elif isinstance(raw, str):
        try:
            number = Decimal(raw.strip().replace(",", ""))
        except InvalidOperation:
            raise ValueError(f'"{raw}" is not a number.')
    else:
        raise ValueError("Expected a number.")
    if not number.is_finite():
        raise ValueError("Expected a number.")
    if number == number.to_integral_value():
        return int(number)
    as_float = float(number)
    if math.isinf(as_float):
        raise ValueError("That number is too large.")
    return as_float


def clean_date(raw):
    if isinstance(raw, datetime.datetime):
        return raw.date().isoformat()
    if isinstance(raw, datetime.date):
        return raw.isoformat()
    if isinstance(raw, str):
        text = raw.strip()
        try:
            return datetime.date.fromisoformat(text).isoformat()
        except ValueError:
            pass
        try:
            return datetime.datetime.fromisoformat(text).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f'"{raw}" is not a date. Use the form YYYY-MM-DD.')


def clean_checkbox(raw):
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)) and raw in (0, 1):
        return bool(raw)
    if isinstance(raw, str):
        word = raw.strip().lower()
        if word in TRUE_WORDS:
            return True
        if word in FALSE_WORDS:
            return False
    raise ValueError(f'"{raw}" is not a yes/no value.')


CLEANERS = {
    "text": clean_text,
    "number": clean_number,
    "date": clean_date,
    "checkbox": clean_checkbox,
}


def clean_value(data_type, raw):
    if is_empty(raw):
        return None
    return CLEANERS[data_type](raw)
