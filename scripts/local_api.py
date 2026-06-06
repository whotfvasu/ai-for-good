#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.family_ack.handler import lambda_handler as family_ack_handler
from backend.forecast.handler import lambda_handler as forecast_handler
from backend.health.handler import lambda_handler as health_handler
from backend.rank_donors.handler import lambda_handler as rank_donors_handler


def make_event(query: dict[str, list[str]] | None = None, body: str | None = None) -> dict:
    return {
        "queryStringParameters": {
            key: values[-1]
            for key, values in (query or {}).items()
            if values
        },
        "body": body,
    }


class LocalApiHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.write_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/health":
            self.write_lambda_response(health_handler(make_event(query), None))
            return

        if parsed.path == "/forecast":
            self.write_lambda_response(forecast_handler(make_event(query), None))
            return

        if parsed.path == "/rank-donors":
            self.write_lambda_response(rank_donors_handler(make_event(query), None))
            return

        self.write_json(404, {"error": "not found", "path": parsed.path})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else ""

        if parsed.path == "/family/ack":
            self.write_lambda_response(family_ack_handler(make_event(body=body), None))
            return

        self.write_json(404, {"error": "not found", "path": parsed.path})

    def write_lambda_response(self, lambda_response: dict) -> None:
        status_code = int(lambda_response.get("statusCode", 200))
        body = lambda_response.get("body", "{}")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"body": body}
        self.write_json(status_code, payload)

    def write_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status_code)
        self.write_headers()
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_headers(self) -> None:
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type,authorization")

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Marrow backend handlers as a local HTTP API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), LocalApiHandler)
    print(f"Marrow local API listening on http://{args.host}:{args.port}")
    print("Available: GET /health, GET /forecast, GET /rank-donors, POST /family/ack")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
