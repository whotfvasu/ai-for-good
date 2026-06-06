# Marrow — Notifications + Insight Memory (Backend Spec for Harsh)

> **Context:** First-checkpoint jury feedback was *"more innovative real AI usage; build a notification system; use chat memory to personalise."* This doc captures the architecture we agreed on, scoped to what Harsh owns. Vasu owns prompts + frontend; see below for the integration boundary.
>
> **Timebox:** ~3–4 hours backend. We share progress every hour.

---

## 1. The architecture in one paragraph

We adopt a **two-tier memory** model so chat history is scalable and notifications are personalised without giant prompts. **Hot memory** = last 6 raw turns per donor in `Conversations` (already created). **Cold memory** = one compressed `DonorInsight` row per donor (~1 KB), updated periodically by a distillation Lambda. Every notification we send loads only the cold insight + minimal trigger context — ~400 tokens per Bedrock call instead of 8K — so we scale to millions of donors at flat cost. Notifications fire on **trigger events** (patient cycle approaching, eligibility crossed, refusal window expired, coordinator manual approval), not on a polling loop. The coordinator-approval trigger is what we use for the **live demo button** in front of the jury.

---

## 2. New DynamoDB table

Add to `scripts/create_dynamodb_tables.py`:

```python
args.donor_insights_table = "DonorInsights"  # new CLI arg with default

# In the results dict:
args.donor_insights_table: create_table(
    dynamodb,
    args.donor_insights_table,
    [{"AttributeName": "donor_id", "KeyType": "HASH"}],
    [{"AttributeName": "donor_id", "AttributeType": "S"}],
),
```

