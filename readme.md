# Marrow — AI for Good 2.0

The Living Blood Network. A predictive, **autonomous**, memory-aware platform for
thalassemia blood coordination, built on the Blood Bridge model.

**Team Flux** · Vasu Parashar · Harsh Ticku
Live: https://vasu.d3c96kkpfabejg.amplifyapp.com · API: https://02ckdjxwyg.execute-api.us-east-1.amazonaws.com

## Current docs (checkpoint 2 — start here)

- 🏛 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the full current system, stack, data model, API, scalability
- 🎬 [docs/DEMO.md](docs/DEMO.md) — the 4-minute jury demo script + Q&A
- 🔁 [docs/HARSH-SYNC.md](docs/HARSH-SYNC.md) — what's built on `vasu`, what NOT to rebuild, merge guidance

### What ships now
Auth (3 roles) · Blood Bridge mapping · Autonomous Confirmation Loop (coordinator
exception queue) · Twilio WhatsApp + rejection-aware outreach · shareable impact
placard · XGBoost donor pairing (served in pure Python).

### Deploy
```bash
python3 scripts/create_dynamodb_tables.py   # +Confirmations table
python3 scripts/load_dataset.py             # +bridge columns
export TWILIO_SID=... TWILIO_TOKEN=... TWILIO_FROM='whatsapp:+14155238886' MARROW_DEMO_WHATSAPP_TO='whatsapp:+91...'
bash scripts/deploy_lambdas.sh
bash scripts/deploy_api_gateway.sh
# Amplify env: NEXT_PUBLIC_USE_L2_MOCKS=false → redeploy
```
Train the ML model (local, needs `pip install xgboost`): `python3 models/train_pairing.py`

## Planning artifacts (historical)

- 📋 [PLAN.md](PLAN.md) — shared plan, hard constraints, AWS stack, kill list, timeline
- 👤 [PLAN-VASU.md](PLAN-VASU.md) — Vasu's plan: frontend + AI prompts + UX (branch `vasu`)
- 👤 [PLAN-HARSH.md](PLAN-HARSH.md) — Harsh's plan: backend + data + ML (branch `harsh`)
- 🗺 [docs/marrow-architecture.excalidraw.md](docs/marrow-architecture.excalidraw.md) — open in Obsidian Excalidraw, or the raw `.excalidraw` at https://excalidraw.com

## Reference (pre-rework — see ARCHITECTURE.md for current)

- 📄 [openapi.yaml](openapi.yaml) — original contract (newer routes listed in ARCHITECTURE.md)
- 🧱 [docs/SCHEMA.md](docs/SCHEMA.md) — base DynamoDB schema (now also has `Confirmations`)
- 🛠 [docs/HARSH-IMPLEMENTATION.md](docs/HARSH-IMPLEMENTATION.md) — original backend caveats

Local dev: `python3 scripts/local_api.py --port 8000` (CSV-backed). Tests were
cut for the hackathon per team direction.

## Branching

```
main
 ├── vasu       (Vasu's working branch)
 └── harsh      (Harsh's working branch)
```

Merge to `main` at the end of every Layer (L0, L1, L2, L3). Pull each other's work right after.

Build status, demo URL, and architecture details will land here as layers ship.
