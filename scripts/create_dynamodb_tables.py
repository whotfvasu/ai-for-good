#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json


def create_table(dynamodb, table_name: str, key_schema: list[dict], attribute_definitions: list[dict]) -> str:
    existing_tables = set(dynamodb.meta.client.list_tables()["TableNames"])
    if table_name in existing_tables:
        return "exists"

    table = dynamodb.create_table(
        TableName=table_name,
        BillingMode="PAY_PER_REQUEST",
        KeySchema=key_schema,
        AttributeDefinitions=attribute_definitions,
    )
    table.wait_until_exists()
    return "created"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Marrow DynamoDB tables for the hackathon demo.")
    parser.add_argument("--patients-table", default="Patients")
    parser.add_argument("--donors-table", default="Donors")
    parser.add_argument("--cycles-table", default="Cycles")
    parser.add_argument("--conversations-table", default="Conversations")
    parser.add_argument("--refusals-table", default="Refusals")
    parser.add_argument("--donor-insights-table", default="DonorInsights")
    args = parser.parse_args()

    import boto3

    dynamodb = boto3.resource("dynamodb")
    results = {
        args.patients_table: create_table(
            dynamodb,
            args.patients_table,
            [{"AttributeName": "patient_id", "KeyType": "HASH"}],
            [{"AttributeName": "patient_id", "AttributeType": "S"}],
        ),
        args.donors_table: create_table(
            dynamodb,
            args.donors_table,
            [{"AttributeName": "donor_id", "KeyType": "HASH"}],
            [{"AttributeName": "donor_id", "AttributeType": "S"}],
        ),
        args.cycles_table: create_table(
            dynamodb,
            args.cycles_table,
            [
                {"AttributeName": "patient_id", "KeyType": "HASH"},
                {"AttributeName": "cycle_id", "KeyType": "RANGE"},
            ],
            [
                {"AttributeName": "patient_id", "AttributeType": "S"},
                {"AttributeName": "cycle_id", "AttributeType": "S"},
            ],
        ),
        args.conversations_table: create_table(
            dynamodb,
            args.conversations_table,
            [
                {"AttributeName": "donor_id", "KeyType": "HASH"},
                {"AttributeName": "ts", "KeyType": "RANGE"},
            ],
            [
                {"AttributeName": "donor_id", "AttributeType": "S"},
                {"AttributeName": "ts", "AttributeType": "S"},
            ],
        ),
        args.refusals_table: create_table(
            dynamodb,
            args.refusals_table,
            [
                {"AttributeName": "donor_id", "KeyType": "HASH"},
                {"AttributeName": "ts", "KeyType": "RANGE"},
            ],
            [
                {"AttributeName": "donor_id", "AttributeType": "S"},
                {"AttributeName": "ts", "AttributeType": "S"},
            ],
        ),
        args.donor_insights_table: create_table(
            dynamodb,
            args.donor_insights_table,
            [{"AttributeName": "donor_id", "KeyType": "HASH"}],
            [{"AttributeName": "donor_id", "AttributeType": "S"}],
        ),
    }
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
