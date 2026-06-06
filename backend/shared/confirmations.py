"""Confirmation ledger — the state store for the Autonomous Confirmation Loop.

Each row is one transfusion cycle the system is shepherding:

    cycle_id           = f"{patient_id}::{next_needed_date}"
    patient_id, bridge_id, assigned_donor_id, next_needed_date
    donor_status       = pending | confirmed | declined
    patient_status     = pending | confirmed
    state              = auto_running | needs_coordinator | resolved
    updated_at, note

`state` is the headline: `auto_running` cycles need no human; `needs_coordinator`
is the exception queue the coordinator actually works; `resolved` is done.

Two backends, selected by MARROW_REPOSITORY (same switch as repository.py):
- Dynamo (deployed)
- in-memory dict (local dev / tests) — survives within a warm process only.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from .constants import REPOSITORY_MODE_ENV

CONFIRMATIONS_TABLE_ENV = "MARROW_CONFIRMATIONS_TABLE"
DEFAULT_CONFIRMATIONS_TABLE = "Confirmations"


def cycle_id_for(patient_id: str, next_needed_date: str) -> str:
    return f"{patient_id}::{next_needed_date}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryConfirmationStore:
    _rows: dict[str, dict[str, Any]] = {}

    def get(self, cycle_id: str) -> dict[str, Any] | None:
        return self._rows.get(cycle_id)

    def put(self, row: dict[str, Any]) -> dict[str, Any]:
        row["updated_at"] = _now()
        self._rows[row["cycle_id"]] = row
        return row

    def all(self) -> list[dict[str, Any]]:
        return list(self._rows.values())


class DynamoConfirmationStore:
    def __init__(self, table_name: str | None = None) -> None:
        import boto3

        self.table = boto3.resource("dynamodb").Table(
            table_name or os.environ.get(CONFIRMATIONS_TABLE_ENV, DEFAULT_CONFIRMATIONS_TABLE)
        )

    def get(self, cycle_id: str) -> dict[str, Any] | None:
        return self.table.get_item(Key={"cycle_id": cycle_id}).get("Item")

    def put(self, row: dict[str, Any]) -> dict[str, Any]:
        row["updated_at"] = _now()
        self.table.put_item(Item=row)
        return row

    def all(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {}
        while True:
            resp = self.table.scan(**kwargs)
            items.extend(resp.get("Items", []))
            key = resp.get("LastEvaluatedKey")
            if not key:
                return items
            kwargs["ExclusiveStartKey"] = key


def get_store():
    if os.environ.get(REPOSITORY_MODE_ENV, "csv").lower() == "dynamodb":
        return DynamoConfirmationStore()
    return MemoryConfirmationStore()
