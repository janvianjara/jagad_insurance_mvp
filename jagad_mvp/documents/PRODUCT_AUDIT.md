# Product audit — system, workflow, IA and UI

**Inspected** 2026-08-31 against the working tree on `claude/document-review-os26kz`.
**Method:** PRD v0.4.1 text extraction, full route/nav/domain read, `npm run check`, and a
production build driven in Chrome at 1440×900 with screenshots of eleven screens.

This document does **not** repeat `PRD_GAP_ANALYSIS.md` (module depth), `VISUAL_REVIEW.md`
(26 visual defects), `CLAIMS_MODULE_AUDIT.md`, or the playbook Backlog. Those are current and
correct. What follows is what none of them covers: **whether the system reads as one connected
product to somebody seeing it for the first time**, and the defects that only show up when the
built screens are opened in order.

---

## 0. The headline

The premise "the MVP is developed, now find what is missing" is **half right**. Module depth is
genuinely deep and already honestly documented. What is weak is not the modules — it is the
**first ninety seconds**: the default state of the two most important registers, the shape of the
admin rail, and four copy/count contradictions a client will read before anyone speaks.

Three things must be settled before any implementation:

1. **`/policies` — the flagship register — opens on 25 unissued drafts.** Verified, P0.
2. **The gate is not trustworthy.** `npm run check` is red (3/2382); the same suite is green at
   `--maxWorkers=3`. Constitution says do not build on red. Must be fixed first.
3. **GMC does not exist in this product, and is not in the PRD.** The brief asks for a GMC
   end-to-end audit. See §G — this needs a decision, not an implementation.

---

## A. Product understanding

Single-tenant insurance-agency ERP for a Gujarat agency. Web only, mock data behind a repository
layer with simulated latency. 65 routes, 49 screens, 7 role rails, ~2,382 tests.

The build's real spine is four ideas, and they are unusually well held:

- **The queue is the app.** Fifteen list screens are one `<WorkQueue>` plus a `QueueConfig`. The
  filter bar, stripe, pagination and keyboard model never move between modules.
- **The URL owns list state.** Filter, sort, page and selection are search params, so every view is
  linkable and the back button works. Export exports *the view on screen* because of this.
- **Guardrails are structural, not advisory.** `<RecordOnlyAmount>`, `<OcrField>`, `<ConfirmGate>`,
  `<RollUp>`, plus a token check and an Assistant boundary test that walks the import graph.
- **Permissions are one evaluator.** The rail and the router ask the same `can()`, so they cannot
  disagree about who sees what.

This is not "a collection of features". The connective tissue exists. The problems are at the
surface, which is also where a client looks.

---

## B. End-to-end workflow map

Traced against the route map, the nav config and the workflow machines.

```
CAPTURE      /inquiries/new ──┐
IMPORT       Excel wizard  ───┤
PORTAL/WEB   (unwired)     ───┘
                  │
                  ▼
ROUTE        /inquiries ── routing.ts ── unrouted alert ── assignment trail ── TAT clock
                  │                                              │
                  │                                    escalate / auto-reassign
                  ▼
ENGAGE       activity log · disposition · next-action mandate · stages · dormancy      [P-18*]
                  │
                  ▼
QUOTE        /quotations/new ── composer ── benefit matrix ── versions ── generate ── share
                  │
                  ▼
CLOSE        /deals ── line items ── won
                  │
                  ▼
ENTER        /policies/new?dealId= ── schema-rendered ── OCR review ── /back-office/drafts
                  │
        ┌─────────┼──────────┬───────────────┐
        ▼         ▼          ▼               ▼
      KYC     COLLECT    ISSUANCE        COMMISSION
   /back-     /back-    /back-office/    3-level chain,
   office/kyc office/   issuance         computed vs booked
             collections
        │
        ▼
SERVE   /policies/:id ── versions · schedule · endorsements · claims
        │
        ▼
RENEW   /renewals ── pool · instalments · notice batches
        │
        └──────────► back to QUOTE (repeat purchase — FR-09.8, no code path)
```

