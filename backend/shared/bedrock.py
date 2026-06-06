from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


DEFAULT_MODEL = os.environ.get(
    "MARROW_BEDROCK_MODEL",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
)
REGION = os.environ.get("AWS_REGION", "us-east-1")
PROMPTS_DIR = Path(__file__).parent / "prompts"


@lru_cache(maxsize=1)
def _client():
    import boto3

    return boto3.client("bedrock-runtime", region_name=REGION)


def load_prompt(name: str, **kwargs: Any) -> str:
    text = (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8")
    return text.format(**kwargs)


def invoke(
    system: str | None,
    user: str,
    *,
    model_id: str = DEFAULT_MODEL,
    max_tokens: int = 400,
    temperature: float = 0.5,
) -> dict[str, Any]:
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": user}],
    }
    if system:
        body["system"] = system

    response = _client().invoke_model(
        modelId=model_id,
        body=json.dumps(body),
    )
    payload = json.loads(response["body"].read())
    text = "".join(block.get("text", "") for block in payload.get("content", []))
    return {
        "text": text.strip(),
        "usage": payload.get("usage", {}),
        "model_id": model_id,
    }
