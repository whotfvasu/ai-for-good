from __future__ import annotations

from datetime import date, timedelta

from .dates import add_days
from .models import Patient


def next_needed_date(patient: Patient) -> date | None:
    return patient.expected_next_transfusion_date or add_days(
        patient.last_transfusion_date,
        patient.frequency_in_days,
    )


def forecast_patients(
    patients: list[Patient],
    anchor_date: date,
    window_days: int,
    sort: str = "date",
) -> list[dict[str, object]]:
    end_date = anchor_date + timedelta(days=window_days)
    forecasts: list[dict[str, object]] = []

    for patient in patients:
        needed_date = next_needed_date(patient)
        if needed_date is None or not anchor_date <= needed_date <= end_date:
            continue

        days_to_needed = (needed_date - anchor_date).days
        confidence = "high" if (patient.frequency_in_days or 0) > 0 and patient.last_transfusion_date else "medium"
        worry_score = round(max(0, 1 - (days_to_needed / 14)), 3)

        forecasts.append(
            {
                "patient_id": patient.patient_id,
                "blood_group": patient.blood_group,
                "quantity_required": patient.quantity_required,
                "last_transfusion_date": patient.last_transfusion_date,
                "next_needed_date": needed_date,
                "days_to_needed": days_to_needed,
                "frequency_in_days": patient.frequency_in_days,
                "confidence": confidence,
                "worry_score": worry_score,
            }
        )

    if sort == "worry":
        return sorted(forecasts, key=lambda item: (-float(item["worry_score"]), item["next_needed_date"]))
    return sorted(forecasts, key=lambda item: item["next_needed_date"])
