# Checkpoint 1 — Marrow Backend + Frontend Integration

## One-Line Status

Frontend is deployed, backend Layer 1 logic works locally, and the API contract is ready for frontend integration against real dataset-backed results.

## What We Have Completed

### Frontend

- Vasu has the frontend up and deployed.
- The frontend has `openapi.yaml` and can wire to backend routes without waiting for verbal API contracts.
- The first integration target is real forecast and donor-ranking data.

### Backend

- Parsed the real `Dataset.csv`.
- Confirmed the dataset contains:
  - `84` patient records.
  - `4,826` usable donor records.
- Implemented Lambda-style handlers:
  - `GET /health`
  - `GET /forecast`
  - `GET /rank-donors`
  - `POST /family/ack`
- Added a local HTTP server:
  - `python3 scripts/local_api.py --port 8000`
- Added DynamoDB preparation:
  - `scripts/create_dynamodb_tables.py`
  - `scripts/load_dataset.py`
  - DynamoDB repository mode via `MARROW_REPOSITORY=dynamodb`
- Added tests for:
  - CSV mapping.
  - Forecast output.
  - Donor ranking output.
  - Blood group compatibility.
  - Distance calculation.

## What The Backend Actually Does

### Forecast

The forecast endpoint answers: “Which patients need blood soon?”

It uses:

- `expected_next_transfusion_date` when present.
- Otherwise `last_transfusion_date + frequency_in_days`.

For demo data, use:

```bash
curl "http://127.0.0.1:8000/forecast?anchor_date=2025-08-17&window=14"
```

### Donor Ranking

The ranking endpoint answers: “Who are the best donors for this patient?”

It scores donors using:

- Blood group compatibility.
- Eligibility.
- Donation recency.
- Responsiveness from `calls_to_donations_ratio`.
- Distance using latitude/longitude.

Example:

```bash
curl "http://127.0.0.1:8000/rank-donors?patient_id=<PATIENT_ID>&anchor_date=2025-08-17&limit=5"
```

## What We Can Show In The Checkpoint

### Demo Flow

1. Open deployed frontend.
2. Show the API contract in `openapi.yaml`.
3. Run backend locally:

   ```bash
   python3 scripts/local_api.py --port 8000
   ```

4. Show `GET /forecast` returning real upcoming patient demand.
5. Pick one returned `patient_id`.
6. Show `GET /rank-donors` returning top donor matches with score explanations.
7. Explain that DynamoDB scripts are ready; once AWS CLI credentials are configured, the same logic can read from DynamoDB instead of CSV.

## Checkpoint Explanation Script

We have moved from just an idea to a working predictive loop. The frontend is deployed, and the backend now reads the real hackathon dataset, identifies patients who need transfusions soon, and ranks donors who are medically compatible and likely to respond. The ranking is explainable: each donor comes with eligibility, distance, responsiveness, recency, and blood compatibility. This means the coordinator is not seeing a black-box recommendation; they can understand why each donor is suggested. The next step is moving the same backend logic from local CSV mode into DynamoDB and API Gateway so the deployed frontend can call live AWS endpoints.

## Next Plan

### Immediate

1. Configure AWS CLI credentials locally.
2. Create DynamoDB tables:

   ```bash
   python3 scripts/create_dynamodb_tables.py
   ```

3. Load dataset into DynamoDB:

   ```bash
   python3 scripts/load_dataset.py
   ```

4. Test local handlers against DynamoDB:

   ```bash
   MARROW_REPOSITORY=dynamodb python3 scripts/local_api.py --port 8000
   ```

5. Point frontend API base URL to the local API or deployed API Gateway URL.

### After DynamoDB Works

1. Deploy `health`, `forecast`, `rank_donors`, and `family_ack` to Lambda.
2. Wire API Gateway routes from `openapi.yaml`.
3. Share the API Gateway URL with Vasu.
4. Implement Bedrock endpoints:
   - `POST /saathi/outreach`
   - `POST /nl-query`
5. Add conversation/refusal memory.

### XGBoost Timing

XGBoost is Layer 2, not the checkpoint priority. We do it after the live L1 flow works end-to-end:

Frontend → API Gateway → Lambda → DynamoDB → forecast/rank response.

Once that works, we train the donor propensity model locally and use it to improve `/rank-donors`. The current rule-based score is good for the first checkpoint because it is explainable, fast, and already connected to real data.