**The chain is complete and walkable.** Every arrow above has a screen behind it. That is a real
achievement and it should be said in the room.

**Where the chain leaks — five places, all at the joins, none inside a module:**

| # | Join | What breaks | Class |
|---|---|---|---|
| B1 | Inquiry → repeat purchase | FR-09.8 has no code path; a returning customer starts as a cold lead with the original sub-agent unattached | Missing |
| B2 | Anything → Customer | `customers.create` exists but its only front door is inside the quotation composer (`CustomerQuickAdd`). `/customers` offers Import and Export and **no create action** | Disconnected |
| B3 | Endorsement/renewal → Commission | `commissionChain` accepts and is tested against `endorsement.approved` and `renewal.completed`; nothing calls it on those edges | Incomplete |
| B4 | Any event → automation | The recipe runtime exists and dispatches, but the four things people ask about — TAT breach, stalled quotation, ageing claim, bounced cheque — each have thresholds written down and no watcher | Incomplete |
| B5 | Consent withdrawal → record | Recorded on the customer desk; `ConsentState` has no `withdrawn` member, so the pill does not move. The screen says so in words, which is the right call, but it is a visible dead end | Incomplete |

B2 is the one a client notices in minute two. B4 is the one that decides whether "agentic" is
believed.

---

## C. PRD gap analysis — delta only

`PRD_GAP_ANALYSIS.md` is accurate and current; read it for module depth. Two corrections and one
addition from this pass:

- **The reports catalogue holds 10 reports.** `ReportsScreen.tsx:82` and `:119` both still say
  *"five"*, and `reports.test.tsx:188` asserts *"all five reports"*. The screen's own headline
  contradicts the nine cards under it. **Incorrect · P1.**
- **Households are seeded for 5 customers of 307**, all `hh-patel`. FR-09's household/floater model
  is built, but the `HOUSEHOLD` column on `/customers` reads "No household" in every visible row,
  so the feature is invisible in the register that exists to show it. **Incomplete (fixture) · P1.**
- **GMC is not a PRD v0.4.1 requirement.** See §G.

---

## D. UX audit

Judged against the five questions every screen must answer.

**What works — and should not be touched:**

`/inquiries/:id` answers all five cleanly: breadcrumb, name + `SYS INQ-1045` + state pill + TAT
badge, a **"What happens next"** section that names the machine, an assignment trail oldest-first,
and a right column of record facts. This is the pattern. Every detail screen should be measured
against it.

`/back-office` is the second-best screen in the build: six cards, a count, a sentence saying what
each queue *is*, and "Open the queue". It answers "where does work start" without prose.

**What does not:**

| # | Screen | Problem | Class | P |
|---|---|---|---|---|
| D1 | `/policies` | `defaultSort: expiryDate asc` + drafts carry no expiry ⇒ **all 25 rows on page 1 are drafts**. Four columns constant (`insurer no. awaited`, `Draft`, `Unpaid`, `no expiry recorded`). A client opening Policies sees no in-force policy at all | Confusing UX | **P0** |
| D2 | `/policies` | Rail badge says `99+` (in-force), header says `515 policies` (everything). Two numbers for one noun, on one screen | Confusing UX | P1 |
| D3 | `/back-office` | Rail badge `6` ("entries to finish"), page badge `131 items waiting across six queues`. Both true, neither reconcilable by the reader | Confusing UX | P1 |
| D4 | `/customers` | No create action. Sorted alphabetically, so page 1 is nine people called Amit — a filing cabinet, not a work surface | Disconnected | P1 |
| D5 | `/assistant` | The sticky "Ask about your queue" block **overlays the last card of the conversation** — the mandate-failure card is cut mid-row. The scroll region reserves no space for the composer | Confusing UX | P1 |
| D6 | `/inquiries/:id` | The disabled-looking primary (`Confirm and accept`) leads; the action actually available (`Auto-reassign`) is styled secondary. Hierarchy inverted at the moment of decision | Confusing UX | P2 |
| D7 | `/inquiries` | Filter select labels clip at the baseline — "Any stage", "All category" are cut. `VISUAL_REVIEW` #3 recurring at 1440 | UI clutter | P2 |

