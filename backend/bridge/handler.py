from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.dates import parse_date
from backend.shared.forecasting import next_needed_date
from backend.shared.http import query_params, response
from backend.shared.pairing import importance as ml_importance
from backend.shared.ranking import rank_bridge_donors
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """GET /bridge?patient_id=...&anchor_date=...

    Returns the patient's Blood Bridge: the dedicated donor pool that rotates to
    sustain them, each donor tagged with rotation readiness.
    """
    params = query_params(event)
    patient_id = params.get("patient_id")
    if not patient_id:
        return response(400, {"error": "patient_id is required"})

    anchor_date = parse_date(params.get("anchor_date")) or date.today()

    repository = get_repository()
    patient, bridge_donors = repository.bridge_for_patient(patient_id)
    if patient is None:
        return response(404, {"error": "patient not found", "patient_id": patient_id})

    ranked = rank_bridge_donors(patient, bridge_donors, anchor_date)
    needed = next_needed_date(patient)

    ready = sum(1 for d in ranked if d["rotation_state"] == "ready")

    return response(
        200,
        {
            "patient_id": patient.patient_id,
            "bridge_id": patient.bridge_id,
            "bridge_blood_group": patient.bridge_blood_group or patient.blood_group,
            "next_needed_date": needed.isoformat() if needed else None,
            "pool_size": len(ranked),
            "ready_count": ready,
            "donors": ranked,
            "ml_importance": dict(list(ml_importance().items())[:4]),
        },
    )
