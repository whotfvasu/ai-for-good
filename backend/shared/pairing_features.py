"""Feature extraction for the donor-pairing model.

Shared by the training script and the Lambda scorer so the feature vector is
identical in both places. Pure Python — no numpy, no pandas — so it runs inside
a dependency-free Lambda.
"""
from __future__ import annotations

from datetime import date

from .models import Donor

# Order matters — the model's f0, f1, ... map to these by position.
FEATURE_NAMES = [
    "donations_till_date",
    "total_calls",
    "calls_to_donations_ratio",
    "cycle_of_donations",
    "days_since_last_donation",
    "days_since_last_contact",
    "is_eligible",
    "is_bridge_member",
    "is_regular_donor",
]


def _days(d: date | None, anchor: date) -> float:
    if d is None:
        return 365.0  # unknown → treat as long ago
    return float((anchor - d).days)


def extract(donor: Donor, anchor_date: date) -> list[float]:
    eligible = 1.0 if (donor.eligibility_status == "eligible") else 0.0
    if not eligible and donor.next_eligible_date and donor.next_eligible_date <= anchor_date:
        eligible = 1.0

    return [
        float(donor.donations_till_date or 0),
        float(donor.total_calls or 0),
        float(donor.calls_to_donations_ratio if donor.calls_to_donations_ratio is not None else 1.0),
        float(donor.cycle_of_donations or 0),
        _days(donor.last_donation_date, anchor_date),
        _days(donor.last_contacted_date, anchor_date),
        eligible,
        1.0 if donor.bridge_id else 0.0,
        1.0 if (donor.donor_type or "").lower().startswith("regular") else 0.0,
    ]