**Item shape** (this is the contract — Vasu's prompts produce JSON matching this exactly):

```python
{
    "donor_id": "ad2e199f...",
    "engagement_state": "warm",            # warm | drifting | dormant | lapsed
    "preferred_channel": "whatsapp",       # whatsapp | sms | voice | email
    "preferred_language": "en",            # en | hi | te
    "preferred_time_window": "evening",    # morning | evening | weekend | any
    "name_used": "Priya",                  # how Saathi addresses them, never the dataset's anonymous id
    "last_refusal_reason": "travel",       # one of the six buckets, or null
    "last_refusal_expires_at": "2025-09-15", # ISO date, or null
    "lifetime_donations": 8,               # int
    "patient_bond": "Has asked twice about Aarav specifically",
    "what_motivates": ["seeing impact updates", "knowing the patient by name"],
    "what_to_avoid": ["formal language", "mentioning fear of needles"],
    "summary_120w": "Three-year regular donor. Last donation 84d ago...",
    "updated_at": "2025-08-17T12:00:00Z"
}
```

---

## 3. New Lambda handlers (3 of them)

All under `backend/`, packaged by the existing `scripts/deploy_lambdas.sh` (you'll add three rows to the `LAMBDAS=()` array and re-run).

### 3.1 `backend/notify_donor/handler.py` — the live-demo workhorse

**Endpoint:** `POST /notify/donor`
**Body:**
```json
{ "donor_id": "abc...", "patient_id": "xyz...", "trigger": "approval" }
```
**Returns:**
```json
{
  "donor_id": "abc...",
  "ts": "2025-08-17T12:00:00Z",
  "message": "Hi Priya — Aarav's transfusion is in 2 days...",
  "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "usage": {"input_tokens": 312, "output_tokens": 58},
  "channel": "whatsapp",
  "language": "en"
}
```

**What it does:**
1. Load donor's `DonorInsight` (fallback to a default insight if missing)
2. Load patient context from `Patients` table
3. Load prompt `backend/shared/prompts/notification_outreach.txt` (Vasu owns the file content)
4. Substitute `{insight}, {patient}, {trigger}` and call Bedrock — model `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `max_tokens=400`
5. Persist the generated message as a Saathi turn in `Conversations` table (donor_id PK, current ts SK, role="saathi", meta={trigger, prompt_version, usage})
6. Return the payload above

**Trigger value space:** `"approval" | "cycle_due" | "eligibility_back" | "refusal_expired" | "curriculum_day_X"`. For the live demo button, `trigger="approval"`.

### 3.2 `backend/distill_insight/handler.py` — background insight builder

**Invocation:** Direct invoke (initially manual via CLI to seed insights; later EventBridge cron). Not exposed via API Gateway.

**Event shape:**
```json
{ "donor_id": "abc..." }
```
**What it does:**
1. Read last 30 turns from `Conversations` for that donor (Query by donor_id, sorted by ts desc, limit 30)
2. Read donor profile from `Donors` table
3. Load prompt `backend/shared/prompts/distill_insight.txt`
4. Send to Bedrock — model `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `max_tokens=600`, instruction to return **strict JSON** matching the DonorInsight schema
5. Parse and validate JSON (reject + fall back to existing insight if shape wrong)
6. Upsert into `DonorInsights` (PutItem with donor_id key)

**Returns:** the new insight JSON. Errors return `{"error": "..."}` with the existing insight unchanged.

**Demo-day note:** we'll manually invoke this for the 8–10 donors that appear in the live demo so they have non-trivial insights. Vasu will seed sample conversations into `Conversations` to feed it.

### 3.3 `backend/saathi_chat/handler.py` — the chat turn handler

**Two endpoints (one Lambda, route by HTTP path):**
- `GET /saathi/chat/open?donor_id=…` → opening message + recent history
- `POST /saathi/chat/turn` body `{donor_id, text, language?}` → appends user turn + generates Saathi reply

**What it does:**
1. Load last 6 turns from `Conversations`
2. Load donor insight (cold memory)
3. Load prompt `backend/shared/prompts/saathi_chat_turn.txt` (for turn) or `saathi_chat_open.txt` (for open)
4. Bedrock call with hot+cold memory injected
5. Persist user turn + Saathi turn
6. Return Saathi's reply in `ConversationTurn` shape (already in `openapi.yaml`)

Polling-friendly: also expose `GET /conversations?donor_id=…&limit=20` for the frontend's live update poll.

---

## 4. Shared Bedrock client

Add `backend/shared/bedrock.py`:

```python
"""Thin Bedrock client. All Lambdas use this — single place to swap models."""
from __future__ import annotations
import json, os
from functools import lru_cache
from pathlib import Path
from typing import Any

import boto3

DEFAULT_MODEL = os.environ.get(
    "MARROW_BEDROCK_MODEL",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
)
REGION = os.environ.get("AWS_REGION", "us-east-1")

PROMPTS_DIR = Path(__file__).parent / "prompts"


@lru_cache(maxsize=1)
def _client():
    # Module-scope cache — cold-start cost amortised across warm invocations.
    return boto3.client("bedrock-runtime", region_name=REGION)


def load_prompt(name: str, **kwargs: Any) -> str:
    """Load a .txt prompt from backend/shared/prompts/ and {var}-substitute."""
    text = (PROMPTS_DIR / f"{name}.txt").read_text()
    return text.format(**kwargs)


def invoke(
    system: str | None,
    user: str,
    *,
    model_id: str = DEFAULT_MODEL,
    max_tokens: int = 400,
    temperature: float = 0.5,
) -> dict[str, Any]:
    """One-shot Bedrock call. Returns dict with `text`, `usage`, `model_id`."""
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": user}],
    }
    if system:
        body["system"] = system

    response = _client().invoke_model(
        modelId=model_id,
        body=json.dumps(body),
    )
    payload = json.loads(response["body"].read())
    text = "".join(block.get("text", "") for block in payload.get("content", []))
    return {
        "text": text.strip(),
        "usage": payload.get("usage", {}),
        "model_id": model_id,
    }
```

This is the single point of integration. Every Lambda imports `from backend.shared.bedrock import invoke, load_prompt`.

---

## 5. IAM policy update

`scripts/deploy_lambdas.sh` already creates `marrow-lambda-role`. Add these statements to its policy document (search for `PERMS=$(mktemp)` block):

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": [
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
    "arn:aws:bedrock:us-east-*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
    "arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0"
  ]
},
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:Scan",
    "dynamodb:Query",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:BatchGetItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:us-east-1:*:table/DonorInsights"
  ]
}
```

Then **delete the existing role inline policy** (`aws iam delete-role-policy --role-name marrow-lambda-role --policy-name MarrowLambdaPolicy`) so the script re-creates it on next run. Or just re-run create-role-policy with the new JSON; the script does this if you bump the policy name.

---

## 6. Deploy script update

In `scripts/deploy_lambdas.sh`, extend the `LAMBDAS=()` array:

```bash
LAMBDAS=(
  "marrow-health|backend.health.handler.lambda_handler"
  "marrow-forecast|backend.forecast.handler.lambda_handler"
  "marrow-rank-donors|backend.rank_donors.handler.lambda_handler"
  "marrow-family-ack|backend.family_ack.handler.lambda_handler"
  "marrow-notify-donor|backend.notify_donor.handler.lambda_handler"
  "marrow-distill-insight|backend.distill_insight.handler.lambda_handler"
  "marrow-saathi-chat|backend.saathi_chat.handler.lambda_handler"
)
```

And bump the env vars JSON to include the insights table:

```bash
ENV_JSON='{"Variables":{"MARROW_REPOSITORY":"dynamodb","MARROW_PATIENTS_TABLE":"Patients","MARROW_DONORS_TABLE":"Donors","MARROW_INSIGHTS_TABLE":"DonorInsights","MARROW_CONVERSATIONS_TABLE":"Conversations"}}'
```

Re-run the script after each Lambda body change — it's idempotent.

---

## 7. New API Gateway routes

After your new Lambdas are deployed, re-run `scripts/deploy_api_gateway.sh` after extending `ROUTES=()`:

```bash
ROUTES=(
  "GET /health marrow-health"
  "GET /forecast marrow-forecast"
  "GET /rank-donors marrow-rank-donors"
  "POST /family/ack marrow-family-ack"
  "POST /notify/donor marrow-notify-donor"
  "GET /donor/{id}/insight marrow-saathi-chat"
  "GET /saathi/chat/open marrow-saathi-chat"
  "POST /saathi/chat/turn marrow-saathi-chat"
  "GET /conversations marrow-saathi-chat"
)
```

*(For `GET /donor/{id}/insight` we route to the saathi_chat Lambda for now since it owns chat-related reads; the handler dispatches by `event.path`. If you'd rather split it out into its own Lambda for cleanliness, that's fine — code's tiny.)*

---

## 8. Prompt files (Vasu writes — your job is just to load them)

Vasu will commit these to `backend/shared/prompts/`:

| File | Loaded by | Variables |
|---|---|---|
| `notification_outreach.txt` | notify_donor | `{insight}, {patient}, {trigger}` |
| `distill_insight.txt` | distill_insight | `{donor_profile}, {turns}` |
| `saathi_chat_open.txt` | saathi_chat (open) | `{insight}, {donor_profile}` |
| `saathi_chat_turn.txt` | saathi_chat (turn) | `{insight}, {history}, {user_text}` |

Don't edit them. If a variable name doesn't match what your handler is passing, message me — I'll change the prompt to fit. The contract is: **prompts say what variable names they expect, you pass exactly those.**

---

## 9. Seed data for the demo

After the three Lambdas are live, run this once to give the demo donors a non-trivial chat history:

```bash
python3 scripts/seed_demo_conversations.py   # I'll write this — ~10 fake turns for 8 demo donors
```

Then invoke `distill_insight` once per seeded donor:

```bash
for did in $(aws dynamodb scan --table-name Patients --limit 10 --region us-east-1 \
  --query 'Items[].patient_id.S' --output text); do
  echo "distilling $did..."
