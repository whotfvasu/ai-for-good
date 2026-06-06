from __future__ import annotations

from datetime import date
from math import asin, cos, radians, sin, sqrt

from .constants import BLOOD_COMPATIBILITY
from .models import Donor, Patient
from .pairing import score as pairing_score


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
        rule_score = (1.0 if eligible else 0.0) * (
            recency_weight * 0.30
            + responsiveness * 0.40
            + distance_weight * 0.30
        )

        # Blend the learned XGBoost propensity in when the model is available;
        # fall back to the pure rule score otherwise (demo never breaks).
        propensity = pairing_score(donor, anchor_date)
        if propensity is not None and eligible:
            score = round(0.6 * rule_score + 0.4 * propensity, 3)
        else:
            score = round(rule_score, 3)

        ranked.append(
            {
                "donor_id": donor.donor_id,
                "score": score,
                "blood_group": donor.blood_group,
                "donor_type": donor.donor_type,
                "factors": {
                    "eligible": eligible,
                    "days_since_last": days_since_last,
                    "responsiveness": round(responsiveness, 3),
                    "distance_km": round(distance_km, 2) if distance_km is not None else None,
                    "group_compat": group_compat,
                    "recency_weight": round(recency_weight, 3),
                    "ml_propensity": round(propensity, 3) if propensity is not None else None,
                },
            }
        )

    return sorted(ranked, key=lambda item: item["score"], reverse=True)[:limit]


def rank_bridge_donors(
    patient: Patient,
    bridge_donors: list[Donor],
    anchor_date: date,
) -> list[dict[str, object]]:
    """Order a patient's dedicated bridge by *rotation readiness*.

    The Blood Bridge model rotates a fixed pool of ~15 donors so no single
    donor is over-tapped (90-day eligibility) yet the patient always has
    coverage. The "next up" donor is the one who is eligible AND has gone
    longest since their last bridge donation — that's fair rotation. We expose a
    `rotation_state` so the UI can show who's ready, who's resting, who's the
    next ask.
    """
    rows: list[dict[str, object]] = []

    for donor in bridge_donors:
        eligible = _eligible(donor, anchor_date)
        last_bridge = donor.last_bridge_donation_date or donor.last_donation_date
        days_since_bridge = (anchor_date - last_bridge).days if last_bridge else None
        responsiveness = _responsiveness(donor)

        # Eligibility already encodes the 90-day recovery window (via
        # next_eligible_date), so an eligible donor IS ready. We only sub-label
        # an eligible donor as "recently_donated" if they gave within the last
        # 30 days (a soft signal to prefer someone fresher first).
        if not eligible:
            rotation_state = "resting"
        elif days_since_bridge is not None and days_since_bridge < 30:
            rotation_state = "recently_donated"
        else:
            rotation_state = "ready"

        # Rotation score: eligible donors who waited longest rank first, with
        # responsiveness as a tie-breaker, nudged by learned ML propensity.
        wait_factor = min((days_since_bridge or 0) / 180.0, 1.0)
        base = 0.75 * wait_factor + 0.25 * responsiveness
        propensity = pairing_score(donor, anchor_date)
        if propensity is not None:
            base = 0.7 * base + 0.3 * propensity
        score = (1.0 if eligible else 0.0) * base

        rows.append(
            {
                "donor_id": donor.donor_id,
                "blood_group": donor.blood_group,
                "donor_type": donor.donor_type,
                "rotation_state": rotation_state,
                "eligible": eligible,
                "days_since_last": days_since_bridge,
                "responsiveness": round(responsiveness, 3),
                "ml_propensity": round(propensity, 3) if propensity is not None else None,
                "last_bridge_donation_date": (
                    donor.last_bridge_donation_date.isoformat() if donor.last_bridge_donation_date else None
                ),
                "score": round(score, 3),
            }
        )

    # Ready donors first (by score desc), then recently-donated, then resting.
    order = {"ready": 0, "recently_donated": 1, "resting": 2}
    return sorted(rows, key=lambda r: (order[r["rotation_state"]], -float(r["score"])))


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
