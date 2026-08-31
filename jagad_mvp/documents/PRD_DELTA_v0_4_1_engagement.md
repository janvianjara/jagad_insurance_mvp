# PRD delta — inquiry engagement layer

**Against** PRD_Insurance_Agency_Platform_v0_4_1.docx · **Proposes** FR-06.12 to FR-06.19
**For** client re-confirm before the workflow canvas is regenerated

---

## The gap in one sentence

The PRD has **Task** but no **Activity**. FR-15.1 lets a task attach to an inquiry — that is a
future intention. Nothing anywhere records a past fact: *I called, this is what he said.*

## Where it shows

**§8.15 is titled "Task & Activity Engine."** FR-15's entity line reads `Owns: Task, WorkQueue`.
Activity is named in the heading and never specified.

**§9.1 ends at step 3** — the TAT fork. **§9.2 opens at step 4** — *"Assignee selects the customer +
candidate policies."* As if the agent already knows the family size, the ages, the budget and the
existing cover. Story 7.1 stops at 1.6 "enters routing"; story 7.2 opens at 2.1 "An accepted
inquiry." The entire discovery conversation is assumed to have happened off-system.

**The metric hides it.** §3.2 measures *"% inquiries confirmed within configured TAT ≥ 90%."* That
measures acceptance. Everyone can accept every inquiry inside 24 hours, never call anyone, and the
KPI stays green.

## What is covered today, and what is not

| Stage | Covered | Where |
|---|---|---|
| Inquiry arrives, 5 sources | Yes | FR-06.1 |
| Auto-assign by category | Yes | FR-06.3, §9.1 |
| Assignee must confirm | Yes | Story 1.2 |
| TAT lapse → reassign → escalate | Yes | Stories 1.3–1.5 |
| **Accepted → agent calls the person** | **No** | — |
| **What was said, and what happens next** | **No** | — |
| **"Call me on the 3rd"** | **No** | — |
| **Requirement gathering before quoting** | **No** | — |
| Quotation composer | Yes | FR-06.5, §9.2 step 4 |
| Revision loop | Yes | FR-06.9, §9.2 step 5 |
| Won / Lost | Yes | FR-06.10 |

## Nine consequences

| # | Missing | What it costs |
|---|---|---|
| 1 | Activity object | No call log, no note, no interaction history. The most-used CRM screen does not exist |
| 2 | Call disposition vocabulary | No connected / not reachable / busy / wrong number / call back / not interested |
| 3 | Callback as a flow | A task can be made by hand, but nothing says *disposition = call back → schedule it* |
| 4 | Inquiry stage model | Effectively binary: unconfirmed → accepted → won/lost. No pipeline view, no stage-conversion data |
| 5 | Requirement capture | Members, DOBs, budget, existing cover, urgency — the composer needs them, nothing collects them |
| 6 | Attempt counter | "Tried three times, never picked up" is a real state with no representation |
| 7 | Post-acceptance ageing | TAT covers confirmation only. After Accepted an inquiry can sit forever and nothing notices |
| 8 | Dormant / recycle | A cold lead has one exit: Lost. That destroys the win-back list |
| 9 | Inbound capture | Customer replies do not land on the inquiry timeline |

## The eight new FRs

| FR | Feature | MoSCoW | Phase |
|---|---|---|---|
| FR-06.12 | **Inquiry stage model** — admin-configurable stages with entry/exit rules | M | P1 |
| FR-06.13 | **Activity log** — polymorphic Activity (call, WhatsApp, email, meeting, visit), direction, timestamp, actor, notes; timeline on the inquiry | M | P1 |
| FR-06.14 | **Disposition** — per-channel outcome master; disposition drives stage and next action per the matrix below | M | P1 |
| FR-06.15 | **Next-action mandate** — an open inquiry cannot be saved without a dated next action or a terminal outcome | M | P1 |
| FR-06.16 | **Requirement capture** — a dynamic form (FR-03) per category attached to the inquiry, feeding the composer | M | P1 |
| FR-06.17 | **Attempt tracking and dormancy** — configurable no-contact threshold → Dormant → recycle to pool or win-back | S | P1 |
| FR-06.18 | **Inbound capture** — replies from FR-17 channels land on the inquiry timeline as activities | S | P1 |
| FR-06.19 | **Pipeline view** — by stage, with conversion rate and ageing per stage | M | P1 |

