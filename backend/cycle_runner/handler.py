from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.confirmations import get_store
from backend.shared.cycle_engine import run_cycles
from backend.shared.dates import parse_date, parse_int
from backend.shared.http import json_body, query_params, response
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Runs the autonomous loop one pass.

    Invoked by EventBridge (daily) with no params, by POST /cycle/run (demo
    button), or with ?anchor_date=&window=. Returns a summary of what it did.
    """
    params = {**json_body(event), **query_params(event)}
    anchor_date = parse_date(params.get("anchor_date")) or date.today()
    window = parse_int(params.get("window"), 14) or 14

    summary = run_cycles(get_repository(), get_store(), anchor_date, window)
    return response(200, {"anchor_date": anchor_date.isoformat(), "window": window, "summary": summary})
