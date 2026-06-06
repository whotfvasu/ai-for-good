from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.confirmations import get_store
from backend.shared.cycle_engine import apply_confirmation
from backend.shared.dates import parse_date
from backend.shared.http import json_body, response
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """POST /confirm  body {cycle_id, party: donor|patient, decision: yes|no}

    A donor or patient responds to a confirmation request. Advances the cycle;
    on donor decline, auto-rotates to the next ready bridge donor.
    """
    body = json_body(event)
    cycle_id = body.get("cycle_id")
    party = (body.get("party") or "").lower()
    decision = body.get("decision") or ""

    if not cycle_id or party not in {"donor", "patient"}:
        return response(400, {"error": "cycle_id and party (donor|patient) are required"})

    anchor_date = parse_date(body.get("anchor_date")) or date.today()
    updated = apply_confirmation(get_store(), get_repository(), cycle_id, party, decision, anchor_date)
    if updated is None:
        return response(404, {"error": "cycle not found", "cycle_id": cycle_id})

    return response(200, updated)
