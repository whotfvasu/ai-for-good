from __future__ import annotations

from datetime import date
from math import asin, cos, radians, sin, sqrt

from .constants import BLOOD_COMPATIBILITY
from .models import Donor, Patient


def blood_group_compatible(donor_group: str, patient_group: str) -> bool:
    compatible_recipients = BLOOD_COMPATIBILITY.get(donor_group, set())
    return patient_group in compatible_recipients


def haversine_km(
    lat1: float | None,
    lon1: float | None,
    lat2: float | None,
    lon2: float | None,
) -> float | None:
    if None in (lat1, lon1, lat2, lon2):
        return None

    radius_km = 6371.0
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    origin_lat = radians(lat1)
    target_lat = radians(lat2)
    haversine = sin(delta_lat / 2) ** 2 + cos(origin_lat) * cos(target_lat) * sin(delta_lon / 2) ** 2
    return 2 * radius_km * asin(sqrt(haversine))


def rank_donors(
    patient: Patient,
    donors: list[Donor],
    anchor_date: date,
    limit: int,
) -> list[dict[str, object]]:
    ranked: list[dict[str, object]] = []

    for donor in donors:
        group_compat = 1.0 if blood_group_compatible(donor.blood_group, patient.blood_group) else 0.0
        if group_compat == 0:
            continue

        eligible = _eligible(donor, anchor_date)
        days_since_last = (anchor_date - donor.last_donation_date).days if donor.last_donation_date else None
        recency_weight = _recency_weight(days_since_last)
        responsiveness = _responsiveness(donor)
        distance_km = haversine_km(patient.latitude, patient.longitude, donor.latitude, donor.longitude)
        distance_weight = _distance_weight(distance_km)

        score = (
            (1.0 if eligible else 0.0)
            * (
                recency_weight * 0.3
                + responsiveness * 0.4
                + distance_weight * 0.3
                + group_compat
            )
            / 2.0
        )

        ranked.append(
            {
                "donor_id": donor.donor_id,
                "score": round(score, 3),
                "blood_group": donor.blood_group,
                "donor_type": donor.donor_type,
                "factors": {
                    "eligible": eligible,
                    "days_since_last": days_since_last,
                    "responsiveness": round(responsiveness, 3),
                    "distance_km": round(distance_km, 2) if distance_km is not None else None,
                    "group_compat": group_compat,
                    "recency_weight": round(recency_weight, 3),
                },
            }
        )

    return sorted(ranked, key=lambda item: item["score"], reverse=True)[:limit]


def _eligible(donor: Donor, anchor_date: date) -> bool:
    if donor.eligibility_status == "eligible":
        return True
    if donor.next_eligible_date:
        return donor.next_eligible_date <= anchor_date
    return False


def _recency_weight(days_since_last: int | None) -> float:
    if days_since_last is None:
        return 0.4
    if days_since_last < 0:
        return 0.0
    return max(0.0, min(days_since_last / 90, 1.0))


def _responsiveness(donor: Donor) -> float:
    if donor.calls_to_donations_ratio is not None:
        return max(0.0, min(donor.calls_to_donations_ratio, 1.0))
    if donor.total_calls <= 0:
        return 0.25
    return max(0.0, min(donor.donations_till_date / donor.total_calls, 1.0))


def _distance_weight(distance_km: float | None) -> float:
    if distance_km is None:
        return 0.5
    return max(0.0, 1 - min(distance_km, 50.0) / 50.0)
