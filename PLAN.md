# Marrow — 24 h Hackathon Plan

> **The Living Blood Network** · AI for Good 2.0 · Team Flux (Vasu + Harsh)
>
> One sentence we are demoing: *Marrow turns reactive blood SOS into predictive supply — forecasts who needs blood next, ranks donors by who'll actually show up, and runs a memory-aware AI agent that reaches each donor in their language, then closes the loop with an impact story.*

---

## 1. Hard constraints

| | |
|---|---|
| Time | 24 h hack window (Day 1 11:00 → Day 2 11:00) |
| Team | 2 people |
| Budget | **$40 AWS hard cap** (soft warn at $30) |
| Region | `us-east-1` (Bedrock model coverage) |
| Submission | Day 2, 11:00 |
| Checkpoints | Day 1 16:00, Day 2 09:00 |

## 2. Judging criteria — how we score on each (20 % × 5)

| Criterion | How we earn it |
|---|---|
| Ideation | Reframe from reactive panic → predictive planning. Dataset proves demand *is* forecastable. |
| Innovation | Memory-aware multilingual agent + donor-twin propensity + closed-loop impact story. |
| Prototype | Real CSV → Dynamo → Lambda → React, not mocked. Live forecast on dataset. |
| AI Component | Bedrock Claude used *where templates fail*: personalized outreach, NL query, impact story. Not decoration. |
| End-to-End | Deployed on Amplify + API Gateway, public URL, full loop demonstrable. |

## 3. AWS stack (cost-safe)

| Layer | Service | Why this, not the other | Est. cost |
|---|---|---|---|
| Frontend | **Amplify Hosting** (GitHub auto-deploy) | Auto CI/CD on push; free tier covers demo traffic | ~$0 |
| API | **Lambda + API Gateway (HTTP API)** | Pay-per-request, zero idle billing | ~$0 |
| DB | **DynamoDB on-demand** | Free tier 25 GB; serverless = no idle | ~$0 |
| AI | **Bedrock — Claude 3 Haiku** (default), Sonnet only for impact story | Haiku is ~10× cheaper, fast enough | ~$3–5 |
| Email (opt) | **SES sandbox** (verified addresses) | Free | ~$0 |
| Config | **SSM Parameter Store** | Free for standard params; no Secrets Manager $0.40/mo overhead | ~$0 |
| Ops | CloudWatch Logs + **AWS Budgets ($20/$30/$40 alarms)** | Free; alarms are non-negotiable | ~$0 |

**Banned services** (will burn budget while we sleep):
RDS / Aurora, OpenSearch, EKS, MWAA, Kinesis, Redshift, SageMaker hosting, EC2 left running, NAT Gateway, App Runner.

## 4. Explicitly NOT building (cut from the deck)

These were in our ideation deck — they don't fit 24 h / $40 / 2 people. Mention them as roadmap on the final slide.

- Voice IVR (Bhashini / Exotel) — huge integration cost
- Federated learning — only one dataset, nothing to federate
- GraphSAGE resilience graph — no real graph data, ML theatre
- Differential privacy
- Real WhatsApp Business API — we fake the UI
- Cognito sign-in — hard-code a role switcher for demo
- Real SMS — render the "message" inside the dashboard

## 5. Layered build

### Layer 0 — Foundation (Hour 0–4)
Goal: deployed Hello-World end-to-end *before any feature logic*.

- [ ] AWS sign-in, MFA, region `us-east-1`, **budget alarms first**
- [ ] GitHub repo, `main` protected, Amplify connected
- [ ] React (Vite + Tailwind) skeleton deployed
- [ ] Lambda (Python 3.12) + API Gateway HTTP API `/health` returns 200
- [ ] DynamoDB tables: `Patients`, `Donors`, `Cycles`, `Conversations`
- [ ] `scripts/load_dataset.py` → boto3 batch write of `Dataset.csv` into Dynamo
- [ ] `openapi.yaml` committed; **frozen at end of L0**

### Layer 1 — MVP Predictive Loop (Hour 4–14)
Submission-safe state. Wins on Prototype + AI + End-to-end on its own.

1. **Demand forecast** — deterministic, explainable: `next_needed = last_transfusion_date + frequency_in_days`. Endpoint `/patients/upcoming?window=7`.
2. **Donor ranking** — rule-based score per `(patient, donor)`:
   - eligibility flag (`next_eligible_date <= today`)
   - recency of last donation
   - `calls_to_donations_ratio` (proxy for responsiveness)
   - haversine distance on `latitude / longitude`
   - blood group compatibility
3. **Coordinator dashboard** — upcoming-demand list → click patient → ranked donors with score breakdown ("eligible ✓, 86 % responsive, 4.2 km").
4. **AI #1 — Saathi outreach generator** (Bedrock Haiku). Input: `{patient, donor, language}`. Output: personalized WhatsApp-style message. *The thing generic templates cannot do at scale.*
5. **AI #2 — Coordinator NL query**. "show me O+ donors in Hyderabad who lapsed in the last 60 days" → Bedrock returns a JSON filter → Lambda runs it on Dynamo → table.

