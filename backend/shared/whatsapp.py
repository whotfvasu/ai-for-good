"""Send WhatsApp via Twilio — using only the stdlib so the Lambda zip stays
dependency-free (Twilio's Messages API is a plain form POST + basic auth).

Reads creds from env:
  TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM   (e.g. whatsapp:+14155238886)
  MARROW_DEMO_WHATSAPP_TO                 (presenter's number, whatsapp:+91...)

If creds are absent it logs and returns a 'skipped' result — so the demo never
crashes when Twilio isn't configured. For the live demo we send only to the
presenter's number; everyone else is simulated in the in-app timeline.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger()

TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def _creds() -> tuple[str, str, str] | None:
    sid = os.environ.get("TWILIO_SID")
    token = os.environ.get("TWILIO_TOKEN")
    sender = os.environ.get("TWILIO_FROM")
    if sid and token and sender:
        return sid, token, sender
    return None


def _normalise(to: str) -> str:
    to = to.strip()
    if to.startswith("whatsapp:"):
        return to
    return f"whatsapp:{to}"


def send_whatsapp(to: str | None, body: str) -> dict[str, Any]:
    """Send one WhatsApp message. Returns {sent: bool, ...}. Never raises."""
    creds = _creds()
    if not creds:
        logger.info("whatsapp skipped (no Twilio creds): %s", body[:80])
        return {"sent": False, "reason": "no_credentials"}
    if not to:
        return {"sent": False, "reason": "no_recipient"}

    sid, token, sender = creds
    data = urllib.parse.urlencode({"From": sender, "To": _normalise(to), "Body": body}).encode()
    auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
    req = urllib.request.Request(
        TWILIO_API.format(sid=sid),
        data=data,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    context = None
    if os.environ.get("TWILIO_DISABLE_SSL_VERIFY", "").lower() in {"1", "true", "yes"}:
        context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=10, context=context) as resp:
            payload = json.loads(resp.read().decode())
            return {"sent": True, "sid": payload.get("sid"), "status": payload.get("status")}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:200]
        logger.warning("whatsapp HTTPError %s: %s", e.code, detail)
        return {"sent": False, "reason": f"http_{e.code}", "detail": detail}
    except Exception as e:  # noqa: BLE001 — demo safety, never crash the caller
        logger.warning("whatsapp error: %s", e)
        return {"sent": False, "reason": str(e)}


def demo_recipient() -> str | None:
    """The presenter's number — the one phone that gets real messages on stage."""
    return os.environ.get("MARROW_DEMO_WHATSAPP_TO")
