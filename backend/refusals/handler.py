from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.dates import parse_date
from backend.shared.http import json_body, response
from backend.shared.memory import (
    append_conversation_turn,
    default_insight,
    get_donor_insight,
    record_refusal,
)
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """POST /refusals body {donor_id, reason_bucket?, text?, anchor_date?}

    Captures a donor's "no" as structured memory so future automation waits,
    skips, or escalates instead of repeatedly nudging the same donor.
    """
    payload = json_body(event)
    donor_id = payload.get("donor_id")
    if not donor_id:
        return response(400, {"error": "donor_id is required"})

    donor = get_repository().donor(donor_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})

    reason = payload.get("reason_bucket")
    text = payload.get("text") or (f"I can't this time — {reason}." if reason else "I can't this time.")
    anchor_date = parse_date(payload.get("anchor_date")) or date.today()
    insight = get_donor_insight(donor_id) or default_insight(donor)

    refusal = record_refusal(
        donor_id,
        reason,
        text,
        anchor_date=anchor_date,
        base_insight=insight,
    )
    append_conversation_turn(
        donor_id,
        "user",
        text,
        lang=insight.get("preferred_language", "en"),
        meta={"message_type": "structured_refusal", "reason_bucket": refusal["reason_bucket"]},
    )

    return response(200, refusal)
