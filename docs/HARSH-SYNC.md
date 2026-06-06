# Harsh — Sync after the Checkpoint-2 rework

> **Read this before you write any backend code.** Per the team decision, Vasu
> built the entire checkpoint-2 rework full-stack on branch `vasu`. This doc
> tells you exactly what now exists so you don't rebuild or collide. Your older
> backend on `harsh` is superseded by what's described here.

## TL;DR

`vasu` now contains a complete, deployable system: auth, Blood Bridge, an
Autonomous Confirmation Loop, Twilio WhatsApp, a shareable placard, and an
XGBoost pairing model served in pure Python. **Do not re-implement any of the
files listed under "Owned / done" below.** If you want to extend them, pull
`vasu` first and branch from it.

## Merge guidance

```bash
git checkout vasu && git pull
# review, then merge to main when ready:
git checkout main && git merge vasu --no-ff -m "merge: checkpoint-2 rework"
# your branch should then rebase on top:
git checkout harsh && git merge main
```

If you have local work on `harsh` touching `backend/shared/{ranking,repository,models}.py`,
expect conflicts — `vasu`'s versions are newer and should win unless you have a
specific fix to port over.

## What's new — files owned / done (do NOT rebuild)

### New Lambdas (handlers)
| Path | Route | Purpose |
|---|---|---|
| `backend/bridge/handler.py` | `GET /bridge` | A patient's Blood Bridge + rotation states |
| `backend/cycle_runner/handler.py` | `POST /cycle/run` (+ EventBridge) | One pass of the autonomous loop |
| `backend/confirm/handler.py` | `POST /confirm` | Donor/patient confirm; auto-reassign on decline |
| `backend/cycles/handler.py` | `GET /cycles` | Exception queue + counts |
| `backend/cycle_assign/handler.py` | `POST /cycle/assign` | Coordinator manual override |

Existing Lambdas still present: `health, forecast, rank_donors, family_ack,
notify_donor, distill_insight, saathi_chat` (12 total).

### New shared modules
| Path | Purpose |
|---|---|
| `backend/shared/confirmations.py` | Confirmation-ledger store (Dynamo + in-memory) |
| `backend/shared/cycle_engine.py` | The loop logic: assign, advance, reassign, escalate |
| `backend/shared/outreach_policy.py` | Rejection-aware CONTACT / WAIT / SKIP decision |
| `backend/shared/whatsapp.py` | Twilio send via stdlib (no pip dep), no-ops without creds |
| `backend/shared/pairing.py` | Pure-Python XGBoost scorer (no xgboost at runtime) |
| `backend/shared/pairing_features.py` | Feature extractor shared by training + inference |
| `backend/shared/pairing_model.json` | Trained model, ships inside the Lambda zip |

### Modified shared modules (newer than `harsh`)
- `backend/shared/models.py` — `Patient`/`Donor` gained `bridge_id`,
  `bridge_blood_group`, `last_bridge_donation_date` (all with defaults, backward-compatible).
- `backend/shared/repository.py` — added `donors_in_bridge()`,
  `bridge_for_patient()` to both Csv and Dynamo repos; bridge fields populated.
- `backend/shared/ranking.py` — fixed responsiveness (inverted), fixed recency
  (was rewarding stale donors), removed score ceiling, added `rank_bridge_donors()`,
  blended ML propensity into both rankers.

### New DynamoDB table
- `Confirmations` (PK `cycle_id`). Added to `scripts/create_dynamodb_tables.py`.

### Training (local only, not in Lambda)
- `models/train_pairing.py` — needs `pip install xgboost`. Writes the model to
  `backend/shared/pairing_model.json` (in-zip) and `models/pairing_model.json` (repo copy).

## New endpoints (full list, wired in `scripts/deploy_api_gateway.sh`)

```
GET  /health
GET  /forecast?window=&sort=&anchor_date=
GET  /rank-donors?patient_id=&limit=&anchor_date=
GET  /bridge?patient_id=&anchor_date=
POST /family/ack            {cycle_id}
POST /cycle/run             {anchor_date?, window?}
GET  /cycles?state=
POST /confirm               {cycle_id, party: donor|patient, decision: yes|no}
POST /cycle/assign          {cycle_id, donor_id}
POST /notify/donor          {donor_id, patient_id, trigger}
GET  /donor/{id}/insight
GET  /saathi/chat/open?donor_id=
POST /saathi/chat/turn      {donor_id, text, language?}
GET  /conversations?donor_id=&limit=
```

## New Lambda env vars

`deploy_lambdas.sh` now injects (Twilio pulled from your shell at deploy time):
```
MARROW_CONFIRMATIONS_TABLE=Confirmations
TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM            # export before deploy, or leave unset
MARROW_DEMO_WHATSAPP_TO                           # presenter's number for live demo
```
IAM policy in `deploy_lambdas.sh` now also grants DynamoDB on `Confirmations`.

## Where you can still help (not built, or thin)

These are genuinely open if you want to take them:
1. **Bridge GSI** — `donors_in_bridge` currently scan-filters. A `bridge_id`
   GSI on the `Donors` table would make it a Query. Nice-to-have at our scale.
2. **EventBridge schedule** for `marrow-cycle-runner` (daily cron). Right now we
   trigger it via `POST /cycle/run`. The cron is one console step / CLI call.
3. **`/family/ack` persistence** — still response-only; could write the patient
   confirmation into the `Confirmations` ledger to fully close the loop.
4. **Refusals table usage** — refusal state currently lives in the DonorInsight
   cold memory (works, scalable). If you want a dedicated `Refusals` write path
   from the chat, that table already exists and is unused.

If you pick any of these, branch from `vasu` (or post-merge `main`) so you're on
the current code.

## Cut for the hackathon (don't add back)
- Tests (removed per directive — don't spend time here).
- Cognito (lightweight localStorage auth instead).
- xgboost as a Lambda dependency (we serve the model in pure Python).
