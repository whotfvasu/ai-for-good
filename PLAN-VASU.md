# Marrow — Vasu's Plan

> **Branch:** `vasu` · off `main`
> **Role:** Frontend + AI prompt design + UX
> **Partner:** Harsh — on branch `harsh`, owning AWS infra, Lambdas, data pipeline, ML
> See [PLAN.md](PLAN.md) for shared context, [PLAN-HARSH.md](PLAN-HARSH.md) for what Harsh is doing, [docs/marrow-architecture.excalidraw.md](docs/marrow-architecture.excalidraw.md) for the diagram.

---

## 0. The thesis I am building toward

*Marrow notices three invisible humans every other team's tech leaves out: the **parent counting days**, the **coordinator carrying institutional memory in her phone**, and the **donor who said "no" for a recoverable reason**. The AI doesn't just rank — it **remembers refusals, reassures families before they ask, and turns the 90 silent days after a donation into a relationship.***

My job is to make those three humans *visible on screen* and to make every Bedrock call sound like *one specific person paying attention*, not a personalization machine.

---

## 1. How Harsh and I work together

### Branching
- `main` is clean. Both `PLAN-VASU.md` and `PLAN-HARSH.md` live here so each can see the other.
- I work on `vasu`, Harsh on `harsh`. Push small commits often.
- **Sync points = end of each Layer.** At L0 done, L1 done, L2 done, we both PR to `main` and pull each other's work. No long-lived divergence.
- For any change to `openapi.yaml`, `backend/shared/prompts/`, or DynamoDB schema (`docs/SCHEMA.md`) → ping the other before merging.

### Shared contracts I depend on
| File | Owned by | What I need from it |
|---|---|---|
| `openapi.yaml` | Harsh drafts, both sign off | Every endpoint I call from React |
| `docs/SCHEMA.md` | Harsh | Field names for `Patients`, `Donors`, `Cycles`, `Conversations`, `Refusals` |
| `backend/shared/prompts/*.txt` | **Me** | The system + user prompts Harsh's Bedrock Lambdas load |

**The prompts are my territory.** Harsh writes the SDK call; I write what goes into it.

### Branching ritual
```bash
git checkout main && git pull
git checkout -b vasu          # first time only
git push -u origin vasu        # first time only
# work, commit small slices
git push
# when a Layer is done:
git checkout main && git pull
git merge vasu --no-ff -m "merge: vasu L1 dashboard + saathi + diary"
git push
git checkout vasu && git merge main   # pull Harsh's L1 in
```

---

## 2. What Harsh is building (so I don't duplicate)

| Layer | Harsh ships | I consume |
|---|---|---|
| L0 | AWS account, Lambda+APIGW skeleton, DynamoDB tables, CSV loader, IAM | API URL + Dynamo schema |
| L1 | `/forecast`, `/rank-donors`, `/saathi/outreach`, `/nl-query` | I render their JSON |
| L2 | `/refusals` log+classify, eligibility-curriculum cron, XGBoost propensity, worry-index calc | I show curriculum state, sort by worry, surface refusal reasons |
| L3 | Weekly Coordinator Pulse aggregation | I render the Pulse message |

If Harsh's endpoint isn't ready, **I mock against `openapi.yaml` with a `mocks/` JSON folder.** I never block on him.

---

## 3. My layered build

### Layer 0 — Foundation (Hour 0–4)

| # | Task | Done when |
|---|---|---|
| V0.1 | Vite + React + TypeScript + Tailwind scaffold in `frontend/` | `npm run dev` shows a styled page locally |
| V0.2 | Connect repo to AWS Amplify Hosting (Harsh creates the AWS app, I configure the build) | `main` push triggers a deploy, public URL works |
| V0.3 | Layout shell: top bar with **role switcher** (Coordinator / Donor / Family — hard-coded, no Cognito) | All 3 roles render their empty home |
| V0.4 | Tailwind tokens for the maroon/cream Marrow palette (match the deck) | Consistent button + card components |
| V0.5 | Wire `fetch` helper that points to `import.meta.env.VITE_API_URL` | Hitting `/health` from React returns 200 |

> **After L0, ask me: "Explain Vite vs Create-React-App, what `VITE_*` env vars do, and how Amplify builds my branch on push."**

---

### Layer 1 — MVP Predictive Loop (Hour 4–14)

#### V1.1 — Coordinator Dashboard *(hour 4–8)*
- Three columns: **Reassured this week** (count, big number), **Upcoming demand (next 7 days)** (list), **Donor pool health** (small chart).
- Click a patient → opens a side panel with the ranked donor list (consumes `/rank-donors?patient_id=…`).
- Each donor card shows the score *breakdown* in plain English: *"eligible ✓ · 86% responsive · 4.2 km · last donation 12 weeks ago."*
- **Inverted metric**: hero number is "families reassured" not "patients due." Reassurance count = patients where Saathi sent a parent message in the last 7 days. Field comes from Harsh's `Cycles` table (`family_reassured_at`).

