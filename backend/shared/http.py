from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs


DEFAULT_HEADERS = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
}


def response(status_code: int, body: Any) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": DEFAULT_HEADERS,
        "body": json.dumps(body, default=str),
    }


def query_params(event: dict[str, Any]) -> dict[str, str]:
    direct = event.get("queryStringParameters") or {}
    if direct:
        return {key: value for key, value in direct.items() if value is not None}

    raw = event.get("rawQueryString") or ""
    parsed = parse_qs(raw)
    return {key: values[-1] for key, values in parsed.items() if values}


def json_body(event: dict[str, Any]) -> dict[str, Any]:
    body = event.get("body")
    if not body:
        return {}
    if isinstance(body, dict):
        return body
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}
