from __future__ import annotations

import json
from typing import Any

from backend.shared.bedrock import invoke, load_prompt
from backend.shared.http import json_body, response
from backend.shared.memory import (
    get_conversations,
    get_donor_insight,
    parse_json_object,
    put_donor_insight,
    utc_now_iso,
    validate_insight,
)
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    payload = event if isinstance(event, dict) else {}
    if "body" in payload:
        payload = json_body(event)

    donor_id = payload.get("donor_id")
    if not donor_id:
        return response(400, {"error": "donor_id is required"})

    repository = get_repository()
    donor = repository.donor(donor_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})

    turns = get_conversations(donor_id, limit=30, descending=True)
    donor_profile = {
        "donor_id": donor.donor_id,
        "blood_group": donor.blood_group,
        "donor_type": donor.donor_type,
        "eligibility_status": donor.eligibility_status,
        "donations_till_date": donor.donations_till_date,
        "calls_to_donations_ratio": donor.calls_to_donations_ratio,
        "total_calls": donor.total_calls,
        "active_status": donor.active_status,
    }
    prompt = load_prompt(
        "distill_insight",
        donor_profile=json.dumps(donor_profile, default=str),
        turns=json.dumps(turns, default=str),
    )
    model_response = invoke(None, prompt, max_tokens=600)
    existing = get_donor_insight(donor_id)
    try:
        insight = parse_json_object(model_response["text"])
        insight["donor_id"] = donor_id
        insight.setdefault("updated_at", utc_now_iso())
        insight = validate_insight(insight)
    except Exception as error:
        return response(
            500,
            {
                "error": str(error),
                "existing_insight": existing,
            },
        )

    stored = put_donor_insight(insight)
    return response(200, stored)
