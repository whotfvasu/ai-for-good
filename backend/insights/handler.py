from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.dates import parse_date
from backend.shared.http import query_params, response
from backend.shared.insights import compute_insights
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """GET /insights?anchor_date=...

    Network-level operational analytics for the coordinator dashboard.
    """
    params = query_params(event)
    anchor_date = parse_date(params.get("anchor_date")) or date.today()
    return response(200, compute_insights(get_repository(), anchor_date))
