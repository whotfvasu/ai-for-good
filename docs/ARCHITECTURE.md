# Marrow — Architecture (Checkpoint 2)

> The Living Blood Network. A predictive, autonomous, memory-aware platform for
> thalassemia blood coordination, built on the Blood Bridge model.

## The one idea

**The Autonomous Bridge.** A *Blood Bridge* is one thalassemia patient plus a
dedicated pool of ~15 donors (same blood group) who rotate to sustain them — so
no donor is over-tapped (90-day eligibility) yet the patient always has
coverage. This is real in the dataset: **80 bridges, 786 members.** Marrow runs
each bridge's transfusion cycle end to end:

```
SENSE forecast date  →  PREDICT next donor (bridge rotation + XGBoost)
   →  REACH WhatsApp reminder (Twilio)  →  CONFIRM donor + patient
   →  ESCALATE only the gaps to a human coordinator
   →  CELEBRATE a shareable "I sustained a life" placard
   →  LEARN every outcome feeds the next cycle
```

Three roles each see their slice: **Patient**, **Donor**, **Coordinator**.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Next.js 14 static export + Tailwind, on AWS Amplify/CloudFront | No SSR runtime billed; CDN-fast; scales 1→1M unchanged |
| API | API Gateway HTTP API → Python 3.12 Lambdas (arm64) | Pay-per-request, no idle cost |
| Data | DynamoDB on-demand (7 tables) | Serverless, free-tier, no capacity planning |
| AI (LLM) | Amazon Bedrock — Claude Haiku 4.5 (US cross-region inference profile) | Cheap, fast, auto-failover, IAM auth (no keys) |
| AI (ML) | XGBoost trained locally → walkable JSON → **pure-Python scorer in Lambda** | No SageMaker, no xgboost dependency in the zip |
| Messaging | Twilio WhatsApp via stdlib HTTPS | Real message on stage; no SDK in the zip |
| Auth | Lightweight localStorage session (demo-grade) | Brief says security not needed |

## The three AI surfaces (real use, not decoration)

1. **Conversational (Bedrock).** Saathi opens donor chats with memory-aware
   continuity, replies in the donor's language/register, and writes
   personalised outreach. Cold memory (`DonorInsight`, ~1 KB/donor) keeps every
   prompt ~400 tokens instead of loading months of chat — ~20× cheaper, scalable.
2. **Predictive (deterministic + XGBoost).** Demand forecast from
   `last_transfusion_date + frequency_in_days`; donor pairing propensity from a
   trained gradient-boosted model, blended into ranking with feature importance
   shown to the coordinator.
3. **Autonomous (the loop).** The cycle engine assigns donors, collects
   confirmations, auto-reassigns on decline, and escalates only gaps — turning
   the coordinator from "call everyone" into "handle the exceptions."

## Components

### Frontend (`frontend/`)
- `app/login` — role login, seeded from live data, sets localStorage session.
- `app/patient` — Blood Bridge ring + tentative-date alert + confirm.
- `app/donor` — Saathi chat (live poll), insight pill (cold memory), action
  banner (confirm/decline the open ask), shareable placard.
- `app/coordinator` — **exception queue**: auto-running vs needs-you vs autonomy
  rate; drill-in drawer to assign a donor from the bridge (with ML "% likely").
- `lib/auth.ts`, `lib/useRequireRole.ts` — session + route guards.
- `lib/api.ts` — typed client; `lib/mocks.ts` — shape-accurate fallback;
  `lib/sanitize.ts` — strips any model rationale; `lib/placard.ts` — canvas→PNG.

### Backend (`backend/`)
12 Lambda handlers + `shared/` modules (see `docs/HARSH-SYNC.md` for the file
map). Key shared logic: `cycle_engine.py` (the loop), `outreach_policy.py`
(rejection-aware), `ranking.py` (bridge rotation + ML blend),
`pairing.py` (pure-Python model scoring), `whatsapp.py` (Twilio).

### Data model (DynamoDB)
| Table | Key | Holds |
|---|---|---|
| `Patients` | `patient_id` | demand, bridge_id, bridge_blood_group |
| `Donors` | `donor_id` | eligibility, responsiveness, bridge membership |
| `Cycles` | `patient_id`+`cycle_id` | transfusion events |
| `Conversations` | `donor_id`+`ts` | chat turns (hot memory) |
| `DonorInsights` | `donor_id` | distilled cold memory (~1 KB) |
| `Refusals` | `donor_id`+`ts` | structured "no"s (available) |
| `Confirmations` | `cycle_id` | the autonomous loop's state ledger |

## API (full list)

```
GET  /health
GET  /forecast            ?window=&sort=&anchor_date=
GET  /rank-donors         ?patient_id=&limit=&anchor_date=
GET  /bridge              ?patient_id=&anchor_date=
POST /family/ack          {cycle_id}
POST /cycle/run           {anchor_date?, window?}
GET  /cycles              ?state=
POST /confirm             {cycle_id, party, decision}
POST /cycle/assign        {cycle_id, donor_id}
POST /notify/donor        {donor_id, patient_id, trigger}
GET  /donor/{id}/insight
GET  /saathi/chat/open    ?donor_id=
POST /saathi/chat/turn    {donor_id, text, language?}
GET  /conversations       ?donor_id=&limit=
```

Base URL: `https://02ckdjxwyg.execute-api.us-east-1.amazonaws.com`

## Scalability story (for the panel)

- **Coordinator load is O(exceptions), not O(patients).** The loop self-resolves
  the common case; humans touch only gaps. This is what makes it work nation-wide.
- **Memory is bounded.** Cold-memory insights are ~1 KB/donor regardless of
  history length. 5K donors = 5 MB. Notifications are ~400-token Bedrock calls.
- **No always-on infra.** Lambda + DynamoDB on-demand + EventBridge scale to
  zero and bill per use. Same architecture from 1 to 1M users.
- **Model portability.** XGBoost trained offline, served as JSON walked in pure
  Python — no GPU, no ML runtime, <10 KB, swappable by replacing one file.
- **Bedrock cross-region inference profile** gives automatic failover across
  three AWS regions with zero failover code.

## Cost

Net new hackathon spend ≈ **$0**. DynamoDB/Lambda/EventBridge free tier; placard
is client-side; XGBoost local; Twilio sandbox free; Bedrock ~$1.50/day only at
full network scale. No idle resources.

## Deliberate cuts
Tests, Cognito, real WhatsApp for all donors (only the presenter's number),
input hardening — all out of scope for the prototype per team direction.
