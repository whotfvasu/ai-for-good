# Marrow — Harsh's Plan

> **Branch:** `harsh` · off `main`
> **Role:** AWS infra + Lambdas + data pipeline + ML
> **Partner:** Vasu — on branch `vasu`, owning React frontend, AI prompt design, UX
> See [PLAN.md](PLAN.md) for shared context, [PLAN-VASU.md](PLAN-VASU.md) for what Vasu is doing, [docs/marrow-architecture.excalidraw.md](docs/marrow-architecture.excalidraw.md) for the diagram.

---

## 0. The thesis I am building toward

*Marrow notices three invisible humans every other team's tech leaves out: the **parent counting days**, the **coordinator carrying institutional memory in her phone**, and the **donor who said "no" for a recoverable reason**. The AI doesn't just rank — it **remembers refusals, reassures families before they ask, and turns the 90 silent days after a donation into a relationship.***

My job is to make every claim above *true in the data*. Forecasts grounded in real columns of `Dataset.csv`. Refusals stored and aged. Curriculum messages scheduled. Worry index calculated. The story Vasu tells on screen must trace back to a row in DynamoDB.

---

## 1. How Vasu and I work together

### Branching
- `main` is clean. Both plan files live there so each can see the other.
- I work on `harsh`, Vasu on `vasu`. Small commits, frequent push.
- **Sync points = end of each Layer.** L0, L1, L2, L3 done → merge to `main`, pull each other's work.
- Any change to `openapi.yaml`, `backend/shared/prompts/`, or `docs/SCHEMA.md` → ping Vasu first.

### Shared contracts I own (or co-own)
| File | Owner | Notes |
|---|---|---|
| `openapi.yaml` | **Me** (drafts) | Vasu signs off. Locked at end of L0. |
| `docs/SCHEMA.md` | **Me** | DynamoDB tables, partition/sort keys, indexes. Vasu reads only. |
| `backend/shared/prompts/*.txt` | Vasu | I load them via `load_prompt(name, **kwargs)`. I do **not** edit them. |
| `backend/shared/constants.py` | **Me** | Conversation window size, eligibility days, timezone — must match Vasu's `frontend/src/constants.ts`. |

### Branching ritual
```bash
git checkout main && git pull
git checkout -b harsh         # first time only
git push -u origin harsh       # first time only
# work, commit small slices
git push
# at end of a Layer:
git checkout main && git pull
git merge harsh --no-ff -m "merge: harsh L1 forecast + ranking + bedrock wiring"
git push
git checkout harsh && git merge main  # pull Vasu's L1 in
```

---

## 2. What Vasu is building (so I don't duplicate)

| Layer | Vasu ships | I must give him |
|---|---|---|
| L0 | React + Tailwind shell on Amplify, role switcher | API base URL, `/health` endpoint |
| L1 | Dashboard, donor side panel, NL bar, family ack view | `/forecast`, `/rank-donors`, `/nl-query`, `/saathi/outreach`, `/family/ack` |
| L2 | WhatsApp-style donor chat with memory + refusal chips + diary + constellation | `/saathi/chat/*`, `/conversations`, `/refusals`, `/donor/{id}/diary`, eligibility cron firing into `Conversations` |
| L3 | Pulse modal, demo polish, register toggle | `/coordinator/{id}/pulse` aggregation |

Vasu mocks against `openapi.yaml` if my endpoints lag, so **I never block him by being late — only by being wrong about the contract.** That means the spec must be honest.

---

## 3. My layered build

### Layer 0 — Foundation (Hour 0–4)

| # | Task | Done when |
|---|---|---|
| H0.1 | Sign in, MFA, switch region to `us-east-1` | Console says `N. Virginia` top-right |
| H0.2 | **Budget alarms at $20 / $30 / $40** → both emails | Confirmation emails received |
| H0.3 | Request Bedrock model access: Claude 3 Haiku + Sonnet | Both show "Access granted" |
| H0.4 | Create GitHub repo, push `main` scaffold, add Vasu as collaborator | Both can push |
| H0.5 | DynamoDB tables (on-demand): `Patients`, `Donors`, `Cycles`, `Conversations`, `Refusals` | Tables visible in console |
| H0.6 | Lambda function `health` (Python 3.12, arm64) returning `{"ok": true}` | `aws lambda invoke` returns 200 |
| H0.7 | API Gateway HTTP API → `GET /health` → `health` Lambda, CORS open to Amplify URL | `curl <url>/health` returns 200 |
| H0.8 | `scripts/load_dataset.py` — read `Dataset.csv`, batch write to `Patients` and `Donors` (split by `role` column) | 7,034 rows visible in DynamoDB |
| H0.9 | `openapi.yaml` v1 — all L1 endpoints stubbed with request/response schemas | Vasu signs off in PR |
| H0.10 | `docs/SCHEMA.md` — table definitions, PK/SK, GSIs | Committed, Vasu can read |

