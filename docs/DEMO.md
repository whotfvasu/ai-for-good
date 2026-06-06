# Marrow — Jury Demo Script (~4 minutes)

> Goal: land the one idea ("the bridge runs itself; the coordinator handles only
> exceptions") and show real AWS + real AI doing it. Three roles, one loop.

## Before you walk up (prep, 5 min)

1. Deploy is live and Amplify env has `NEXT_PUBLIC_USE_L2_MOCKS=false`.
2. Twilio creds set; **your phone is joined to the Twilio sandbox**.
3. Warm the loop and manufacture one exception:
   ```bash
   API=https://02ckdjxwyg.execute-api.us-east-1.amazonaws.com
   # one autonomous pass — most cycles become auto_running
   curl -X POST "$API/cycle/run" -H 'content-type: application/json' \
     -d '{"anchor_date":"2025-08-17","window":14}'
   # (optional) decline donors on one small bridge to create a needs_coordinator
   ```
4. Pre-warm Lambdas: hit `/health`, `/forecast`, `/bridge` once each.
5. Open three browser tabs, logged in: Coordinator, Donor, Patient.
   Pin the donor with `?donor_id=<your demo donor>` if you want it deterministic.

## The 30-second thesis (say first)

> "Thalassemia demand isn't random — it's a rhythm. Blood Warriors already
> organises donors into *bridges*: ~15 donors who rotate to sustain one patient.
> Marrow makes that bridge autonomous. The system runs each transfusion cycle
> itself and only escalates the exceptions to a human. That's how one
> coordinator scales to a whole country."

## Act 1 — Coordinator: "handle exceptions, not everything" (60s)

1. Open the **Coordinator** tab. Point at the hero strip:
   *"47 cycles running autonomously. 2 need me. 96% autonomy rate."*
2. *"Every one of these is real — forecast from the dataset, donors from the
   actual Blood Bridges in DynamoDB."*
3. Click **Run autonomous pass** — numbers update live. *"That's the loop
   sweeping every upcoming patient, assigning the next donor in rotation."*
4. Click an exception card → drawer opens → show the bridge donors with
   **"% likely"** from the XGBoost model and "what the model weighs." Click
   **Assign**. *"I just resolved the one case the system couldn't — in one click."*

## Act 2 — Donor: real WhatsApp + memory (75s)

1. Open the **Donor** tab. The chat opener references the donor's history:
   *"It doesn't greet — it remembers. This is Bedrock with cold-memory we
   distilled from months of chat into a 1 KB record, so it stays cheap at scale."*
2. Scroll to the **action banner**: "Aarav needs O+ on the 24th — can you give?"
3. **Hold up your phone** — the same message arrived on **WhatsApp** (Twilio).
   *"Same brain, the donor's real channel."*
4. Tap **Can't this time** → pick a reason. *"A 'no' isn't a dead end — it
   carries a reason and an expiry. Our policy won't ask again until it clears,
   and the cycle auto-reassigns to the next donor in the bridge."*
5. Flip back to Coordinator briefly — the cycle already moved on. *"No human
   touched that."*

## Act 3 — Patient + the spread (45s)

1. Open the **Patient** tab: tentative-date alert + their Blood Bridge ring
   (ready / recently donated / resting). *"The patient sees their bridge is
   healthy before they ever have to ask — anxiety, removed."*
2. Click **Confirm this date works**.

## Act 4 — Why it spreads (30s)

1. Back on Donor, scroll to **Share your impact** → tap **Share my card** →
   the placard PNG generates. *"Strava for blood. Every donor share recruits the
   next one — organic growth built in."*

## Close (15s)

> "Predictive, autonomous, memory-aware — and every piece is real AWS: Lambda,
> DynamoDB, Bedrock, API Gateway, Amplify. The coordinator's job shrank from
> hundreds of calls to a two-item inbox. That's how you run a blood network for
> a country."

## If something breaks
- WhatsApp didn't arrive → the in-app timeline still shows the message; carry on.
- An endpoint errors → the frontend falls back to mocks (shape-identical); the
  flow still demos.
- ML score missing → ranking still works on the rule score (graceful fallback).

## Likely jury questions → answers
- *"Is the AI real or scripted?"* — Live Bedrock calls; show the Network tab.
- *"Does this scale?"* — Coordinator load is O(exceptions). Memory is bounded
  (1 KB/donor). No idle infra. Same architecture 1→1M.
- *"Why not SageMaker for the model?"* — We train offline and serve the trees in
  pure Python — <10 KB, no GPU, no ML runtime in the Lambda.
- *"Consent / privacy?"* — DPDP-aligned roadmap; insights are one erasable row
  per donor, scoped to the org.
