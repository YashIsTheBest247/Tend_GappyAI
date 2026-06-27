# Tend — Architecture

Tend is a single **Lemma pod** (`support-desk`). This document describes the data model, the
agents, the autonomous pipeline, and the design decisions behind it.

---

## 1. Data model (Tables)

All tables are **shared** (`enable_rls: false`) — it's a team queue, not per-user data. Relationships
are by `*_id` convention (foreign keys were intentionally dropped; see §6).

| Table | Key columns |
|---|---|
| **tickets** | `number` (serial), `subject`, `body_preview`, `channel`(email/form/slack), `customer_name/email`, `status`(new→triaged→awaiting_approval→answered / escalated / closed), `priority`, `category`, `sentiment`, `summary`, `tags`(json), `confidence`(float), `sla_due_at`, `first_response_at`, `resolved_at` |
| **messages** | `ticket_id`, `direction`(inbound/outbound/internal), `channel`, `author`, `body` |
| **drafts** | `ticket_id`, `version`, `body`, `citations`(json), `confidence`, `status`(proposed/approved/rejected/sent), `reviewer_user_id`, `review_notes` |
| **ticket_events** | `ticket_id`, `kind`(created/triaged/escalated/drafted/approved/rejected/sent/note…), `actor`, `detail` — the audit trail |
| **quality** | `ticket_id`, `draft_id`, `score`(0-100), `verdict`(ship/revise/escalate), `tone`, `grounding`, `issues`(json), `suggestion` — the QA verdict |

**Files / RAG:** the `/knowledge` document store holds the product docs (`.txt`). Lemma auto-indexes
them; the draft and coach agents search them, and the kb-writer publishes new ones into the same store.

---

## 2. Agents (6)

Agents are pure reasoners — they read context and emit structured output; **functions** do all the
writes. Each agent has an `instruction.txt` and a JSON-Schema `output_schema`.

| Agent | Role | Reads | Output |
|---|---|---|---|
| **triage-agent** | Classify a ticket | tickets, messages | category, priority, sentiment, summary, tags |
| **draft-agent** | Write a grounded reply | tickets, messages, `/knowledge` | body, citations[], confidence, needs_human |
| **reply-coach** | QA the draft (second opinion) | tickets, messages, drafts, `/knowledge` | score, verdict, tone, grounding, issues[], suggestion |
| **kb-writer** | Turn an unanswered ticket into a KB article | tickets, messages, `/knowledge` | title, slug, body |
| **frontline** | Customer-facing chat agent (Telegram/Slack) | `/knowledge` + `intake_ticket` tool | answers + logs a ticket |
| **concierge** | Read-only team assistant in the app | all tables, `/knowledge` | answers about the queue/KB |

---

## 3. Functions (7)

Deterministic Python (`code.py`, Pydantic in/out). Functions own every table write and side effect.

| Function | Does |
|---|---|
| **intake_ticket** | Create the ticket + first inbound message + `created` event |
| **apply_triage** | Persist the triage classification; recompute SLA from priority; auto-escalate urgent / high+negative |
| **save_draft** | Store a new draft version; move ticket → `awaiting_approval` (preserving `escalated`) |
| **decide_reply** | Human/Autopilot decision: approve → outbound message + `answered` + SLA close (+ optional Gmail send); reject → back to queue with notes |
| **escalate_ticket** | Mark a ticket escalated with a reason |
| **save_quality** | Persist the reply-coach verdict into `quality` + a note event |
| **publish_kb** | Write a generated article into `/knowledge` (RAG-indexed) + a note event |

---

## 4. The autonomous pipeline (Workflows + Schedule)

There are three workflows and one schedule.

### `auto_intake` — the autonomous pipeline (schedule-driven)
A **datastore schedule** (`auto-intake`) fires on every `tickets` **INSERT** and runs:

```
triage-agent → apply_triage → draft-agent → save_draft → reply-coach → save_quality → END
```

The new ticket's id is read from `start.metadata.record_id`. This is what makes the desk
**autonomous**: the instant a ticket exists (from the app, the Telegram agent, or any source), it is
triaged, drafted, and QA-graded with **no human trigger**.

### `intake` — manual re-run (FORM entry)
Same node chain but with a `FORM` entry that takes a `ticket_id`. Used by the app's **"Run AI"** button
(`useWorkflowStart({ ticket_id })`) to re-process a single ticket on demand.

### `write_kb` — self-improving knowledge base
```
FORM(ticket_id) → kb-writer (drafts an article) → publish_kb (writes it to /knowledge) → END
```
Triggered from a ticket the AI couldn't answer well; the new doc is immediately searchable by the
draft agent, so the *next* identical question is answered automatically.

### Channels & the Surface
The **`frontline`** agent is bound to a live **Telegram Surface**. An inbound DM → the agent answers
from `/knowledge` and calls `intake_ticket` (a granted function tool) → the new row triggers the
schedule → the full pipeline runs. (Email / form / Slack feed the same `intake_ticket` entry point.)

---

## 5. The app (`apps/console`)

Vite + React + TypeScript on the `lemma-sdk` React hooks. All pod access is centralized in
`src/lib/podData.ts`; the client is constructed once in `src/lib/lemmaClient.ts` from the pod config
Lemma injects at deploy time.

- **Queue** — live, filterable, searchable list (`useLiveRecords`) with SLA badges
- **Review** — drafts awaiting approval, each showing its QA score + ** Autopilot** (bulk-approve ship-rated)
- **Ticket** — conversation, editable draft + citations, **AI quality check** panel, similar tickets, activity timeline, Run-AI / Write-KB / Escalate actions
- **Insights** — KPIs, breakdown bars, knowledge gaps, automation & channels
- **Knowledge** — the `/knowledge` docs + semantic search
- **Assistant** — the read-only `concierge` agent (`AgentThread`)
- **⌘K** command palette, dark mode, toasts, page transitions

---

## 6. Notable design decisions

- **Agents reason, functions write.** Lemma agent grants and agent-vs-function identities differ; keeping
  all writes in functions (which reliably get grants) made the system robust. Agents emit structured
  output that functions persist.
- **Two AIs, not one.** The reply-coach is a separate agent so quality control is independent of the
  drafter — a real second opinion, surfaced as a score the human trusts (and Autopilot acts on).
- **Autonomy via a schedule, not the workflow's own trigger.** A workflow's built-in `DATASTORE_EVENT`
  start does not fire on this platform; a `schedules`-based datastore trigger does. `auto_intake` reads
  `start.metadata.record_id`.
- **No foreign keys.** The platform 500s on self-referential FKs and creates tables alphabetically (so
  child→parent FKs fail). Relating by `*_id` UUID convention is order-independent and loses nothing the
  app relies on.
- **Grants applied server-side.** Bundle import doesn't apply `permissions.grants`; they're pushed with
  `lemma {agents,functions} permissions replace` (payloads in [`grants/`](grants/)).
- **Self-improving loop.** Low draft confidence → a *knowledge gap* → `write_kb` publishes a doc → future
  drafts ground in it. The product gets measurably better the more it's used.
