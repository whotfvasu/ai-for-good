# Marrow — AI for Good 2.0

The Living Blood Network. A predictive, memory-aware AI platform for thalassemia care coordination.

**Team Flux** · Vasu Parashar · Harsh Ticku

## Planning artifacts

- 📋 [PLAN.md](PLAN.md) — shared plan, hard constraints, AWS stack, kill list, timeline
- 👤 [PLAN-VASU.md](PLAN-VASU.md) — Vasu's plan: frontend + AI prompts + UX (branch `vasu`)
- 👤 [PLAN-HARSH.md](PLAN-HARSH.md) — Harsh's plan: backend + data + ML (branch `harsh`)
- 🗺 [docs/marrow-architecture.excalidraw.md](docs/marrow-architecture.excalidraw.md) — open in Obsidian Excalidraw, or the raw `.excalidraw` at https://excalidraw.com

## Backend implementation prep

- 📄 [openapi.yaml](openapi.yaml) — API Gateway/Lambda contract for Harsh + Vasu mocks
- 🧱 [docs/SCHEMA.md](docs/SCHEMA.md) — DynamoDB schema mapped to the real CSV fields
- 🛠 [docs/HARSH-IMPLEMENTATION.md](docs/HARSH-IMPLEMENTATION.md) — Harsh execution order and local caveats
- 🧪 Local validation: `PYTHONPATH=. python3 -m unittest discover -s ./tests -t . -p 'test_*.py'`
- 📦 Loader dry-run: `python3 scripts/load_dataset.py --dry-run`
- ☁️ AWS table setup: `python3 scripts/create_dynamodb_tables.py`
- 🚚 DynamoDB load: `python3 scripts/load_dataset.py`

## Branching

```
main
 ├── vasu       (Vasu's working branch)
 └── harsh      (Harsh's working branch)
```

Merge to `main` at the end of every Layer (L0, L1, L2, L3). Pull each other's work right after.

Build status, demo URL, and architecture details will land here as layers ship.