> **After V1.1, ask: "Explain React component composition with Tailwind, why we colocate state with the page, and how the side panel handles loading states."**

#### V1.2 — Donor Ranking Side Panel *(hour 8–9)*
- Each donor row has an **"Approve outreach"** button (the co-pilot pattern — coordinator approves Saathi's action, doesn't compose it).
- Clicking approve calls Harsh's `/saathi/outreach` → renders the generated message in a preview modal → coordinator hits Send (which calls `/outreach/send`, a no-op for demo that logs to `Conversations`).

#### V1.3 — Bedrock Saathi Prompt v1 (Outreach) *(hour 9–11)*
- I own `backend/shared/prompts/saathi_outreach.txt`. Harsh's Lambda loads it.
- The prompt must include the **Bridge Origin Story** in its first sentence: *"You and {patient_name} both live in {locality}, you have {donor.kids_or_similar}, and your {blood_group} is what {patient_first_name}'s treatment needs."* — that one line is the demo gut-punch.
- Include the **continuity opener** if `donor.last_interaction_snippet` exists: *"Last time you said {snippet} — hope that's settled."*
- Variables I'll substitute: `{donor.*}, {patient.*}, {language}, {register: formal|intimate}, {last_interaction_snippet?}`.
- Test against 3 dataset rows manually before declaring done.

> **After V1.3, ask: "Explain Bedrock InvokeModel, the difference between Haiku and Sonnet, how token billing works, and why our prompt is structured system+user not single-turn."**

#### V1.4 — Natural Language Query Bar *(hour 11–13)*
- Single input at top of dashboard. Coordinator types: *"O+ donors in Hyderabad who lapsed in the last 60 days."*
- Calls `/nl-query` → renders the resulting donor list.
- **The novel twist**: response is followed by an action suggestion bubble — *"Want me to draft outreach for the top 5? Approve one by one."* Clicking spins up a queue UI.

> **After V1.4, ask: "Explain how an LLM safely translates English to a DynamoDB FilterExpression, and the risks of letting it generate raw queries."**

#### V1.5 — Family Reassurance Acknowledgement *(hour 13–14)*
- A minimal "family" role view: shows their patient's next forecasted date and a single message bubble: *"We've already started looking for donors for {patient}'s {date} transfusion."*
- The "Got it 🙏" button hits `/family/ack` → flips `cycle.family_reassured_at`.
- This is what feeds the dashboard hero metric. **Without this view the hero metric is hollow.**

**End of L1 → tag `v1-mvp` on main after merge with Harsh. Submission-safe.**

---

### Layer 2 — Differentiators (Hour 14–22)

#### V2.1 — Donor Chat UI (WhatsApp-style) *(hour 14–17)*
- Full-screen chat for donor role. Green bubbles, name avatar, "online" status — looks like WhatsApp on purpose.
- On open, calls `/saathi/chat/open?donor_id=…`. Saathi's first message is **never** "How can I help?" — Harsh's endpoint returns the continuity opener (last donation + impact note + eligibility countdown + tentative slot offer).
- Chat history pulled from `Conversations` table via `/conversations?donor_id=…`.

> **After V2.1, ask: "Explain WebSocket vs long-polling vs simple request/response for a chat UI, and why we picked the simpler one for a 24h demo."**

#### V2.2 — Refusal Capture in Chat *(hour 17–18)*
- When Saathi sends an ask and the donor types something that looks like "no," the chat surfaces 6 quick-tap chips: **Medical · Travel · Work · Fear · Tired · Trust**.
- Tapping sends `/refusals` with the reason. The next message from Saathi is *reason-aware*: *"Thanks for being honest — take care. I'll check back after your travel."*
- Harsh's classifier handles free-text refusals too; I just render the chips.

> **After V2.2, ask: "Explain why structured refusal data beats free-text for downstream re-engagement, and how a small classifier can sit in front of an LLM."**

#### V2.3 — Donor Diary + Constellation *(hour 18–20)*
- New tab in the donor view: **"Your story."**
- Diary: scrollable timeline of every donation, with the family's thank-you note rendered as a card.
- Constellation: SVG star map (simple — circles + lines) where each star is a patient the donor has sustained. Hover → name + date.
- Data from `/donor/{id}/diary` (Harsh provides aggregation).
- **Zero ML, pure emotion — this is the surface judges will screenshot.**

