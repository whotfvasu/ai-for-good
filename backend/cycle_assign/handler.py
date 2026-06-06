from __future__ import annotations

from typing import Any

from backend.shared.confirmations import get_store
from backend.shared.http import json_body, response


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """POST /cycle/assign  body {cycle_id, donor_id}

    Coordinator override: manually assign a donor to a cycle that the system
    couldn't auto-resolve (the exception-queue action). Moves it back to
    auto_running with the chosen donor pending confirmation.
    """
    body = json_body(event)
    cycle_id = body.get("cycle_id")
    donor_id = body.get("donor_id")
    if not cycle_id or not donor_id:
        return response(400, {"error": "cycle_id and donor_id are required"})

    store = get_store()
    row = store.get(cycle_id)
    if row is None:
        return response(404, {"error": "cycle not found", "cycle_id": cycle_id})

    row["assigned_donor_id"] = donor_id
    row["donor_status"] = "pending"
    row["state"] = "auto_running"
    row["note"] = "Coordinator manually assigned a donor. Ready for WhatsApp send."
    row.pop("donor_notified_at", None)
    row.pop("last_notified_donor_id", None)
    row.pop("last_message_text", None)
    row.pop("whatsapp_status", None)
    return response(200, store.put(row))
