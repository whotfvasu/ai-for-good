from __future__ import annotations

import csv
import os
from functools import lru_cache
from pathlib import Path

from .constants import DATASET_PATH_ENV
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


@lru_cache(maxsize=1)
def get_repository() -> CsvRepository:
    return CsvRepository()
