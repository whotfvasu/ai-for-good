from __future__ import annotations

from typing import Any

from backend.shared.http import response


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    return response(200, {"ok": True, "service": "marrow-api"})
