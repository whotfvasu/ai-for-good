from __future__ import annotations

from datetime import date
from typing import Any

from backend.shared.constants import DEFAULT_DONOR_LIMIT
from backend.shared.dates import parse_date, parse_int
from backend.shared.http import query_params, response
from backend.shared.ranking import rank_donors
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    params = query_params(event)
    patient_id = params.get("patient_id")
    if not patient_id:
        return response(400, {"error": "patient_id is required"})

    limit = parse_int(params.get("limit"), DEFAULT_DONOR_LIMIT) or DEFAULT_DONOR_LIMIT
    anchor_date = parse_date(params.get("anchor_date")) or date.today()

    repository = get_repository()
    patient = repository.patient(patient_id)
    if patient is None:
        return response(404, {"error": "patient not found", "patient_id": patient_id})

    items = rank_donors(patient, repository.donors(), anchor_date, limit)
    return response(200, {"patient_id": patient.patient_id, "anchor_date": anchor_date, "items": items})