---

## E. UI congestion audit — why it feels congested

The congestion is **not** density of type or spacing. Measured on the real build, the type scale,
the 4px space ramp and the row heights are calm and correct. Three specific things create the
feeling, and all three are additive:

### E1. Constant columns — the largest single cause

A column whose every visible cell holds the same value costs full width and returns zero bits.
Counted on page 1 of each register at 1440px:

| Screen | Constant columns | Evidence |
|---|---|---|
| `/policies` | 4 of 8 | `insurer no. awaited` ×25, `Unpaid` ×25, `no expiry recorded` ×25, `Draft`/`Sent` only |
| `/customers` | 1 of 8 + 3 pill columns | `No household` ×25; Status/KYC/Consent = **75 coloured pills on one screen** |
| `/inquiries` | 2 of 11 | `PINNED` ×11 of 13, `clock stopped` ×10 of 13 |
| `/config/users` | 1 of 6 | `Not enrolled` ×8 of 8 |

This is `VISUAL_REVIEW` #14, and it is worse than that entry implies — it is the reason 11 columns
feel like 20. **Fix: collapse a column to a row-level annotation when its variance on the current
page is zero.** One rule in `<WorkQueue>` fixes every register at once.

### E2. The pill field

`/customers` puts three tone-carrying pills in every row. Colour is the product's scarcest signal —
lime means "needs a person". When 75 pills share the viewport, none of them means anything. The
same dot renders beside `1 waiting` and `119 waiting` on `/back-office`, so tone is decorating,
not signalling.

**Fix:** one pill per row carries the row's *state*; KYC and Consent become text with tone applied
to the word only when the value is exceptional.

### E3. The admin rail overflows and does not say so

The admin rail declares **26 destinations across 6 sections**. At 1440×900 the viewport cuts it at
`Commission` — mid-item — and the pinned account footer sits on top of the cut. **All twelve
Configuration items are invisible and there is no affordance that anything exists below.** A client
told the product is configurable cannot find Configuration.

**Fix — this is the IA change, not a scroll fix:** Configuration is not a peer of Inquiries. Move
the twelve config routes behind **one** rail item (`Settings`) opening a two-column index, exactly
as `/back-office` already does for its six queues. Admin rail: 26 → 15 items. The pattern already
exists in the build; it is simply not applied to the longest list.

### E4. Where progressive disclosure is already right

`/policies/:id` and `/customers/:id` put versions, schedule and consent on **tabs whose deep routes
are their addressable URLs**, and a cold landing paints the right tab on the first frame. That is
the correct pattern and it should not be reworked. Only two screens use tabs, which is the right
number — the answer to congestion here is not more tabs.

---

## F. Agentic AI audit

**This is the strongest part of the build and it is under-claimed.**

