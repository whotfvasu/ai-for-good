from __future__ import annotations

import json
from typing import Any

from backend.shared.bedrock import invoke, load_prompt
from backend.shared.constants import NOTIFICATION_TRIGGERS
from backend.shared.http import json_body, response
from backend.shared.memory import (
    append_conversation_turn,
    default_insight,
    get_donor_insight,
    utc_now_iso,
)
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    payload = json_body(event)
    donor_id = payload.get("donor_id")
    patient_id = payload.get("patient_id")
    trigger = payload.get("trigger")

    if not donor_id or not patient_id or not trigger:
        return response(400, {"error": "donor_id, patient_id, and trigger are required"})
    if trigger not in NOTIFICATION_TRIGGERS:
        return response(400, {"error": "invalid trigger", "trigger": trigger})

    repository = get_repository()
    donor = repository.donor(donor_id)
    patient = repository.patient(patient_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})
    if patient is None:
        return response(404, {"error": "patient not found", "patient_id": patient_id})

    insight = get_donor_insight(donor_id) or default_insight(donor)
    patient_context = {
        "patient_id": patient.patient_id,
        "blood_group": patient.blood_group,
        "quantity_required": patient.quantity_required,
        "next_needed_date": patient.expected_next_transfusion_date.isoformat() if patient.expected_next_transfusion_date else None,
        "frequency_in_days": patient.frequency_in_days,
    }
    prompt = load_prompt(
        "notification_outreach",
        insight=json.dumps(insight, default=str),
        patient=json.dumps(patient_context, default=str),
        trigger=trigger,
    )
    model_response = invoke(None, prompt, max_tokens=400)
    ts = utc_now_iso()
    turn = append_conversation_turn(
        donor_id,
        "saathi",
        model_response["text"],
        lang=insight.get("preferred_language", "en"),
        meta={
            "trigger": trigger,
            "prompt_version": "notification_outreach.txt",
            "usage": model_response.get("usage", {}),
            "model": model_response.get("model_id"),
            "message_type": "notification_outreach",
            "patient_id": patient_id,
        },
        ts=ts,
    )
    return response(
        200,
        {
            "donor_id": donor_id,
            "ts": turn["ts"],
            "message": turn["text"],
            "model": model_response.get("model_id"),
            "usage": model_response.get("usage", {}),
            "channel": insight.get("preferred_channel", "whatsapp"),
            "language": insight.get("preferred_language", "en"),
        },
    )