done
```

(Wrong table — should be Donors. I'll write the seed + warm-up script. Just flagging that you'll run it once.)

---

## 10. Order of work (mine for the next 3 hours)

| Hour | Task | Verification |
|---|---|---|
| 0:00–0:30 | Add `DonorInsights` table to create script + run | `aws dynamodb describe-table --table-name DonorInsights` returns ACTIVE |
| 0:30–1:15 | Write `backend/shared/bedrock.py` + extend IAM policy + re-run deploy_lambdas (just to apply IAM) | Manual `aws lambda invoke marrow-health` still works after IAM change |
| 1:15–2:00 | Build `backend/notify_donor/handler.py` against placeholder prompt + add to deploy script | `aws lambda invoke marrow-notify-donor` with sample body returns text |
| 2:00–2:45 | Build `backend/distill_insight/handler.py` | Invoke once on a donor; check `DonorInsights` for new row |
| 2:45–3:30 | Build `backend/saathi_chat/handler.py` | `curl /conversations?donor_id=X` returns history |
| 3:30 | Re-run `scripts/deploy_api_gateway.sh` with new routes | `curl POST /notify/donor` returns generated message |

---

## 11. Integration boundary with Vasu

| What | Owned by |
|---|---|
| DynamoDB schema for `DonorInsights` | **You** define, in `docs/SCHEMA.md` |
| Lambda handler code | **You** |
| `backend/shared/bedrock.py` helper | **You** |
| IAM additions + deploy script updates | **You** |
| API Gateway route additions | **You** (script update + re-run) |
| Prompt content | **Vasu** |
| Frontend components consuming endpoints | **Vasu** |
| Demo seed script (`seed_demo_conversations.py`) | **Vasu** writes, you run |
| Final `openapi.yaml` update | **You** update, Vasu PRs if shapes break his frontend |

---

## 12. Cost expectation

| Component | At demo scale | At full network scale (5K donors) |
|---|---|---|
| Bedrock distill calls | 0–20 manual | ~5K/day = $1.50/day |
| Bedrock notification calls | ~10 in demo | ~100/day = $0.05/day |
| DynamoDB ops | inside free tier | inside free tier |
| Lambda invocations | inside free tier | inside free tier |

**Hackathon-day spend for this whole feature: under $1.** No alarm risk.

---

## 13. Talking points the panel will ask

| Likely question | Answer |
|---|---|
| "Why distill instead of just retrieving relevant turns?" | "Retrieval needs a vector DB and adds ~200ms latency per notification. Distillation gives us a bounded ~1KB cold memory we can read in one DynamoDB GetItem at sub-10ms. Tradeoff: we lose verbatim detail; gain massive latency + cost wins." |
| "How do you avoid hallucinated insights from the distiller?" | "Strict JSON output schema validation. Bedrock returns malformed JSON → handler keeps the existing insight rather than overwriting. We also keep `updated_at` so anomalies are detectable." |
| "What about consent for storing this?" | "DPDP Act alignment is roadmap; for the prototype, donor onboarding screen would include an explicit toggle. Insights are scoped to the org and erasable on demand by deleting one DynamoDB row." |
| "Will Bedrock survive a regional outage?" | "We use the `us.` cross-region inference profile — calls automatically route to us-east-1/us-east-2/us-west-2 based on capacity. Zero failover code on our side." |

---

## 14. Open questions for you (Vasu)

1. Do you want the chat turn endpoint to *also* trigger an insight re-distill when turn count crosses a threshold (e.g., 10 new turns since last distill), or do that strictly in cron? **My pick: trigger inline, fire-and-forget via async invoke** — keeps the system simple and removes the cron dependency for demo.
2. The `GET /donor/{id}/insight` route — do you need write access from the frontend (manual edits during demo) or read-only is fine? **My pick: read-only.**
3. SES emails — confirmed skipped for demo. We surface "notifications" in the chat UI only.

Reply to those three in your next message and I start coding.