#### V2.4 — Eligibility Curriculum Surface *(hour 20–21)*
- Each donor's chat shows a small "where you are in your cycle" indicator — *day 7 / 30 / 60 / 85 / eligible.*
- When Saathi auto-sends a curriculum message (Harsh's cron does this), it appears in the chat history with a subtle badge: *"💡 Did you know…"* or *"🎉 You're eligible again in 5 days."*

#### V2.5 — Worry-Sorted Coordinator View *(hour 21–22, if time)*
- Add a sort toggle: **"By worry"** vs **"By medical due date."**
- Worry index comes from Harsh's endpoint. UI just sorts and visually flags the top 3 with a soft pulse animation.

---

### Layer 3 — Polish + Pitch (Hour 22–24)

| # | Task |
|---|---|
| V3.1 | Coordinator Pulse modal — Friday-evening message Saathi sends the coordinator: *"You helped 47 patients this week, 3 families thanked you by name."* Pulls from `/coordinator/{id}/pulse`. |
| V3.2 | Demo script in `docs/DEMO.md` — 90 seconds, three acts: *Reassurance → Continuity → Loop closure.* |
| V3.3 | Architecture diagram slide (export from `marrow-architecture.excalidraw.md`). |
| V3.4 | Tiny "register-aware language" demo toggle — switch a donor between English / Hindi / Telugu and show Saathi's tone change live. One Bedrock call, massive judge moment. |
| V3.5 | Record a 90-second screen capture as demo backup in case wifi dies. |

---

## 4. The prompt files I own

All in `backend/shared/prompts/`. Each is a Jinja-style `.txt` with `{variables}`. Harsh wraps them in a small `load_prompt(name, **kwargs)` helper.

| File | Purpose | First version due |
|---|---|---|
| `saathi_outreach.txt` | Bridge Origin Story + continuity opener + ask | V1.3 (h 9–11) |
| `nl_query.txt` | English → DynamoDB filter (system prompt with table schema injected) | V1.4 (h 11–13) |
| `saathi_chat_open.txt` | Continuity opener on chat open | V2.1 (h 14–17) |
| `saathi_chat_turn.txt` | Mid-conversation turn with memory window | V2.1 |
| `refusal_classifier.txt` | Free-text "no" → one of 6 buckets | V2.2 |
| `impact_story.txt` | Patient parent's one-sentence → 3-line donor note (family ghostwriter pattern) | V2.3 |
| `coordinator_pulse.txt` | Weekly summary in warm voice | V3.1 |
| `style_register.txt` | Shared style guide block injected into every prompt — picks register from `donor.age` and `donor.prior_message_style` | V3.4 |

**Rule of thumb for prompt design**: every prompt loads with a tiny `MARROW_VOICE` block that says *"You are Saathi. You write like a thoughtful older sibling, never like a marketing email. Reference last interaction first. Never use exclamation marks more than once."* That single block is what stops generic Claude output.

---

## 5. Conflict zones with Harsh — how we resolve

| Zone | Rule |
|---|---|
| `openapi.yaml` | Harsh proposes, I review within 30 min. Locked at end of L0. Any change after = PR with both approvals. |
| `docs/SCHEMA.md` | Harsh owns. I read-only. If I need a new field, I open an issue/Slack note, don't edit. |
| `backend/shared/prompts/` | I own. Harsh's Lambda code just loads the file by name. |
| Conversation memory window size | Decided together: last 6 turns + donor profile JSON. Both sides hard-code this constant in `shared/constants.py` and `frontend/src/constants.ts`. |
| Time zone | All timestamps stored UTC, rendered IST in UI. I handle render, Harsh stores UTC. |
| Demo seed data | Harsh writes seed script. I tell him which 3 patients × 5 donors will make the best demo. |

---

## 6. After every feature — I learn the stack

The user (me) asks Claude:
- After L0: **Amplify build pipeline, Vite envs, React + Tailwind composition**
- After V1.1: **how the dashboard composes state and renders Harsh's API**
- After V1.3: **Bedrock InvokeModel, Haiku vs Sonnet, prompt anatomy**
- After V1.4: **safe LLM → query translation, why we constrain output to JSON**
- After V2.1: **chat UX patterns, polling cadence, optimistic UI**
- After V2.3: **SVG mapping for the constellation, why we didn't reach for d3**
- After V3.4: **prompt register/tone control, why one block beats many prompts**

I'll keep notes in `docs/LEARNINGS-VASU.md` so I can speak to any of it on demo day.

---

## 7. Personal kill list (what I will *not* do, even if tempted)

- Cognito sign-in (role switcher hard-coded)
- Real-time WebSockets (polling is fine for 24h)
- Animations beyond Tailwind's `transition` utilities
- A design system (Tailwind defaults + maroon palette is enough)
- Storybook, tests beyond `npm run build` passing
- Mobile responsive (desktop demo only — say so to judges if asked)

If I find myself doing any of these before L2 is shipped, I stop and revert.
