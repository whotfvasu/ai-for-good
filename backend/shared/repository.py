from __future__ import annotations

import csv
import os
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from .constants import (
    DATASET_PATH_ENV,
    DEFAULT_DONORS_TABLE,
    DEFAULT_PATIENTS_TABLE,
    DONORS_TABLE_ENV,
    PATIENTS_TABLE_ENV,
    REPOSITORY_MODE_ENV,
)
from .dates import parse_date, parse_float, parse_int
from .models import Donor, Patient


def _clean_id(value: str | None) -> str:
    text = (value or "").strip()
    return text[2:] if text.startswith("\\x") else text


def _dataset_path() -> Path:
    configured = os.environ.get(DATASET_PATH_ENV)
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "Dataset.csv"


class CsvRepository:
    def __init__(self, dataset_path: Path | None = None) -> None:
        self.dataset_path = dataset_path or _dataset_path()
        self._rows = self._read_rows()

    def patients(self) -> list[Patient]:
        patients: list[Patient] = []
        seen: set[str] = set()

        for row in self._rows:
            if row.get("role") != "Patient":
                continue

            patient_id = _clean_id(row.get("user_id"))
            if not patient_id or patient_id in seen:
                continue

            seen.add(patient_id)
            patients.append(
                Patient(
                    patient_id=patient_id,
                    blood_group=row.get("blood_group") or row.get("bridge_blood_group") or "",
                    latitude=parse_float(row.get("latitude")),
                    longitude=parse_float(row.get("longitude")),
                    last_transfusion_date=parse_date(row.get("last_transfusion_date")),
                    expected_next_transfusion_date=parse_date(row.get("expected_next_transfusion_date")),
                    frequency_in_days=parse_int(row.get("frequency_in_days")),
                    quantity_required=parse_int(row.get("quantity_required")),
                    gender=row.get("gender") or None,
                    status=row.get("status") or None,
                )
            )

        return patients

    def donors(self) -> list[Donor]:
        donors: list[Donor] = []
        seen: set[str] = set()

        for row in self._rows:
            if row.get("role") == "Patient":
                continue
            if (row.get("blood_group") or "").strip() in {"", "Do not Know"}:
                continue

            donor_id = _clean_id(row.get("user_id"))
            if not donor_id or donor_id in seen:
                continue

            seen.add(donor_id)
            donors.append(
                Donor(
                    donor_id=donor_id,
                    blood_group=row.get("blood_group") or "",
                    latitude=parse_float(row.get("latitude")),
                    longitude=parse_float(row.get("longitude")),
                    donor_type=row.get("donor_type") or None,
                    last_contacted_date=parse_date(row.get("last_contacted_date")),
                    last_donation_date=parse_date(row.get("last_donation_date")),
                    next_eligible_date=parse_date(row.get("next_eligible_date")),
                    donations_till_date=parse_int(row.get("donations_till_date"), 0) or 0,
                    eligibility_status=row.get("eligibility_status") or None,
                    cycle_of_donations=parse_int(row.get("cycle_of_donations")),
                    total_calls=parse_int(row.get("total_calls"), 0) or 0,
                    calls_to_donations_ratio=parse_float(row.get("calls_to_donations_ratio")),
                    active_status=row.get("user_donation_active_status") or None,
                    inactive_trigger_comment=row.get("inactive_trigger_comment") or None,
                )
            )

        return donors

    def patient(self, patient_id: str) -> Patient | None:
        normalized_id = _clean_id(patient_id)
        return next((patient for patient in self.patients() if patient.patient_id == normalized_id), None)

    def _read_rows(self) -> list[dict[str, str]]:
        with self.dataset_path.open(newline="", encoding="utf-8-sig") as dataset:
            return list(csv.DictReader(dataset))


class Repository(Protocol):
    def patients(self) -> list[Patient]:
        ...

    def donors(self) -> list[Donor]:
        ...

    def patient(self, patient_id: str) -> Patient | None:
        ...


class DynamoRepository:
    def __init__(
        self,
        patients_table_name: str | None = None,
        donors_table_name: str | None = None,
    ) -> None:
        import boto3

        dynamodb = boto3.resource("dynamodb")
        self.patients_table = dynamodb.Table(
            patients_table_name or os.environ.get(PATIENTS_TABLE_ENV, DEFAULT_PATIENTS_TABLE)
        )
        self.donors_table = dynamodb.Table(
            donors_table_name or os.environ.get(DONORS_TABLE_ENV, DEFAULT_DONORS_TABLE)
        )

    def patients(self) -> list[Patient]:
        return [_patient_from_item(item) for item in _scan_all(self.patients_table)]

    def donors(self) -> list[Donor]:
        return [_donor_from_item(item) for item in _scan_all(self.donors_table)]

    def patient(self, patient_id: str) -> Patient | None:
        response = self.patients_table.get_item(Key={"patient_id": _clean_id(patient_id)})
        item = response.get("Item")
        return _patient_from_item(item) if item else None


def _scan_all(table) -> list[dict]:
    items: list[dict] = []
    scan_kwargs = {}

    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return items
        scan_kwargs["ExclusiveStartKey"] = last_key


def _patient_from_item(item: dict) -> Patient:
    return Patient(
        patient_id=str(item.get("patient_id", "")),
        blood_group=str(item.get("blood_group", "")),
        latitude=parse_float(item.get("latitude")),
        longitude=parse_float(item.get("longitude")),
        last_transfusion_date=parse_date(item.get("last_transfusion_date")),
        expected_next_transfusion_date=parse_date(item.get("next_needed_date")),
        frequency_in_days=parse_int(item.get("frequency_in_days")),
        quantity_required=parse_int(item.get("quantity_required")),
        gender=item.get("gender"),
        status=item.get("status"),
    )


def _donor_from_item(item: dict) -> Donor:
    return Donor(
        donor_id=str(item.get("donor_id", "")),
        blood_group=str(item.get("blood_group", "")),
        latitude=parse_float(item.get("latitude")),
        longitude=parse_float(item.get("longitude")),
        donor_type=item.get("donor_type"),
        last_contacted_date=parse_date(item.get("last_contacted_date")),
        last_donation_date=parse_date(item.get("last_donation_date")),
        next_eligible_date=parse_date(item.get("next_eligible_date")),
        donations_till_date=parse_int(item.get("donations_till_date"), 0) or 0,
        eligibility_status=item.get("eligibility_status"),
        cycle_of_donations=parse_int(item.get("cycle_of_donations")),
        total_calls=parse_int(item.get("total_calls"), 0) or 0,
        calls_to_donations_ratio=parse_float(item.get("calls_to_donations_ratio")),
        active_status=item.get("active_status"),
        inactive_trigger_comment=item.get("inactive_trigger_comment"),
    )


@lru_cache(maxsize=1)
def get_repository() -> Repository:
    if os.environ.get(REPOSITORY_MODE_ENV, "csv").lower() == "dynamodb":
        return DynamoRepository()
    return CsvRepository()
