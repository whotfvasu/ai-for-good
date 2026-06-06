from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from .constants import (
    CONVERSATIONS_TABLE_ENV,
    DEFAULT_CONVERSATIONS_TABLE,
    DEFAULT_DISTILL_FUNCTION,
    DEFAULT_INSIGHTS_TABLE,
    DISTILL_FUNCTION_ENV,
    INSIGHT_ALLOWED_CHANNELS,
    INSIGHT_ALLOWED_ENGAGEMENT_STATES,
    INSIGHT_ALLOWED_LANGUAGES,
    INSIGHT_ALLOWED_TIME_WINDOWS,
    INSIGHTS_TABLE_ENV,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def conversation_table():
    import boto3

    return boto3.resource("dynamodb").Table(
        os.environ.get(CONVERSATIONS_TABLE_ENV, DEFAULT_CONVERSATIONS_TABLE)
    )


def insights_table():
    import boto3

    return boto3.resource("dynamodb").Table(
        os.environ.get(INSIGHTS_TABLE_ENV, DEFAULT_INSIGHTS_TABLE)
    )


def get_conversations(donor_id: str, limit: int = 20, descending: bool = False) -> list[dict[str, Any]]:
    from boto3.dynamodb.conditions import Key

    response = conversation_table().query(
        KeyConditionExpression=Key("donor_id").eq(donor_id),
        ScanIndexForward=not descending,
        Limit=limit,
    )
    items = response.get("Items", [])
    return [_normalize_item(item) for item in items]


def append_conversation_turn(
    donor_id: str,
    role: str,
    text: str,
    *,
    lang: str | None = None,
    meta: dict[str, Any] | None = None,
    ts: str | None = None,
) -> dict[str, Any]:
    turn = {
        "donor_id": donor_id,
        "ts": ts or utc_now_iso(),
        "role": role,
        "text": text,
    }
    if lang:
        turn["lang"] = lang
    if meta:
        turn["meta"] = _decimalize(meta)

    conversation_table().put_item(Item=_decimalize(turn))
    return _normalize_item(turn)


def get_donor_insight(donor_id: str) -> dict[str, Any] | None:
    response = insights_table().get_item(Key={"donor_id": donor_id})
    item = response.get("Item")
    return _normalize_item(item) if item else None


def put_donor_insight(insight: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_item(insight)
    insights_table().put_item(Item=_decimalize(normalized))
    return normalized


def default_insight(donor: Any) -> dict[str, Any]:
    name_used = donor.donor_id[:10] if getattr(donor, "donor_id", None) else "donor"
    preferred_language = "en"
    return {
        "donor_id": donor.donor_id,
        "engagement_state": "warm" if donor.donations_till_date > 0 else "drifting",
        "preferred_channel": "whatsapp",
        "preferred_language": preferred_language,
        "preferred_time_window": "evening",
        "name_used": name_used,
        "last_refusal_reason": None,
        "last_refusal_expires_at": None,
        "lifetime_donations": donor.donations_till_date,
        "patient_bond": "",
        "what_motivates": ["making an impact"],
        "what_to_avoid": ["generic language"],
        "summary_120w": f"Donor {name_used} has {donor.donations_till_date} recorded donations.",
        "updated_at": utc_now_iso(),
    }


def validate_insight(insight: dict[str, Any]) -> dict[str, Any]:
    required = {
        "donor_id": str,
        "engagement_state": str,
        "preferred_channel": str,
        "preferred_language": str,
        "preferred_time_window": str,
        "name_used": str,
        "lifetime_donations": int,
        "patient_bond": str,
        "what_motivates": list,
        "what_to_avoid": list,
        "summary_120w": str,
        "updated_at": str,
    }
    for key, expected_type in required.items():
        if key not in insight:
            raise ValueError(f"missing insight field: {key}")
        if not isinstance(insight[key], expected_type):
            raise ValueError(f"invalid type for {key}")

    if insight["engagement_state"] not in INSIGHT_ALLOWED_ENGAGEMENT_STATES:
        raise ValueError("invalid engagement_state")
    if insight["preferred_channel"] not in INSIGHT_ALLOWED_CHANNELS:
        raise ValueError("invalid preferred_channel")
    if insight["preferred_language"] not in INSIGHT_ALLOWED_LANGUAGES:
        raise ValueError("invalid preferred_language")
    if insight["preferred_time_window"] not in INSIGHT_ALLOWED_TIME_WINDOWS:
        raise ValueError("invalid preferred_time_window")

    if "last_refusal_reason" in insight and insight["last_refusal_reason"] is not None and not isinstance(
        insight["last_refusal_reason"], str
    ):
        raise ValueError("invalid last_refusal_reason")
    if "last_refusal_expires_at" in insight and insight["last_refusal_expires_at"] is not None and not isinstance(
        insight["last_refusal_expires_at"], str
    ):
        raise ValueError("invalid last_refusal_expires_at")

    return insight


def parse_json_object(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 2:
            candidate = "\n".join(lines[1:])
        if candidate.endswith("```"):
            candidate = candidate[:-3]
    parsed = json.loads(candidate.strip())
    if not isinstance(parsed, dict):
        raise ValueError("model output is not a JSON object")
    return parsed


def maybe_trigger_distill_async(donor_id: str) -> None:
    function_name = os.environ.get(DISTILL_FUNCTION_ENV, DEFAULT_DISTILL_FUNCTION)
    try:
        import boto3

        boto3.client("lambda").invoke(
            FunctionName=function_name,
            InvocationType="Event",
            Payload=json.dumps({"donor_id": donor_id}).encode("utf-8"),
        )
    except Exception:
        return


def _decimalize(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: _decimalize(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_decimalize(item) for item in value]
    return value


def _normalize_item(item: Any) -> Any:
    if isinstance(item, Decimal):
        return int(item) if item % 1 == 0 else float(item)
    if isinstance(item, dict):
        return {key: _normalize_item(value) for key, value in item.items()}
    if isinstance(item, list):
        return [_normalize_item(value) for value in item]
    return item