**Tag `v1-mvp` at hour 14.** If anything after breaks, we revert here and still submit.

### Layer 2 — Differentiators (Hour 14–22)
Earns the *Innovation* and *AI Component* marks.

1. **Donor-side chat UI** (looks like WhatsApp) with **conversation memory** — `Conversations` table keyed by `donor_id`; last N turns + donor profile injected into every Bedrock call. Directly satisfies the brief's *"systems that remember and respond appropriately over repeated interactions."*
2. **Donor Propensity ML model** — XGBoost classifier, label = donated in last 90 days, features from the dataset. Trained *locally* (`models/train_propensity.py`), exported to JSON, loaded in Lambda. **Zero SageMaker bill.** Replaces the rule-based score with a learned one; show feature importance in UI.
3. **Loop closure** — donor confirms in chat → `Cycles` status flips to `confirmed` → Bedrock generates a short impact story → delivered on donor's next visit.
4. **Hindi / Telugu output** — one extra prompt parameter; demonstrates multilingual reach.

### Layer 3 — Polish (Hour 22–24)
- 90 s demo script
- Architecture diagram in the slide deck
- README with run instructions + Cost Explorer screenshot
- Tear down anything that bills (sanity check)

## 6. Work split

| | Vasu (Frontend + AI prompts) | Harsh (Data + Backend) |
|---|---|---|
| L0 | Amplify + React skeleton, role switcher, Tailwind setup | Lambda + APIGW, Dynamo tables, CSV loader, IAM roles |
| L1 | Coordinator dashboard, donor chat shell, **Bedrock Saathi prompt** | Forecast Lambda, ranking score Lambda, NL→Dynamo query Lambda |
| L2 | Memory wiring (Conversations table) → chat, impact-story UI | XGBoost training script, propensity Lambda, loop-closure state machine |
| L3 | Demo script, polish visuals | README + arch diagram + cost screenshot |

**Contract**: `openapi.yaml` frozen at hour 4. Frontend mocks against it; backend implements it. No verbal contracts.

## 7. Timeline against the official schedule

| Clock | Hour | Milestone |
|---|---|---|
| Day 1 11:00 | 0 | Kick-off, MFA, budgets, repo |
| Day 1 15:00 | 4 | **L0 done — deployed E2E, API contract frozen** |
| Day 1 16:00 | 5 | Checkpoint 1 — show forecast list working |
| Day 1 19:00 | 8 | Donor ranking with scores in dashboard |
| Day 1 21:00 | 10 | Bedrock Saathi messages generating |
| Day 2 01:00 | 14 | **L1 done — tag `v1-mvp`. Submission-safe.** |
| Day 2 05:00 | 18 | Donor chat + memory working |
| Day 2 08:00 | 21 | XGBoost propensity + impact story live |
| Day 2 09:00 | 22 | Checkpoint 2 — full loop demo |
| Day 2 10:30 | 23.5 | Polish, README, teardown |
| Day 2 11:00 | 24 | Submit |

## 8. Repo layout

```
AiForGood/
├── PLAN.md                       ← this file
├── README.md
├── openapi.yaml                  ← frozen at hour 4
├── Dataset.csv
├── Instructions/
├── docs/
│   └── marrow-architecture.excalidraw
├── frontend/                     ← Vite + React + Tailwind, deployed via Amplify
│   └── src/
├── backend/                      ← Python Lambdas, one folder per function
│   ├── shared/                   ← dynamo helpers, bedrock client, models
│   ├── health/
│   ├── forecast/
│   ├── rank_donors/
│   ├── saathi_chat/
│   ├── nl_query/
│   └── impact_story/
├── scripts/
│   └── load_dataset.py           ← CSV → DynamoDB
├── models/
│   └── train_propensity.py       ← local XGBoost training
└── infra/
    └── (later) terraform or sam template
```

## 9. Commit cadence

One commit per vertical slice that *works*. Conventional-commit prefixes:

- `chore:` setup / config / deps
- `feat:` user-visible behaviour
- `fix:` bug fix
- `docs:` docs only

Examples we'll use today:
- `chore: scaffold repo with plan and architecture diagram`
- `chore: load dataset csv into dynamodb`
- `feat: forecast next-needed transfusion per patient`
- `feat: rank donors by eligibility, recency, distance`
- `feat: bedrock saathi message generator (haiku)`
- `feat: coordinator nl query over donor table`
- `feat: donor chat with conversation memory`
- `feat: xgboost donor propensity model`
- `feat: ai-generated impact story on cycle close`

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Bedrock model access not granted in time | Request access **in hour 0**. Fall back to Titan if Anthropic delayed. |
| Lambda cold starts hurt demo | Hit each endpoint once 60 s before demo to warm them. |
| One person blocks the other | `openapi.yaml` frozen at hour 4; mock data on both sides until wired. |
| Budget creeps | Budget alarm at $20 (50 %). Cost Explorer check every 4 h. No always-on resources. |
| Layer 2 breaks Layer 1 | Hard tag `v1-mvp` at hour 14; revert is one command. |
| Demo network fails | Record a 90 s screen capture of the working flow as backup. |
