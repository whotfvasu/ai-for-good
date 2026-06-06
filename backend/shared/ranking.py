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

        # Eligibility + compat are hard gates (compat already filtered above,
        # eligible used as 0/1 multiplier). The remaining three factors are
        # weighted to sum to 1.0, so a score lands in a clean [0, 1] range with
        # actual dynamic range — not the [0.65, 1.0] squeeze the old formula
        # produced when group_compat was added unweighted and everything was
        # divided by 2.
        score = (1.0 if eligible else 0.0) * (
            recency_weight * 0.30
            + responsiveness * 0.40
            + distance_weight * 0.30
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
    # Recency = "how warm is this donor's engagement?" Recent donors are warm,
    # stale donors have likely drifted. We linearly decay over 2 years; anyone
    # past 730 days gets a 0 contribution from recency (eligibility is a
    # separate gate and still allows them into the pool).
    #
    #   days_since_last  weight
    #     0              1.00   ← donated very recently, hottest signal
    #    90              0.88
    #   180              0.75
    #   365              0.50
    #   730              0.00
    #  1575              0.00
    if days_since_last is None:
        return 0.4
    if days_since_last < 0:
        return 0.0
    return max(0.0, 1.0 - min(days_since_last / 730, 1.0))


def _responsiveness(donor: Donor) -> float:
    # `calls_to_donations_ratio` in the dataset is calls-per-donation:
    #   0  → infinitely responsive (no calls needed at all)
    #   1  → mediocre (one call per donation)
    #   23 → terrible (23 calls per donation)
    #
    # We map [0, ∞) onto (0, 1] with a monotonically decreasing curve so the
    # score correctly rewards low ratios and penalises high ones — bounded,
    # no clamping needed.
    #
    #   ratio  responsiveness
    #     0       1.00
    #     0.33    0.75
    #     1.0     0.50
    #     5.0     0.17
    #    23.0     0.04
    if donor.calls_to_donations_ratio is not None:
        return 1.0 / (1.0 + max(0.0, donor.calls_to_donations_ratio))
    if donor.total_calls <= 0:
        return 0.25
    return max(0.0, min(donor.donations_till_date / donor.total_calls, 1.0))


def _distance_weight(distance_km: float | None) -> float:
    if distance_km is None:
        return 0.5
    return max(0.0, 1 - min(distance_km, 50.0) / 50.0)