What exists: `/assistant` is the landing view for every role holding the grant. The opening turn is
a briefing computed from live queue counts ("10 open inquiries and 8 claims still open. 3 with no
owner yet and 7 past their turnaround"), with the breached inquiries listed and linked. Four request
kinds are tagged on the chips themselves (`ANALYSE`, `PRODUCE`). A **"What it will not do"** page is
one click from the header. The Assistant reads only `AssistantView` projections from
`src/data/assistant/`, as an allow-list, and `boundary.test.ts` walks the import graph and fails if
an entity type appears.

Input → reasoning → action → approval → result → audit, as built:

| Stage | Status |
|---|---|
| Input | Live queue counts, per signed-in user, scoped by `can()` | ✅ |
| Reasoning | Deterministic ask-cards + briefing rules, not a model | ✅ honest |
| System action | Automation runtime dispatches; every dispatch writes a `RecipeRun` | ✅ |
| Human approval | Outward sends stage in an outbox for a person to release; `<ConfirmGate>` on every outward mutation | ✅ |
| Result | Rendered in-thread with record links | ✅ |
| Audit trail | `/config/automation` traces each action to recipe + trigger (FR-21.5) | ✅ |

**The two real gaps:**

- **F1 · Nothing watches.** The proactive half is specified everywhere and wired nowhere: TAT
  breach, stalled quotation, ageing claim and bounced cheque each have thresholds written as
  constants and no subscriber. `bus.onAudit` is the only production listener in the tree. The
  Assistant can *answer* about a stalled lead; it cannot *raise* one. Build one `SlaRule` engine in
  the domain and the four consumers collapse onto it. **P1 — this is what makes "agentic" true.**
- **F2 · Thresholds are constants, not config.** FR-22 makes them L1 config per role;
  `queue-rules.ts` hardcodes them. **P2.**

---

## G. GMC audit — a decision, not a gap

**GMC (group medical / corporate employee cover) does not exist in this codebase, and it is not a
requirement of PRD v0.4.1.**

Verified both ways:

- `grep -i gmc` across `src/` and `documents/` returns **one** hit — a passing analogy in
  `PRD_DELTA_v0_4_1_engagement.md`. No organization, member-roster, dependent, eligibility,
  enrollment, group-plan or group-quotation entity exists.
- The PRD's only group vocabulary is **retail**: FR-09's *"Household/Group Head + members +
  relationships; floater member links"*, and FR-13's floater `member addition` endorsement. That is
  a family floater, not an employer scheme. There is no employer, no employee roster, no enrollment
  window, no eligibility rule, and no CD-account concept anywhere in 153 FRs.

So the brief's §11 asks me to audit a module against a PRD that does not contain it. **I have not
invented one.** Building GMC would mean a new entity cluster (Organization, EmployeeRoster,
Dependent, EligibilityRule, GroupPlan, EnrollmentWindow, CDAccount), a group quotation path, a
bulk-endorsement path for joiners/leavers, and a claims path that resolves a member through an
employer — a multi-week scope on its own, and it contradicts the PRD's §4 non-goals.

**The decision needed:** is GMC (a) out of scope, as the PRD says; (b) a post-MVP phase to be named
in the plan; or (c) a scope change requiring a PRD revision? Until that is answered, the honest
line in a walkthrough is: *"the platform models retail households and family floaters; corporate
group medical is not in this MVP."*

What **is** built and connected on the retail side of that vocabulary: household + members +
relationships, `Member.coveredUnderPolicyIds` and `Policy.memberIds` linked both ways with a
fixture test, floater member-addition endorsements, and the quotation header pulling persons/DOBs.
The gaps there are known: member changes are unattributed strings (`memberAdded`), and only 5 of
307 customers are seeded into a household.

---

## H. Recommended architecture — reuse, do not rebuild

| Do | To what | Why |
|---|---|---|
| **Reuse unchanged** | `<WorkQueue>` + `QueueConfig`, `<PageHeader>`, `<ConfirmGate>`, `<RecordOnlyAmount>`, `<OcrField>`, `<RollUp>`, `can()`, `useResource`, queue-url | The seams are right. Every fix below lands in one of these and propagates to 15 screens |
| **Extend** | `<WorkQueue>` — add zero-variance column collapse (E1) and a `defaultFilters` that is a *work* default, not an *all rows* default (D1) | One change fixes four registers |
| **Extend** | `QueueConfig` — a required `primaryAction` slot so a register cannot ship without a create path (B2/D4) | Makes the omission a compile error, not a review catch |
| **Refactor** | `navigation.ts` — fold 12 config items behind one `Settings` item with an index screen modelled on `BackOfficeHomeScreen` (E3) | Reuses a built pattern; 26 → 15 rail items |
| **Build once** | `src/domain/sla/` — one `SlaRule` engine; TAT, quotation stall, claim age and cheque bounce as its first four consumers (F1, B4) | Four backlog entries collapse into one module |
| **Move** | `PageHeader`, `ActionBar`, `SideRail`, `RoleSwitcher` from `components/AppShell/` to `src/ui/` per plan §6 | Already backlogged; do it while touching the rail |
| **Do not build** | GMC, a second dashboard, more tabs, any new page-specific table | See §G and §E4 |

---

## I. Prioritized implementation plan

### P0 — before anything else
1. **Make the gate trustworthy.** Cap `test.poolOptions.forks.maxForks` (3–4) in `vite.config.ts`.
   Evidence: `npm run check` → 3 failed / 2379 passed; `npx vitest run --maxWorkers=3` → green.
   The constitution's first ritual step is `/verify`; it currently cannot be believed.
2. **Fix `/policies` default state.** Default the queue to in-force policies (drafts have their own
   queue at `/back-office/drafts`), or sort issued-first. Reconcile the rail badge and the header
   count so one noun has one number.

### P1 — workflow and comprehension
3. `<WorkQueue>` zero-variance column collapse — fixes `/policies`, `/customers`, `/inquiries`,
   `/config/users` at once (E1).
4. Rail IA: 12 config items → one `Settings` item + index screen (E3).
5. `New customer` on `/customers`, reusing `CustomerQuickAdd` (B2/D4).
6. Reports copy: "five" → the catalogue's real count, in all three places incl. the test name (§C).
7. Assistant composer: reserve its height in the scroll region so it stops covering the feed (D5).
8. Back-office badge/heading reconciliation (D3).
9. `src/domain/sla/` + the four watchers — the change that makes the AI story true (F1).
10. Seed households across the customer fixture so FR-09 is visible (§C).

### P2 — consistency and polish
11. Pill discipline on `/customers`; tone by severity on `/back-office` (E2).
12. Filter-control clipping at 1440 (D7).
13. Action hierarchy on `/inquiries/:id` (D6).
14. Assistant thresholds → config (F2).
15. The remaining open items in `VISUAL_REVIEW.md` and the playbook Backlog.

### P3 — after the demo
16. FR-09.8 repeat purchase; commission on endorsement/renewal edges; consent `withdrawn`;
    multi-language; the GMC decision from §G.

---

## J. Final client journey — what the walkthrough should be

Fifteen minutes, in this order, because it follows the money rather than the nav:

1. **Sign in** → land on `/assistant`. It has already read the queue: *"10 open inquiries and 8
   claims still open. 3 with no owner yet and 7 past their turnaround."* Nobody clicked anything.
2. **"Where does the data come from?"** → Import from Excel. Four steps, a real `.xlsx`, failed rows
   handed back as a sheet to fix. This is the question that gets asked first and it has a real
   answer.
3. **`/inquiries`** → the unrouted alert names the one nobody owns. Open `INQ-1045`: breadcrumb,
   TAT badge, **"What happens next"**, the assignment trail. Show the machine refusing a move and
   saying why.
4. **Quote** → composer, benefit matrix, generate, share. The generated sheet is the only place
   Source Serif appears.
5. **Deal → policy entry** → schema-rendered form; drop an insurer PDF and show `<OcrField>` —
   nothing commits until a person confirms it.
6. **Money** → `<RecordOnlyAmount>`; Net = sum of components, Final = Net + GST, and **nothing else
   is ever computed**. Then `/commission`: three-level chain, computed shown beside booked, the
   difference named rather than reconciled.
7. **"Can an agent see another agent's book?"** → switch role in the rail footer. `visibility.ts`
   and its test.
8. **"What fires the reminder?"** → `/config/automation`, the run log, recipe + trigger per action.
   *Say the F1 gap out loud here.*
9. **"What does the customer see?"** → `/portal` from the Customer 360 header.
10. **Close on the honest list**: mock data, no BSP/SMTP, OCR modelled not integrated, no Gujarati,
    no GMC. Every one of those is already written down, which is itself the argument.

---

## What this audit deliberately does not do

- It does not re-litigate module depth — `PRD_GAP_ANALYSIS.md` §B is correct.
- It does not re-list the 26 visual defects — `VISUAL_REVIEW.md` holds them, most now fixed.
- It does not invent GMC.
- It does not recommend a rewrite. The seams in this build are better than the surface, and the
  right move is nine targeted changes at the surface, not a re-architecture.
