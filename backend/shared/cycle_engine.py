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
from .memory import (
    append_conversation_turn,
    default_insight,
    get_donor_insight,
    record_refusal,
    utc_now_iso,
)
from .outreach_policy import CONTACT, decide
from .ranking import rank_bridge_donors
from .whatsapp import demo_recipient, send_whatsapp


def _ready_donor_ids(repository, patient, anchor_date: date) -> list[str]:
    # Any eligible bridge donor is assignable, unless their cold-memory refusal
    # state says WAIT/SKIP. This is where the "no" becomes respectful automation.
    _, bridge_donors = repository.bridge_for_patient(patient.patient_id)
    ranked = rank_bridge_donors(patient, bridge_donors, anchor_date)
    donors_by_id = {donor.donor_id: donor for donor in bridge_donors}
    ready: list[str] = []
    for row in ranked:
        donor_id = str(row["donor_id"])
        donor = donors_by_id.get(donor_id)
        if not donor or not row["eligible"]:
            continue
        insight = get_donor_insight(donor_id) or default_insight(donor)
        decision = decide(
            insight,
            eligible=True,
            next_eligible_date=donor.next_eligible_date.isoformat() if donor.next_eligible_date else None,
            anchor_date=anchor_date,
        )
        if decision.action == CONTACT:
            ready.append(donor_id)
    return ready


def _copy_notification_fields(existing: dict[str, Any] | None, row: dict[str, Any]) -> None:
    if not existing:
        return
    for key in ("donor_notified_at", "last_notified_donor_id", "whatsapp_status", "last_message_text"):
        if key in existing:
            row[key] = existing[key]


def _message_for_cycle(patient, row: dict[str, Any]) -> str:
    return (
        f"Blood Bridge update: patient {patient.patient_id[:8]} is tentatively due on "
        f"{row['next_needed_date']}. You are next in the {row['bridge_blood_group']} bridge rotation. "
        "Can you confirm if you can donate? Reply yes/no."
    )


def _apply_notification(repository, row: dict[str, Any], reason: str) -> bool:
    donor_id = row.get("assigned_donor_id")
    if not donor_id:
        return False
    if row.get("last_notified_donor_id") == donor_id and row.get("donor_notified_at"):
        return False

    patient = repository.patient(row["patient_id"])
    if patient is None:
        return False

    message = _message_for_cycle(patient, row)
    ts = utc_now_iso()
    whatsapp_result = send_whatsapp(demo_recipient(), message)
    append_conversation_turn(
        donor_id,
        "saathi",
        message,
        meta={
            "message_type": "cycle_confirmation_request",
            "cycle_id": row["cycle_id"],
            "patient_id": row["patient_id"],
            "reason": reason,
            "whatsapp": whatsapp_result,
        },
        ts=ts,
    )
    row["donor_notified_at"] = ts
    row["last_notified_donor_id"] = donor_id
    row["last_message_text"] = message
    row["whatsapp_status"] = whatsapp_result
    if whatsapp_result.get("sent"):
        row["note"] = "WhatsApp confirmation request sent. Awaiting donor response."
    else:
        row["note"] = "WhatsApp send attempted but failed. Coordinator should retry or contact manually."
    return True


def notify_assigned_donor(store, repository, cycle_id: str, reason: str = "coordinator_send") -> dict[str, Any] | None:
    row = store.get(cycle_id)
    if row is None:
        return None
    _apply_notification(repository, row, reason)
    return store.put(row)


def run_cycles(
    repository,
    store,
    anchor_date: date,
    window_days: int = 14,
    max_cycles: int | None = None,
) -> dict[str, Any]:
    """Sweep upcoming patients, ensure each has an assigned donor + open
    confirmations, and advance states. Idempotent — re-running refreshes
    without clobbering resolved cycles."""
    from datetime import timedelta

    end = anchor_date + timedelta(days=window_days)
    summary = {
        "created": 0,
        "auto_running": 0,
        "needs_coordinator": 0,
        "resolved": 0,
        "skipped": 0,
        "processed": 0,
        "limited": False,
    }

    for patient in repository.patients():
        if max_cycles is not None and summary["processed"] >= max_cycles:
            summary["limited"] = True
            break

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
            note = "Donor assigned from bridge rotation. Ready for coordinator WhatsApp send."
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
        _copy_notification_fields(existing, row)
        store.put(row)

        if not existing:
            summary["created"] += 1
        summary[state] = summary.get(state, 0) + 1
        summary["processed"] += 1

    return summary


def apply_confirmation(
    store,
    repository,
    cycle_id: str,
    party: str,
    decision: str,
    anchor_date: date,
    reason_bucket: str | None = None,
    text: str | None = None,
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
            previous_donor_id = row.get("assigned_donor_id")
            if previous_donor_id:
                donor = repository.donor(previous_donor_id)
                insight = get_donor_insight(previous_donor_id) or (default_insight(donor) if donor else None)
                refusal = record_refusal(
                    previous_donor_id,
                    reason_bucket,
                    text,
                    anchor_date=anchor_date,
                    base_insight=insight,
                )
                append_conversation_turn(
                    previous_donor_id,
                    "user",
                    text or f"I can't this time — {refusal['reason_bucket']}.",
                    meta={
                        "message_type": "cycle_decline",
                        "cycle_id": cycle_id,
                        "reason_bucket": refusal["reason_bucket"],
                    },
                )
            row["donor_status"] = "declined"
            # Rotate to the next ready donor not already assigned.
            patient = repository.patient(row["patient_id"])
            ready = _ready_donor_ids(repository, patient, anchor_date) if patient else []
            nxt = next((d for d in ready if d != row.get("assigned_donor_id")), None)
            if nxt:
                row["assigned_donor_id"] = nxt
                row["donor_status"] = "pending"
                row["state"] = "auto_running"
                row["note"] = "Previous donor declined. Auto-reassigned to the next donor; ready for coordinator WhatsApp send."
                row.pop("donor_notified_at", None)
                row.pop("last_notified_donor_id", None)
                row.pop("last_message_text", None)
                row.pop("whatsapp_status", None)
            else:
                row["assigned_donor_id"] = None
                row["state"] = "needs_coordinator"
                row["note"] = "Donor declined and the bridge is tapped out — needs a human."

    # Both sides confirmed → resolved.
    if row.get("donor_status") == "confirmed" and row.get("patient_status") == "confirmed":
        row["state"] = "resolved"
        row["note"] = "Donor and patient both confirmed. Transfusion locked in."

    return store.put(row)