> **After L0, ask: "Explain IAM execution roles, why Lambda needs one, what `arm64` vs `x86_64` means for cost, and how API Gateway routes to a Lambda."**

---

### Layer 1 — MVP Predictive Loop (Hour 4–14)

#### H1.1 — `GET /forecast` *(hour 4–6)*
- Deterministic: for each patient row, compute `next_needed = last_transfusion_date + frequency_in_days`.
- Query param `?window=7` returns patients whose `next_needed` falls in the next N days.
- Response includes `confidence` ("high" if dataset has ≥3 prior transfusions logged, else "medium").
- Cache in Lambda module scope (cold-start friendly).

> **After H1.1, ask: "Explain Lambda cold starts, module-scope caching, and why we're not using DynamoDB TTL here."**

#### H1.2 — `GET /rank-donors?patient_id=…` *(hour 6–9)*
- Rule-based score (replaced by XGBoost in L2):
  ```
  score = eligible × (recency_weight + responsiveness × 0.4 + (1 - normalized_distance) × 0.3 + group_compat × 1.0)
  ```
- Returns top 10 with **breakdown JSON** so Vasu can render it as plain English:
  ```json
  {"donor_id":"...","score":0.86,"factors":{"eligible":true,"days_since_last":84,"responsiveness":0.91,"distance_km":4.2,"group_compat":1.0}}
  ```
- Distance via haversine on `(latitude, longitude)` from both patient and donor rows.

> **After H1.2, ask: "Explain the haversine formula, why we normalize each factor before combining, and the bias risks of a rule-based score."**

