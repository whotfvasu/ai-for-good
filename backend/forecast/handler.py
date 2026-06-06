from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.constants import DEFAULT_FORECAST_WINDOW_DAYS
from backend.shared.dates import parse_date, parse_int
from backend.shared.forecasting import forecast_patients
from backend.shared.http import query_params, response
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    params = query_params(event)
    window_days = parse_int(params.get("window"), DEFAULT_FORECAST_WINDOW_DAYS) or DEFAULT_FORECAST_WINDOW_DAYS
    anchor_date = parse_date(params.get("anchor_date")) or date.today()
    sort = params.get("sort", "date")

    if sort not in {"date", "worry"}:
        return response(400, {"error": "sort must be one of: date, worry"})

    repository = get_repository()
    items = forecast_patients(repository.patients(), anchor_date, window_days, sort)
    return response(200, {"anchor_date": anchor_date, "window": window_days, "items": items})
