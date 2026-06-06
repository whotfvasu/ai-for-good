"""When may we approach a donor? The rejection-aware outreach policy.

A donor's refusal is information, not a dead end. Each "no" carries a reason
and an expiry (see REFUSAL_EXPIRY_DAYS). This module decides, for a given
donor at a given moment, whether to CONTACT, WAIT (until a date), or SKIP
(human-only). The cold-memory DonorInsight is the source of refusal state, so
this scales without scanning a separate table per donor.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .constants import REFUSAL_EXPIRY_DAYS

CONTACT = "CONTACT"
WAIT = "WAIT"
SKIP = "SKIP"


@dataclass(frozen=True)
class Decision:
    action: str  # CONTACT | WAIT | SKIP
    until: str | None  # ISO date to wait until (WAIT only)
    reason: str

    def to_dict(self) -> dict[str, str | None]:
        return {"action": self.action, "until": self.until, "reason": self.reason}


def _parse_iso(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def decide(
    insight: dict | None,
    *,
    eligible: bool,
    next_eligible_date: str | None,
    anchor_date: date,
) -> Decision:
    """Pure decision. `insight` is the donor's cold-memory record (or None)."""
    insight = insight or {}
    reason_bucket = insight.get("last_refusal_reason")
    refusal_expiry = _parse_iso(insight.get("last_refusal_expires_at"))

    # 1. Trust-broken or fear → never auto-contact. A human must reach out.
    if reason_bucket == "trust":
        return Decision(SKIP, None, "Trust was broken — route to a human coordinator, never auto-message.")
    if reason_bucket == "fear":
        return Decision(SKIP, None, "Donor expressed fear — a human should reassure, not an automated nudge.")

    # 2. An active refusal window → wait until it expires.
    if refusal_expiry and refusal_expiry > anchor_date:
        return Decision(WAIT, refusal_expiry.isoformat(), f"Respecting the donor's '{reason_bucket}' window until {refusal_expiry.isoformat()}.")

    # 3. Refusal with a known bucket but no explicit expiry → derive one.
    if reason_bucket and reason_bucket in REFUSAL_EXPIRY_DAYS:
        days = REFUSAL_EXPIRY_DAYS[reason_bucket]
        if days is not None:
            derived = anchor_date + timedelta(days=days)
            # If we don't know when the refusal happened, be conservative once.
            if not refusal_expiry:
                return Decision(WAIT, derived.isoformat(), f"Derived a {days}-day cool-off for a '{reason_bucket}' refusal.")

    # 4. Not eligible to donate yet → wait for the eligibility window.
    if not eligible:
        nxt = _parse_iso(next_eligible_date)
        if nxt and nxt > anchor_date:
            return Decision(WAIT, nxt.isoformat(), f"Donor becomes eligible again on {nxt.isoformat()}.")
        return Decision(WAIT, None, "Donor is not currently eligible.")

    # 5. Clear to reach out.
    return Decision(CONTACT, None, "Eligible, no active refusal — good to contact.")
