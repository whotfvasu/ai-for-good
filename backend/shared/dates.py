from __future__ import annotations

from datetime import date, datetime, timedelta


DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S")


def parse_date(value: str | None) -> date | None:
    if not value:
        return None

    text = str(value).strip()
    if not text:
        return None

    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            pass

    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def add_days(base_date: date | None, days: int | None) -> date | None:
    if base_date is None or days is None:
        return None
    return base_date + timedelta(days=days)


def parse_int(value: str | int | float | None, default: int | None = None) -> int | None:
    if value in (None, ""):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_float(value: str | int | float | None, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
