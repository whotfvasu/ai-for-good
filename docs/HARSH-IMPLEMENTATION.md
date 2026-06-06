# Harsh Implementation Preparation

## Current Scope

This repository now has a backend-first implementation scaffold for Harsh's Layer 0 and Layer 1 work:

- API contracts in `openapi.yaml`
- Dataset-to-domain mapping from the real `Dataset.csv`
- Local Lambda-style handlers for `/health`, `/forecast`, `/rank-donors`, and `/family/ack`
- DynamoDB schema notes in `docs/SCHEMA.md`
- DynamoDB loader script in `scripts/load_dataset.py`

## Dataset Reality

The plan assumed a clean patient/donor split by `role`. The CSV is more mixed:

- `role == Patient` rows are the safest source for patient records.
- Non-patient rows with known `blood_group` are treated as donors.
- `expected_next_transfusion_date` exists and is used before recomputing from `last_transfusion_date + frequency_in_days`.
- The dataset dates are mostly in 2025, so local demos should pass `anchor_date=2025-08-17` or another dataset-relevant date.

## Harsh's Execution Order

1. Validate local logic with `PYTHONPATH=. python3 -m unittest discover -s ./tests -t . -p 'test_*.py'`.
2. Dry-run the loader with `python3 scripts/load_dataset.py --dry-run`.
3. Create DynamoDB tables from `docs/SCHEMA.md`.
4. Load data with `python3 scripts/load_dataset.py`.
5. Package handlers into Lambda functions and wire API Gateway routes from `openapi.yaml`.
6. Replace CSV repository reads with DynamoDB queries/scans when AWS tables are live.

## Known Cut

The implementation intentionally does not include Bedrock prompts or chat memory yet. Those are Layer 1 late-stage and Layer 2 work, and Vasu owns the prompt text.
