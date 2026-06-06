# Marrow Backend Schema

This schema reflects the actual `Dataset.csv` columns in this repository. The CSV is donor-centric, with `Patient` rows for active patient records and non-patient rows for donors.

## Source Mapping

| CSV field | Backend use |
|---|---|
| `user_id` | `patient_id` for `role == Patient`; `donor_id` otherwise |
| `role` | Splits patients from donors |
| `blood_group` | Patient or donor blood group |
| `latitude`, `longitude` | Distance calculation for patient/donor matching |
| `last_transfusion_date` | Forecast base date |
| `expected_next_transfusion_date` | Preferred next-needed date when present |
| `frequency_in_days` | Forecast fallback interval |
| `last_donation_date`, `next_eligible_date` | Donor eligibility and recency |
| `donations_till_date`, `total_calls`, `calls_to_donations_ratio` | Donor responsiveness score |

## DynamoDB Tables

### `Patients`

| Attribute | Type | Notes |
|---|---|---|
| `patient_id` | string | Partition key, normalized from `user_id` |
| `blood_group` | string | Used for compatibility |
| `latitude`, `longitude` | number | Used for haversine distance |
| `last_transfusion_date` | string | ISO date |
| `next_needed_date` | string | `expected_next_transfusion_date`, else `last_transfusion_date + frequency_in_days` |
| `frequency_in_days` | number | Forecast fallback |
| `quantity_required` | number | Units needed |
| `status` | string | Active/inactive source status |

### `Donors`

| Attribute | Type | Notes |
|---|---|---|
| `donor_id` | string | Partition key, normalized from `user_id` |
| `blood_group` | string | Used for compatibility |
| `latitude`, `longitude` | number | Used for haversine distance |
| `donor_type` | string | Regular, one-time, or other |
| `last_contacted_date` | string | ISO date when present |
| `last_donation_date` | string | ISO date when present |
| `next_eligible_date` | string | ISO date when present |
| `donations_till_date` | number | Used for scoring |
| `eligibility_status` | string | `eligible` or `not eligible` |
| `total_calls` | number | Used for responsiveness fallback |
| `calls_to_donations_ratio` | number | Preferred responsiveness score |
| `active_status` | string | Active/inactive source status |

Recommended GSI: `DonorsByBloodGroup` with partition key `blood_group` and sort key `eligibility_status`.

### `Cycles`

| Attribute | Type | Notes |
|---|---|---|
| `patient_id` | string | Partition key |
| `cycle_id` | string | Sort key, usually next-needed ISO date |
| `next_needed_date` | string | Forecasted date |
| `status` | string | `forecasted`, `contacting`, `confirmed`, `completed` |
| `family_reassured_at` | string | Set by `/family/ack` |
| `donor_id` | string | Assigned donor when confirmed |

Recommended GSI: `CyclesByStatus` with partition key `status` and sort key `next_needed_date`.

### `Conversations`

| Attribute | Type | Notes |
|---|---|---|
| `donor_id` | string | Partition key |
| `ts` | string | Sort key, UTC ISO timestamp |
| `role` | string | `user`, `saathi`, `coordinator`, or `family` |
| `text` | string | Message body |
| `lang` | string | Language code |
| `meta` | map | Refusal bucket, prompt version, token counts |

### `Refusals`

| Attribute | Type | Notes |
|---|---|---|
| `donor_id` | string | Partition key |
| `ts` | string | Sort key, UTC ISO timestamp |
| `reason_bucket` | string | `medical`, `travel`, `work`, `fear`, `tired`, or `trust` |
| `text` | string | Original donor text when available |
| `expires_at` | string | ISO date when the refusal should stop suppressing outreach |

## Local Demo Caveat

The checked-in handlers read directly from `Dataset.csv` so Harsh can test logic before AWS resources exist. The `scripts/load_dataset.py` script writes the same normalized records into DynamoDB for deployment.
