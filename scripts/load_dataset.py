#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.shared.forecasting import next_needed_date
from backend.shared.repository import CsvRepository


def decimalize(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: decimalize(inner_value) for key, inner_value in value.items() if inner_value is not None}
    if isinstance(value, list):
        return [decimalize(item) for item in value]
    return value


def patient_item(patient):
    needed_date = next_needed_date(patient)
    item = {
        "patient_id": patient.patient_id,
        "blood_group": patient.blood_group,
        "latitude": patient.latitude,
        "longitude": patient.longitude,
        "last_transfusion_date": patient.last_transfusion_date.isoformat() if patient.last_transfusion_date else None,
        "next_needed_date": needed_date.isoformat() if needed_date else None,
        "frequency_in_days": patient.frequency_in_days,
        "quantity_required": patient.quantity_required,
        "gender": patient.gender,
        "status": patient.status,
        "bridge_id": patient.bridge_id,
        "bridge_blood_group": patient.bridge_blood_group,
    }
    return decimalize(item)


def donor_item(donor):
    item = {
        "donor_id": donor.donor_id,
        "blood_group": donor.blood_group,
        "latitude": donor.latitude,
        "longitude": donor.longitude,
        "donor_type": donor.donor_type,
        "last_contacted_date": donor.last_contacted_date.isoformat() if donor.last_contacted_date else None,
        "last_donation_date": donor.last_donation_date.isoformat() if donor.last_donation_date else None,
        "next_eligible_date": donor.next_eligible_date.isoformat() if donor.next_eligible_date else None,
        "donations_till_date": donor.donations_till_date,
        "eligibility_status": donor.eligibility_status,
        "cycle_of_donations": donor.cycle_of_donations,
        "total_calls": donor.total_calls,
        "calls_to_donations_ratio": donor.calls_to_donations_ratio,
        "active_status": donor.active_status,
        "inactive_trigger_comment": donor.inactive_trigger_comment,
        "bridge_id": donor.bridge_id,
        "bridge_blood_group": donor.bridge_blood_group,
        "last_bridge_donation_date": donor.last_bridge_donation_date.isoformat() if donor.last_bridge_donation_date else None,
    }
    return decimalize(item)


def write_dynamodb(items, table_name: str) -> None:
    import boto3

    table = boto3.resource("dynamodb").Table(table_name)
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)


def main() -> int:
    parser = argparse.ArgumentParser(description="Load Dataset.csv into Marrow DynamoDB tables.")
    parser.add_argument("--dataset", default=str(ROOT / "Dataset.csv"))
    parser.add_argument("--patients-table", default="Patients")
    parser.add_argument("--donors-table", default="Donors")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repository = CsvRepository(Path(args.dataset))
    patients = [patient_item(patient) for patient in repository.patients()]
    donors = [donor_item(donor) for donor in repository.donors()]

    if args.dry_run:
        print(json.dumps({"patients": len(patients), "donors": len(donors), "sample_patient": patients[:1], "sample_donor": donors[:1]}, default=str, indent=2))
        return 0

    write_dynamodb(patients, args.patients_table)
    write_dynamodb(donors, args.donors_table)
    print(json.dumps({"patients_written": len(patients), "donors_written": len(donors)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
