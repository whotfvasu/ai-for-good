"""The Autonomous Confirmation Loop engine.

Given the forecast and each patient's Blood Bridge, this:
  1. assigns the next ready donor in the bridge rotation,
  2. opens donor + patient confirmation requests,
  3. advances each cycle's state,
  4. flags only the gaps (no ready donor / donor declined) for a human.

The coordinator's job shrinks from "work every cycle" to "work the exceptions"
— which is what makes the model scale to a whole country.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from .confirmations import cycle_id_for
from .forecasting import next_needed_date
from .ranking import rank_bridge_donors


def _ready_donor_ids(repository, patient, anchor_date: date) -> list[str]:
    # Any eligible bridge donor is assignable; rank_bridge_donors already orders
    # them best-first (ready before recently_donated before resting).
    _, bridge_donors = repository.bridge_for_patient(patient.patient_id)
    ranked = rank_bridge_donors(patient, bridge_donors, anchor_date)
    return [d["donor_id"] for d in ranked if d["eligible"]]


def run_cycles(repository, store, anchor_date: date, window_days: int = 14) -> dict[str, Any]:
    """Sweep upcoming patients, ensure each has an assigned donor + open
    confirmations, and advance states. Idempotent — re-running refreshes
    without clobbering resolved cycles."""
    from datetime import timedelta

    end = anchor_date + timedelta(days=window_days)
    summary = {"created": 0, "auto_running": 0, "needs_coordinator": 0, "resolved": 0, "skipped": 0}

    for patient in repository.patients():
        needed = next_needed_date(patient)
        if needed is None or not (anchor_date <= needed <= end):
            continue
        if not patient.bridge_id:
            continue

        needed_iso = needed.isoformat()
        cid = cycle_id_for(patient.patient_id, needed_iso)
        existing = store.get(cid)

        if existing and existing.get("state") == "resolved":
            summary["resolved"] += 1
            continue

        ready = _ready_donor_ids(repository, patient, anchor_date)
        assigned = existing.get("assigned_donor_id") if existing else None

        # Keep an already-assigned donor unless they've declined.
        declined = existing.get("donor_status") == "declined" if existing else False
        if not assigned or declined:
            assigned = next((d for d in ready if d != (existing or {}).get("assigned_donor_id")), None)

        if assigned:
            state = "auto_running"
            note = "Donor assigned from bridge rotation. Awaiting confirmation."
            donor_status = "pending"
        else:
            state = "needs_coordinator"
            note = "No bridge donor is eligible right now — needs a human to widen the search."
            donor_status = existing.get("donor_status", "pending") if existing else "pending"

        row = {
            "cycle_id": cid,
            "patient_id": patient.patient_id,
            "bridge_id": patient.bridge_id,
            "bridge_blood_group": patient.bridge_blood_group or patient.blood_group,
            "assigned_donor_id": assigned,
            "next_needed_date": needed_iso,
            "donor_status": donor_status,
            "patient_status": existing.get("patient_status", "pending") if existing else "pending",
            "state": state,
            "note": note,
        }
        store.put(row)

        if not existing:
            summary["created"] += 1
        summary[state] = summary.get(state, 0) + 1

    return summary


def apply_confirmation(
    store,
    repository,
    cycle_id: str,
    party: str,
    decision: str,
    anchor_date: date,
) -> dict[str, Any] | None:
    """A donor or patient responds. Advance state; on donor decline, rotate to
    the next ready bridge donor; if none, escalate to the coordinator."""
    row = store.get(cycle_id)
    if row is None:
        return None

    yes = decision.lower() in {"yes", "y", "confirm", "confirmed", "true"}

    if party == "patient":
        row["patient_status"] = "confirmed" if yes else "pending"
        row["note"] = "Patient confirmed the date." if yes else "Patient asked to reschedule."
    elif party == "donor":
        if yes:
            row["donor_status"] = "confirmed"
            row["note"] = "Donor confirmed. Cycle is covered."
        else:
            row["donor_status"] = "declined"
            # Rotate to the next ready donor not already assigned.
            patient = repository.patient(row["patient_id"])
            ready = _ready_donor_ids(repository, patient, anchor_date) if patient else []
            nxt = next((d for d in ready if d != row.get("assigned_donor_id")), None)
            if nxt:
                row["assigned_donor_id"] = nxt
                row["donor_status"] = "pending"
                row["state"] = "auto_running"
                row["note"] = "Previous donor declined — auto-reassigned to the next in rotation."
            else:
                row["assigned_donor_id"] = None
                row["state"] = "needs_coordinator"
                row["note"] = "Donor declined and the bridge is tapped out — needs a human."

    # Both sides confirmed → resolved.
    if row.get("donor_status") == "confirmed" and row.get("patient_status") == "confirmed":
        row["state"] = "resolved"
        row["note"] = "Donor and patient both confirmed. Transfusion locked in."

    return store.put(row)
