"""Network-level analytics for the coordinator — real numbers from the dataset.

This replaces the old per-donor "ml_importance" card (which was model-debug
noise) with operational intelligence a coordinator can act on: where demand is,
where supply is short, which bridges are fragile, who to re-engage.

All O(n) over patients + donors, computed on demand. No ML, no Bedrock.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from .constants import BLOOD_COMPATIBILITY
from .forecasting import next_needed_date

LAPSED_DAYS = 180
AT_RISK_READY = 2  # a bridge with fewer than this many ready donors is fragile


def _eligible(donor, anchor: date) -> bool:
    if donor.eligibility_status == "eligible":
        return True
    if donor.next_eligible_date:
        return donor.next_eligible_date <= anchor
    return False


def compute_insights(repository, anchor_date: date) -> dict:
    patients = repository.patients()
    donors = repository.donors()

    # ── Donor pool ────────────────────────────────────────────────────────
    eligible = [d for d in donors if _eligible(d, anchor_date)]
    resting = len(donors) - len(eligible)
    lapsed = sum(
        1
        for d in donors
        if d.last_donation_date and (anchor_date - d.last_donation_date).days > LAPSED_DAYS
    )
    active = sum(1 for d in donors if (d.active_status or "").lower() == "active")

    responsiveness_vals = [
        1.0 / (1.0 + max(0.0, d.calls_to_donations_ratio))
        for d in donors
        if d.calls_to_donations_ratio is not None
    ]
    avg_responsiveness = (
        round(sum(responsiveness_vals) / len(responsiveness_vals), 2) if responsiveness_vals else 0.0
    )

    # ── Demand windows ────────────────────────────────────────────────────
    def due_within(days: int) -> list:
        end = anchor_date + timedelta(days=days)
        out = []
        for p in patients:
            nd = next_needed_date(p)
            if nd and anchor_date <= nd <= end:
                out.append(p)
        return out

    due_7 = due_within(7)
    due_14 = due_within(14)
    due_30 = due_within(30)

    # ── Blood-group supply vs demand (next 30 days) ───────────────────────
    eligible_by_group: dict[str, int] = defaultdict(int)
    for d in eligible:
        eligible_by_group[d.blood_group] += 1

    def compatible_supply(patient_group: str) -> int:
        # donors whose group can donate to this patient group
        return sum(
            count
            for donor_group, count in eligible_by_group.items()
            if patient_group in BLOOD_COMPATIBILITY.get(donor_group, set())
        )

    demand_by_group: dict[str, int] = defaultdict(int)
    for p in due_30:
        demand_by_group[p.blood_group] += 1

    blood_groups = []
    for group in sorted(set(list(demand_by_group) + list(eligible_by_group))):
        demand = demand_by_group.get(group, 0)
        supply = compatible_supply(group) if group else 0
        if demand == 0:
            status = "idle"
        elif supply < demand:
            status = "shortage"
        elif supply < demand * 3:
            status = "tight"
        else:
            status = "ok"
        blood_groups.append(
            {"group": group or "Unknown", "due_30": demand, "eligible_supply": supply, "status": status}
        )
    # Most-pressured first.
    blood_groups.sort(key=lambda g: (g["due_30"] == 0, g["eligible_supply"] - g["due_30"]))

    # ── Bridges at risk (few ready donors) ────────────────────────────────
    donors_by_bridge: dict[str, list] = defaultdict(list)
    for d in donors:
        if d.bridge_id:
            donors_by_bridge[d.bridge_id].append(d)

    bridges = [p for p in patients if p.bridge_id]
    at_risk = 0
    for p in bridges:
        pool = donors_by_bridge.get(p.bridge_id, [])
        ready = sum(1 for d in pool if _eligible(d, anchor_date))
        if ready < AT_RISK_READY:
            at_risk += 1

    return {
        "anchor_date": anchor_date.isoformat(),
        "totals": {
            "patients": len(patients),
            "donors": len(donors),
            "bridges": len(bridges),
        },
        "demand": {"next_7": len(due_7), "next_14": len(due_14), "next_30": len(due_30)},
        "donor_pool": {
            "eligible": len(eligible),
            "resting": resting,
            "lapsed": lapsed,
            "active": active,
            "inactive": len(donors) - active,
        },
        "avg_responsiveness": avg_responsiveness,
        "blood_groups": blood_groups,
        "bridges_at_risk": at_risk,
        "reengagement_opportunity": lapsed,
    }