#### H1.3 — `POST /saathi/outreach` *(hour 9–11)*
- Loads `backend/shared/prompts/saathi_outreach.txt` (Vasu's prompt).
- Substitutes variables: donor profile, patient profile, language, register, last interaction snippet (pulled from `Conversations` table — empty for first contact).
- Calls Bedrock `InvokeModel` with Claude 3 Haiku. Returns generated message + token counts.
- **Token guardrail**: hard-cap `max_tokens=400`. Log usage to CloudWatch with cost estimate.

> **After H1.3, ask: "Explain Bedrock InvokeModel request shape, why we cap max_tokens, and how to read token cost from the response."**

#### H1.4 — `POST /nl-query` *(hour 11–13)*
- Loads `nl_query.txt` prompt. System prompt includes the table schema.
- Bedrock returns a **constrained JSON** with `{"table": "...", "filter_expression": "...", "values": {...}}`.
- I validate the JSON, refuse anything outside an allow-list of attributes, then run a DynamoDB Scan with FilterExpression.
- Refuse silently and return empty if the model output doesn't parse — never run raw model text against the DB.

> **After H1.4, ask: "Explain DynamoDB FilterExpression vs KeyCondition, why Scan is fine at our size but dangerous at scale, and how we prevent prompt injection from becoming a query injection."**

#### H1.5 — `POST /family/ack` *(hour 13–14)*
- One-line endpoint: update `Cycles.family_reassured_at = now()` for `(patient_id, cycle_id)`.
- This flips Vasu's hero metric ("families reassured this week"). Tiny code, big demo payoff.

**End of L1 → merge `harsh` to `main`, pull Vasu's, both tag `v1-mvp`. Submission-safe.**

---

### Layer 2 — Differentiators (Hour 14–22)

#### H2.1 — Conversation memory + chat endpoints *(hour 14–17)*
- `GET /saathi/chat/open?donor_id=…` → loads donor profile + last cycle + eligibility countdown, calls `saathi_chat_open.txt`, **returns the unprompted continuity opener as the first message**, persists it to `Conversations`.
- `POST /saathi/chat/turn` → appends user message, loads last 6 turns + donor profile, calls `saathi_chat_turn.txt`, persists Saathi's reply.
- `GET /conversations?donor_id=…` → paginated history for Vasu's UI.
- DynamoDB `Conversations` schema: PK `donor_id`, SK `ISO timestamp`, attrs `role` (user/saathi), `text`, `lang`, `meta` (e.g. `{"refusal_reason":"travel"}`).

> **After H2.1, ask: "Explain DynamoDB PK+SK design for time-ordered data, how Query differs from Scan, and why we keep the memory window at exactly 6 turns."**

#### H2.2 — `POST /refusals` + reason classifier *(hour 17–18)*
- Two paths: structured (chip tap) → write directly. Free-text → call `refusal_classifier.txt` (Haiku) → returns one of 6 buckets → write.
- Schema: `donor_id`, `reason_bucket`, `text`, `created_at`, `expires_at`. `expires_at` depends on bucket (fever 14d, travel 30d, work 60d, fear human-only, tired 21d, trust manual).
- Ranking logic in `/rank-donors` now checks for active refusals and either down-weights or **excludes** based on bucket.
- **Trust-broken** bucket → flag a coordinator action card, **never** auto-message.

> **After H2.2, ask: "Explain the difference between using an LLM as a classifier vs as a generator, why we use buckets not free-text downstream, and how `expires_at` becomes a renewable resource."**

#### H2.3 — Eligibility Curriculum (EventBridge + Lambda) *(hour 18–20)*
- Cron Lambda runs once daily: for each donor, compute days since last donation, send curriculum message based on milestone (day 7, 30, 60, 85).
- Each curriculum message is a Bedrock call to Haiku using a per-stage prompt (you'll add 4 prompt files, Vasu will help with copy).
- Writes into `Conversations` so the chat shows it next time donor opens.
- **EventBridge Scheduler** for the cron (1 invocation/day, ~free).

> **After H2.3, ask: "Explain EventBridge Scheduler vs CloudWatch Events, why we send curriculum to Conversations instead of email, and how the state machine handles a donor who donates mid-cycle."**

#### H2.4 — XGBoost Donor Propensity *(hour 20–21)*
- `models/train_propensity.py` runs **locally on my laptop** — no SageMaker.
- Label: `donated_in_last_90_days` (derived from `last_donation_date`).
- Features: `donations_till_date`, `calls_to_donations_ratio`, `frequency_in_days`, `total_calls`, `cycle_of_donations`, `donor_type` (one-hot), `days_since_registration`, distance-to-nearest-active-patient.
- Export to `models/propensity.json` (XGBoost JSON format).
- Lambda layer loads it on cold start, exposes `predict(donor_features) -> score`.
- `/rank-donors` swaps the rule score for `propensity × eligibility × distance_decay × refusal_modifier`.
- Return **top features** in the response so Vasu can show "Priya scores high because…"

> **After H2.4, ask: "Explain why we train locally and serve in Lambda, how XGBoost JSON loads in < 100ms, and how we explain a tree-based model in plain English."**

#### H2.5 — Worry Index *(hour 21–22, if time)*
- Per cycle: `worry = days_since_last_family_contact × max(0, 1 − days_to_needed/14) × historical_anxiety_signal`.
- Historical anxiety = parent's past message frequency before transfusions (proxy from `Conversations` for family role).
- Endpoint `GET /forecast?sort=worry` returns the upcoming-demand list sorted by worry score.

---

### Layer 3 — Polish (Hour 22–24)

| # | Task |
|---|---|
| H3.1 | `GET /coordinator/{id}/pulse` — aggregate weekly stats: patients touched, reassurances sent, refusals handled, top thank-yous. Bedrock generates the warm summary text. |
| H3.2 | `README.md` — how to run, AWS resources used, cost ledger screenshot from Cost Explorer |
| H3.3 | Architecture diagram refined (open the `.excalidraw.md`, polish, export PNG) |
| H3.4 | **Teardown checklist** run + verified: no idle EC2/RDS/OpenSearch, budget under $15 ideally |
| H3.5 | Final merge to `main`, tag `v2-final` |

---

## 4. Endpoint contract I will draft in L0

`openapi.yaml` will have these paths frozen at hour 4:

```
GET    /health
GET    /forecast?window=7&sort=date|worry
GET    /rank-donors?patient_id=...&limit=10
POST   /saathi/outreach          body: {donor_id, patient_id, language, register}
POST   /nl-query                 body: {query}
POST   /family/ack               body: {cycle_id}
GET    /saathi/chat/open?donor_id=...
POST   /saathi/chat/turn         body: {donor_id, text}
GET    /conversations?donor_id=...&limit=20
POST   /refusals                 body: {donor_id, reason_bucket?, text?}
GET    /donor/{id}/diary
GET    /coordinator/{id}/pulse
```

Vasu mocks against these. I implement them. If a request/response shape needs to change, **I PR the spec change and ping Vasu before merging.**

---

## 5. DynamoDB schema (will live in `docs/SCHEMA.md`)

| Table | PK | SK | Notable attrs |
|---|---|---|---|
| `Patients` | `patient_id` | — | blood_group, lat, lng, frequency_in_days, last_transfusion_date, parent_contact, locality |
| `Donors` | `donor_id` | — | blood_group, lat, lng, last_donation_date, eligibility_status, donations_till_date, calls_to_donations_ratio, language, register_pref, age_bucket |
| `Cycles` | `patient_id` | `cycle_id` (ISO) | next_needed_date, status, family_reassured_at, donor_id (assigned), confirmed_at, completed_at |
| `Conversations` | `donor_id` (or `family_id`) | `ts` (ISO) | role, text, lang, meta |
| `Refusals` | `donor_id` | `ts` (ISO) | reason_bucket, text, expires_at |

GSIs: `Donors-by-blood-group` (PK `blood_group`, SK `eligibility_status`), `Cycles-by-status` (PK `status`, SK `next_needed_date`).

---

## 6. Conflict zones with Vasu — how we resolve

| Zone | Rule |
|---|---|
| API spec | I draft, Vasu signs off within 30 min at end of L0. Locked. Any change = PR + his review. |
| Prompts (`backend/shared/prompts/`) | His territory. I just load them. If I think a prompt is buggy, I open an issue, don't edit. |
| Constants (window size, eligibility days, IST) | `shared/constants.py` (mine) and `frontend/src/constants.ts` (his) must match. I send him the values, he mirrors. |
| Seed data | I write the script, he tells me which 3 patients × 5 donors will demo best (which dataset rows). |
| Time zone | Store UTC, render IST. I never render; he never stores. |
| CORS | I open APIGW CORS to the Amplify URL + `localhost:5173`. If he sees a CORS error, ping me — never edit my Lambda. |

---

## 7. After every feature — I learn the stack

- After L0: **IAM roles, Lambda arm64, API Gateway HTTP API vs REST, DynamoDB on-demand vs provisioned**
- After H1.1: **Lambda cold start, module-scope cache, when to use DynamoDB TTL**
- After H1.2: **haversine, score normalization, rule-based fairness**
- After H1.3: **Bedrock InvokeModel, Haiku vs Sonnet, max_tokens, cost math**
- After H1.4: **safe LLM → query translation, prompt injection prevention**
- After H2.1: **PK+SK time-series modeling, Query vs Scan**
- After H2.2: **LLM as classifier vs generator, structured downstream wins**
- After H2.3: **EventBridge Scheduler, daily cron at $0**
- After H2.4: **XGBoost JSON portability, why no SageMaker for our scale**

I'll keep notes in `docs/LEARNINGS-HARSH.md`.

---

## 8. Cost discipline (this is on me)

- **AWS Budgets alerts** wired in H0.2 — non-negotiable.
- Daily Cost Explorer check at 11 AM and 11 PM. Anomalies investigated within 1 hour.
- Never leave any of these running overnight: SageMaker notebook, RDS, OpenSearch, App Runner, EKS, NAT Gateway. (We don't use any — but the checklist runs anyway.)
- Pre-demo: warm Lambdas with one ping per endpoint 60s before showtime.
- End-of-hackathon teardown: delete API Gateway → Lambdas → DynamoDB tables → S3 buckets (in that order). Confirm $0 the next morning.

---

## 9. Personal kill list

- SageMaker (we train locally and serve from Lambda)
- RDS / Aurora (DynamoDB only)
- App Runner / ECS / EKS (Lambda only)
- OpenSearch (no vector search needed at our size — last 6 turns + profile fits the prompt)
- Cognito (Vasu hard-codes role)
- CodePipeline (Amplify auto-deploys frontend; backend deploys via `aws lambda update-function-code` from a shell script)
- WebSockets / API Gateway WebSocket API (REST + polling is enough)
- VPC + NAT Gateway (the $32/month landmine)

If I find myself reaching for any of these, I stop and revert.
