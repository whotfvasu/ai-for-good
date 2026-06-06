from __future__ import annotations

from typing import Any

from backend.shared.confirmations import get_store
from backend.shared.cycle_engine import notify_assigned_donor
from backend.shared.http import json_body, response
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """POST /cycle/notify body {cycle_id}

    Sends the donor WhatsApp for a prepared cycle. Cycle creation itself stays
    quiet so coordinators control when messages leave the dashboard.
    """
    body = json_body(event)
    cycle_id = body.get("cycle_id")
    if not cycle_id:
        return response(400, {"error": "cycle_id is required"})

    updated = notify_assigned_donor(get_store(), get_repository(), cycle_id)
    if updated is None:
        return response(404, {"error": "cycle not found", "cycle_id": cycle_id})
    if not updated.get("assigned_donor_id"):
        return response(409, {"error": "cycle has no assigned donor", "cycle_id": cycle_id})

    return response(200, updated)