## The disposition matrix — the core of the proposal

Logging an activity forces a disposition, and the disposition drives the system:

| Disposition | Stage becomes | System does |
|---|---|---|
| Connected — interested | Requirement capture | Opens the requirement form; next action mandatory |
| **Connected — call back [date/time]** | Follow-up scheduled | **Creates the task, sets the reminder, holds the inquiry**; optional confirmation message to customer |
| Connected — needs information | Needs-info | Task created; suggests the relevant template to send |
| Connected — not interested | Lost | Reason mandatory (FR-06.10 already requires this) |
| Not reachable | Not reachable | Attempt counter +1; retry task after N hours; after X attempts → escalate or dormant |
| Busy, call later today | Contacted | Short retry task, same day |
| Wrong number | Data issue | Flags source quality; routes back for correction, does not silently die |

Every row is configuration an admin edits — same principle as every other master (FR-02).

## The rule that makes it a CRM

> **No open inquiry may exist without a dated next action.**

Logging an activity requires one of two things: a next action with a date, or a terminal outcome.
That single constraint is the difference between a CRM and a list. It is what stops leads rotting,
and it is currently absent.

## Revised §9.1 → §9.2 narrative

Steps 3a–3d, inserted between the TAT fork and "Assignee selects the customer":

> **3a.** The assignee contacts the customer and logs the activity: channel, when, what was said,
> and a disposition from the configured list.
> **3b.** The disposition moves the inquiry's stage and decides what the system does next — schedule
> the callback, raise the task, suggest the template, increment the attempt, or close as Lost with a
> reason.
> **3c.** The activity cannot be saved without a dated next action, unless the disposition is
> terminal. An open inquiry always has a next thing and a date it happens on.
> **3d.** Where the customer is interested, the category's requirement form is captured — members,
> DOBs, budget band, existing cover, urgency. **Its values are what §9.2 step 4 has been assuming
> the agent already knows.**

## New recipes for FR-21.2's starter library

- No activity on an open inquiry for N days → nudge the owner
- Next action overdue → escalate to the sales manager
- Callback due → task and reminder fire
- Attempt count hits X with no contact → dormant

## Change the metric

Add to §3.2:

| KPI | Definition | Target |
|---|---|---|
| **Next-action coverage** | % of open inquiries carrying a dated next action | ≥ 95% |

This is the leading indicator. TAT confirmation is a lagging number by comparison, and on its own it
can read 100% while nobody has spoken to a single customer.

## Entity model

Task already exists — it is reused, not replaced. The distinction is the whole design:

| | Task (FR-15) | Activity (new) |
|---|---|---|
| Tense | Future | Past |
| Question | What must be done | What happened |
| Mutable | Yes, until complete | No — append-only |
| Created by | Recipes and people | People and inbound channels |

`Activity` refs Inquiry / Customer / Deal · owns disposition, notes, channel, direction, timestamp,
actor · optionally creates a Task.

**DAG impact: none.** FR-06 already depends on FR-15, FR-17, FR-09 and FR-21. No new edges, no
cycle.

## One privacy note that makes the AI work

A call note on a health inquiry routinely carries a diagnosis. The note is therefore classified as
document content and never reaches the Assistant, while the disposition, the timestamps, the attempt
count and the stage are operational and do.

That split is what makes the AI prototype's existing promises deliverable. "Reschedule a follow-up",
"stalled quotations", "which leads haven't been touched in 10 days" all read *that* and *when*
contact happened — never *what was said*. **The prototype is currently demonstrating a capability
the spec cannot deliver; these eight FRs are what close that.**

## Worth checking next

This is the same class of gap as premium mode and GMC: modelling the *artifact* (policy, inquiry,
customer) and not the *process around it*. Renewals likely has it too — FR-12 has reminders but no
record of what the customer said when you called them.
