from __future__ import annotations

import json
from typing import Any

from backend.shared.bedrock import invoke, load_prompt
from backend.shared.constants import CONVERSATION_MEMORY_TURNS
from backend.shared.http import json_body, query_params, response
from backend.shared.memory import (
    append_conversation_turn,
    default_insight,
    get_conversations,
    get_donor_insight,
    maybe_trigger_distill_async,
)
from backend.shared.repository import get_repository


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method")
        or event.get("httpMethod")
        or "GET"
    ).upper()
    path = event.get("rawPath") or event.get("path") or ""

    if method == "GET" and path.endswith("/conversations"):
        return _get_conversations(event)
    if method == "GET" and "/donor/" in path and path.endswith("/insight"):
        return _get_insight(path)
    if method == "GET" and path.endswith("/saathi/chat/open"):
        return _chat_open(event)
    if method == "POST" and path.endswith("/saathi/chat/turn"):
        return _chat_turn(event)
    return response(404, {"error": "route not found", "path": path, "method": method})


def _get_conversations(event: dict[str, Any]) -> dict[str, Any]:
    params = query_params(event)
    donor_id = params.get("donor_id")
    if not donor_id:
        return response(400, {"error": "donor_id is required"})
    limit = int(params.get("limit", "20"))
    items = list(reversed(get_conversations(donor_id, limit=limit, descending=True)))
    return response(200, {"donor_id": donor_id, "items": items})


def _get_insight(path: str) -> dict[str, Any]:
    donor_id = path.strip("/").split("/")[1]
    repository = get_repository()
    donor = repository.donor(donor_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})
    insight = get_donor_insight(donor_id) or default_insight(donor)
    return response(200, insight)


def _chat_open(event: dict[str, Any]) -> dict[str, Any]:
    params = query_params(event)
    donor_id = params.get("donor_id")
    if not donor_id:
        return response(400, {"error": "donor_id is required"})

    repository = get_repository()
    donor = repository.donor(donor_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})

    insight = get_donor_insight(donor_id) or default_insight(donor)
    history = list(reversed(get_conversations(donor_id, limit=CONVERSATION_MEMORY_TURNS, descending=True)))
    donor_profile = {
        "donor_id": donor.donor_id,
        "blood_group": donor.blood_group,
        "donor_type": donor.donor_type,
        "eligibility_status": donor.eligibility_status,
        "next_eligible_date": donor.next_eligible_date.isoformat() if donor.next_eligible_date else None,
        "donations_till_date": donor.donations_till_date,
    }
    prompt = load_prompt(
        "saathi_chat_open",
        insight=json.dumps(insight, default=str),
        donor_profile=json.dumps(donor_profile, default=str),
    )
    model_response = invoke(None, prompt, max_tokens=250)
    append_conversation_turn(
        donor_id,
        "saathi",
        model_response["text"],
        lang=insight.get("preferred_language", "en"),
        meta={
            "prompt_version": "saathi_chat_open.txt",
            "usage": model_response.get("usage", {}),
            "model": model_response.get("model_id"),
            "message_type": "chat_open",
        },
    )
    return response(
        200,
        {
            "donor_id": donor_id,
            "opening_message": model_response["text"],
            "history": history,
        },
    )


def _chat_turn(event: dict[str, Any]) -> dict[str, Any]:
    payload = json_body(event)
    donor_id = payload.get("donor_id")
    text = payload.get("text")
    language = payload.get("language", "en")
    if not donor_id or not text:
        return response(400, {"error": "donor_id and text are required"})

    repository = get_repository()
    donor = repository.donor(donor_id)
    if donor is None:
        return response(404, {"error": "donor not found", "donor_id": donor_id})

    append_conversation_turn(
        donor_id,
        "user",
        text,
        lang=language,
        meta={"message_type": "chat_turn"},
    )
    history = list(reversed(get_conversations(donor_id, limit=CONVERSATION_MEMORY_TURNS, descending=True)))
    insight = get_donor_insight(donor_id) or default_insight(donor)
    prompt = load_prompt(
        "saathi_chat_turn",
        insight=json.dumps(insight, default=str),
        history=json.dumps(history, default=str),
        user_text=text,
    )
    model_response = invoke(None, prompt, max_tokens=300)
    reply = append_conversation_turn(
        donor_id,
        "saathi",
        model_response["text"],
        lang=language,
        meta={
            "prompt_version": "saathi_chat_turn.txt",
            "usage": model_response.get("usage", {}),
            "model": model_response.get("model_id"),
            "message_type": "chat_turn_reply",
        },
    )
    maybe_trigger_distill_async(donor_id)
    return response(200, reply)
