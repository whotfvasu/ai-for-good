from __future__ import annotations

from typing import Any

from backend.shared.confirmations import get_store
from backend.shared.http import query_params, response


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """GET /cycles?state=needs_coordinator|auto_running|resolved

    Lists confirmation-ledger rows, optionally filtered by state. Powers the
    coordinator's exception queue and the auto-resolved/needs-you counters.
    """
    params = query_params(event)
    state_filter = params.get("state")

    rows = get_store().all()
    if state_filter:
        rows = [r for r in rows if r.get("state") == state_filter]

    # Newest-needed first.
    rows.sort(key=lambda r: r.get("next_needed_date", ""))

    counts: dict[str, int] = {}
    for r in get_store().all():
        counts[r.get("state", "unknown")] = counts.get(r.get("state", "unknown"), 0) + 1

    return response(200, {"items": rows, "counts": counts})
