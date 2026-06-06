from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.shared.http import json_body, response


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    payload = json_body(event)
    cycle_id = payload.get("cycle_id")
    if not cycle_id:
        return response(400, {"error": "cycle_id is required"})

    return response(
        200,
        {
            "cycle_id": cycle_id,
            "family_reassured_at": datetime.now(timezone.utc).isoformat(),
            "status": "acknowledged",
        },
    )
