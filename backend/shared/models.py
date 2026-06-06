from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Patient:
    patient_id: str
    blood_group: str
    latitude: float | None
    longitude: float | None
    last_transfusion_date: date | None
    expected_next_transfusion_date: date | None
    frequency_in_days: int | None
    quantity_required: int | None
    gender: str | None
    status: str | None
    # Blood Bridge — the dedicated rotating donor pool that sustains this patient.
    bridge_id: str | None = None
    bridge_blood_group: str | None = None


@dataclass(frozen=True)
class Donor:
    donor_id: str
    blood_group: str
    latitude: float | None
    longitude: float | None
    donor_type: str | None
    last_contacted_date: date | None
    last_donation_date: date | None
    next_eligible_date: date | None
    donations_till_date: int
    eligibility_status: str | None
    cycle_of_donations: int | None
    total_calls: int
    calls_to_donations_ratio: float | None
    active_status: str | None
    inactive_trigger_comment: str | None
    # Blood Bridge membership — which patient's bridge this donor belongs to.
    bridge_id: str | None = None
    bridge_blood_group: str | None = None
    last_bridge_donation_date: date | None = None
