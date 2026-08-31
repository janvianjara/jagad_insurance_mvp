# Claims module — architecture evaluation and workspace build specification

Reference: CLM-0412, CLM-0414, CLM-0417, CLM-0419 · FR-04.6, FR-11.1–.10, FR-16.8, FR-17.6,
D20/D21 · canvas flow 4 (n37–n50) · scenarios 4.1–4.8

Evaluated against the working tree at `e49b2c1`, not against a submitted audit text — the audit
report block arrived empty. Where a claim below contradicts the audit brief, the code is cited.

---

## 0. Correction to the brief's premise

The brief asks us to plan a build around "list views exist but detail workspaces remain to be
built" and "`/claims/:id` falling back to index". Neither holds:

| Brief says | Tree says |
|---|---|
| `/claims/:id` falls back to index | Routed at `src/app/router.tsx:134` to `ClaimDetailRoute` |
| Detail workspace remains to be built | `src/features/claims/ClaimDetailScreen.tsx`, 797 lines, with pipeline strip, machine-driven action bar, ConfirmGate on every edge, RecordOnlyAmount settlement entry, status-message log |
| 13-stage lifecycle to be validated | Already the machine: `CLAIM_STATES` in `src/domain/workflows/claim.ts`, 13 states, 8 guards, tested in `claim.test.ts`, `claim-rules.test.tsx`, `claim-scenarios.test.tsx` |
| Dead-policy guard to be specified | Built: `policyActiveForClaim` / `policyInactiveAndAgentNotified`, enforced before an id is drawn in `claimDesk.intimate` |
| Settlement closure gate to be defined | Built: `settlementTypedFromInsurerAdvice` + `claimCloseRequiresSettlementAndCompanyRemark` |

Planning Phase 1 as "build the claim detail workspace" would rebuild working, tested code. The
real frontier is narrower and sharper, and it is what the rest of this document specifies.

**What is genuinely absent**, verified by search across `src/`:

1. `/upload/:token` — declared in `src/app/route-map.ts:359` as phase P2 with **no owning step**.
   Nothing imports it, no screen exists. The one route in the app that FR-11.1, FR-16.8 and D21
   each name independently.
2. Any query record. `query_open` is a bare state flip; there is no query text, no language, no
   raised-on, no answered-on, nothing to loop over. Grep for `gujarati|hindi|language` across
   `src/domain` and `src/data/repo` returns nothing but a doc comment.
3. Any SLA / nudge / escalation engine, in claims or anywhere else.
4. Any outbound message infrastructure. `logStatusMessage` records where a message *would* have
   gone, in a `Desk` array that lives only for the session.
5. Cross-links off the claim. `ClaimDetailScreen` has exactly one `<Link>`, and it points at
   `/claims`.

---

## Section 1 — Architectural audit and build-frontier analysis

### 1.1 The 13-state vocabulary is sound; the fork is machine-enforced

The status set matches §9 and the canvas exactly, and the fork is not a UI convention — it is two
guards on the `picked_up` row of `CLAIM_TRANSITIONS`:

```
picked_up → upload_link_sent   guard claimTypeIsCashless
picked_up → checklist_raised   guard claimTypeIsFile
```

`pipelineFor()` returns two disjoint 8-element arrays, so the stage strip can never render a step
the machine would refuse, and `pipelineIndex()` folds `query_open` back onto `filed_with_insurer`
because §9 draws it as a loop, not a stage. That is the correct reading of FR-11.1 and it is
already right.

Three refusal messages are worth preserving verbatim in any refactor — they name the operational
consequence rather than the rule, which is the house style and the reason the guards read well in
scenario tests:

> "Blocking a claim notifies the sourcing agent in the same move. A claim that fails silently is
> how a customer finds out at the hospital desk."

### 1.2 Four lifecycle holes the 13-state set does not cover

**H1 — The cashless fork has no query loop. (FR-11.8, severity: high)**

`query_open` hangs off `filed_with_insurer` only, and `filed_with_insurer` is reachable only from
`docs_collected`, which is reachable only from `checklist_raised` — the file fork. A cashless claim
sitting in `tracked` that receives an insurer query has no state to move to. CLM-0412 is exactly
that claim. Today the desk would work it off-system.

Fix is two rows, not a redesign:

```ts
tracked: {
  query_open: { event: 'claim.query_opened', alsoEmits: ['message.sent'] },
  settlement_recorded: { /* unchanged */ },
},
query_open: {
  filed_with_insurer: { /* unchanged, file fork */ },
  tracked: { event: 'claim.status_changed', alsoEmits: ['message.sent'],
             note: 'The cashless arm of the query loop returns to tracking.' },
},
```

`pipelineIndex` then needs the fold to be fork-aware (`query_open` folds to `tracked` on cashless,
`filed_with_insurer` on file) or the strip will show a cashless claim at the wrong stage.

**H2 — `blocked` is a dead end. (Scenario 4.2, severity: high)**

`CLAIM_TRANSITIONS` has no `blocked:` source key. CLM-0414 — raised against lapsed `pol-4377`,
`ownerId: null` — enters `blocked` and can never leave it, even if the policy is reinstated inside
the grace window or the block was a data error. There is no reopen, no cancel, no re-intimate. In a
record-only MVP that means the row is permanently wrong with no correction path.

Minimum: `blocked → raised` on `claim.reopened`, guarded on the policy now reading active, with the
reason recorded. This is the one hole I would not ship P2 without.

**H3 — Repudiation is unmodelled. (FR-11.9, severity: medium)**

There is no `repudiated` or `rejected` state. A claim the insurer declines can only reach `closed`
through `settlement_recorded`, whose guard demands `isMoney(settlement.amount)`. `isMoney`
(`src/domain/money.ts:74`) accepts `paise: 0`, so a repudiation *can* be recorded as a zero
settlement with an advice reference — but nothing distinguishes "settled at nil" from "declined",
and the insurer rating in FR-04.6 is built from `companyRemark`, which would then carry the whole
signal as free text. Add `repudiated` as a state off both `tracked` and `filed_with_insurer`, or
add a `RepudiationReason` beside the settlement. Do not leave it to prose.

**H4 — Nothing distinguishes an aged claim from a fresh one. (severity: high, see 1.3)**

### 1.3 The stall risk is real; the routing risk is not

The brief's routing concern is stale, but the stall concern underneath it is correct and
unaddressed.

`claimPinRank()` in `claim-view.ts` sorts unowned work above owned work and `blocked` above
everything. That is a *sort*, and a sort is not an SLA. Nothing in the tree measures age, nothing
escalates, nothing creates a task, nothing notifies. CLM-0414 (`raised`, `ownerId: null`,
`raisedDaysAgo: 8` — the brief says 12, the fixture says 8) sits at the top of the queue and stays
there silently for as long as nobody scrolls.

This is a systemic gap, not a claims gap. The playbook already records the same shape twice:

- line 552: proactive-notice thresholds are constants in `queue-rules.ts`, FR-22 wants L1 config
- line 577: "nothing watches a stalled quotation … QTN-0331 shared-with-no-decision with no task,
  nudge or age threshold against either"

Claims is the third instance and the most expensive one, because the counterparty is a hospital
desk. Build the engine once, in `src/domain/` (see §3.3), and claims is its first consumer rather
than its owner.

---

## Section 2 — Technical specifications for the remaining build

### 2.1 Tokenised document upload engine (FR-11.1, FR-16.8, D21)

`/upload/:token` must be built the way `/consent/:token` was, because that page already solved the
hard part and the solution is structural rather than remembered.

**The isolation mechanic, reused verbatim.** `src/features/consent/routes.ts` holds
`lazy(() => import('./ConsentTokenScreen'))` and explains why: a dynamic import turns "must not
import the app shell, the permission store, or anything assuming a user" (§11.1, D21) into a chunk
boundary the bundler enforces. `consent-isolation.test.ts` then walks the module graph from the
screen and fails if the shell, session store or permission evaluator ever appears in it.

Upload gets the same three files:

```
src/features/upload/routes.ts              lazy route element, layout: 'bare'
src/features/upload/UploadTokenScreen.tsx  three states: live | expired | done
src/features/upload/upload-isolation.test.ts  copy of the consent graph walk
```

and `route-map.ts:359` gains `step: 'P-20a'`, `resource: null`, `layout: 'bare'` (already correct).

**The token.** Model it in `src/domain/workflows/uploadLink.ts` beside `kycConsent.ts`, whose
`ConsentLink` is the precedent (`{ token, expiresAt, carriesSession: false, grantsPortalAccess:
false }`):

```ts
export type UploadLink = {
  readonly token: string            // opaque, ≥128 bits, never derived from claimId
  readonly claimId: string
  readonly docTypes: readonly DocType[]   // what this link may accept, closed set
  readonly issuedAt: string
  readonly expiresAt: string
  readonly maxUploads: number       // per-token cap, default 10
  readonly usedUploads: number
  readonly attempts: number         // every GET, valid or not
  readonly revokedAt: string | null
  readonly carriesSession: false    // literal, as ConsentLink has it
  readonly grantsPortalAccess: false
}
```

Four guards, each returning the house `refuse(sentence)`:

| Guard | Refuses when | Sentence names |
|---|---|---|
| `linkNotExpired` | `now >= expiresAt` | the date it closed, and that a fresh one can be issued |
| `linkNotRevoked` | `revokedAt !== null` | that the desk withdrew it |
| `linkHasCapacity` | `usedUploads >= maxUploads` | how many were accepted |
| `linkNotRateLimited` | attempts exceed the window | that it will accept again shortly — never that it is blocked |

Rate limiting is per-token and per-window, held on the link record. The MVP has no server, so this
is enforced at the desk seam (`claimDesk` / a new `uploadDesk`) exactly as the consent desk enforces
expiry — the same posture, so the real API replaces the desk and nothing above it changes.

`getUploadLink(token)` must return an identical shape for an unknown token and an expired one. A
404 that differs from a 410 is a token oracle.

**Presence-only metadata, and why most of it already exists.** `DocumentRecord` in the fixtures is
already presence-only: `doc-clm-0412` carries `isPresent: false`, `fileName: null`, `fileUrl: null`,
`extractedText: null`, `ocrFields: []`, `retentionClass: 'claims'`, `reviewState: 'awaiting'`. An
upload flips presence and identity; it never stores content.

What an accepted upload writes, and nothing else:

```ts
{ isPresent: true, uploadedByName, fileName, mimeType, sizeBytes, submittedAt,
  reviewState: 'awaiting', retentionClass: 'claims',
  extractedText: null, ocrFields: [] }
```

DPDP posture, stated as invariants for the step's done-when:

- No diagnosis, ICD code, treating-doctor name, hospital name or bill line ever lands in a field.
  A discharge summary is a *presence*, a filename and a size.
- `retentionClass: 'claims'` is what a retention sweep reads. Set it at write time, never later.
- Aadhaar: not accepted by this link at all. `docTypes` is a closed set and must not contain an
  identity document — the KYC path has its own consented surface.
- The Assistant is an allow-list (`src/data/assistant/projection.ts`). Add **no** upload field to
  it. `boundary.test.ts` stays green by construction, and the step's done-when should say so
  explicitly so nobody adds `fileName` "for a nicer card".

**The desk edge.** `ClaimDeskRepository` gains three methods, following its own pattern of adding
exactly what the read-plus-`advance` repository lacks:

```ts
issueUploadLink(command: IssueUploadLinkCommand): Promise<MutationResult<UploadLink>>
uploadByToken(token: string, now: Date): Promise<UploadLink | null>
acceptUpload(command: AcceptUploadCommand): Promise<MutationResult<DocumentRecord>>
```

`picked_up → upload_link_sent` already exists in the machine and `ClaimDetailScreen:570` already
renders "Send the tokenised upload link … Link sent. It is login-free and it expires." Today that
receipt is not true — there is no link. Issuing one is the transition's side effect, and the
edge should not commit unless the link was issued.

**`upload_link_sent → summary_received` must stop being a manual button.** It is currently an
unguarded operator move. Guard it on `documentIds` containing a present document of the link's
`docTypes`, so the state means what it says.

### 2.2 Dead-policy guard and auto-intimation (FR-11.3, scenarios 4.1/4.2)

**The guard is built; one trust boundary is open.** `IntimateClaimCommand` takes `policyActive:
boolean` and `policyStatus: string` from the caller, with the comment "Read off the policy by the
screen. The machine, not this module, judges it." The machine judges the *value*; it cannot judge
whether the value is true. A caller that passes `policyActive: true` intimates a claim on a lapsed
policy and the guard applauds.

Close it inside `claimDesk.intimate`: re-read the policy through `repositories.policies`, derive
active/status there, and ignore the command's copy (or refuse on mismatch, which also catches a
stale screen). One repository read, and the guard becomes structural.

**Auto-intimation is unbuilt and has no substrate.** There is no message infrastructure anywhere —
the backlog records the same absence three times (P-15: `MessageLog`, `policy.feedback` template,
`TaskRepository.create`). Specify it as one recipe rather than a claims-local worker:

```ts
type IntimationRecipe = {
  trigger: 'claim.intimated'
  to:  { role: 'insurer', address: fromInsurerMaster(policy.insurerId) }
  cc:  [ { role: 'agent', id: claim.agentId } ]     // informed, never owner
  assignOwner: { pool: 'claims_team' }              // §9: the claims team owns it
  body: template('claim.intimated')                  // systemNo, policy no, member, date of loss
}
```

Two invariants from §9 that the recipe must encode and the test must assert: the sourcing agent is
**CC, not owner**, and ownership lands on a claims-team member. `buildClaim` currently defaults
`ownerId` to `USER_IDS.amit` for every seeded claim, which hides this — the assignment is a fixture
constant, not a rule.

Until a message repository exists, the honest MVP behaviour is the one the codebase already uses
elsewhere: render what *would* be sent, name the missing template, and write nothing. Do not stub a
send that claims to have sent.

### 2.3 Multi-language query loop (FR-11.8)

Nothing is modelled. `query_open` carries no payload; CLM-0417's query text is smuggled into
`companyRemark`, which is the settlement remark and feeds the insurer rating — two different facts
in one field.

```ts
export const QUERY_LANGUAGES = { en: 'en', gu: 'gu', hi: 'hi' } as const
export type QueryLanguage = (typeof QUERY_LANGUAGES)[keyof typeof QUERY_LANGUAGES]

export type ClaimQuery = {
  readonly id: string
  readonly claimId: string
  readonly round: number              // the loop runs several times; this counts it
  readonly raisedAt: string
  readonly insurerText: string        // as received, English, from the insurer
  readonly askedOf: 'customer' | 'agent' | 'hospital'
  readonly askedIn: QueryLanguage     // the language the customer was spoken to in
  readonly customerText: string | null
  readonly answeredAt: string | null
  readonly answeredBy: string | null
  readonly documentIds: readonly string[]
}
```

Three rules to encode:

1. `askedIn` defaults from the customer's preferred language, is overridable per query, and is
   **recorded** — the detail screen already promises this in prose ("answered in the language they
   were spoken to in", `ClaimDetailScreen:305`) while storing nothing.
2. `filed_with_insurer → query_open` requires a `ClaimQuery` with non-empty `insurerText`. An
   unexplained query_open is a state nobody can work.
3. `query_open → filed_with_insurer` (and `→ tracked`, per H1) requires `answeredAt` on the open
   round. The loop closes rounds; it does not overwrite one.

The claim's query history is then a list, and "how many rounds did this insurer take" becomes a
number — which is the second input FR-04.6 needs and currently cannot get.

### 2.4 Settlement closure gate and the FR-04.6 feed

The gate is built and correct. `settlementTypedFromInsurerAdvice` demands a typed `Money`, refuses
`source: 'derived'`, and demands an `insurerAdviceRef`; `claimCloseRequiresSettlementAndCompanyRemark`
demands both facts and names which is missing. `RecordOnlyAmount` carries the entry (D3 holds: no
default, no suggestion, no arithmetic — deduction is typed, not subtracted).

Two things the gate does not yet do:

- **Deduction breakdown.** `ClaimSettlement.deduction` is a single `Money`. FR-04.6 and the brief
  both want a breakdown (co-pay, non-payables, room-rent capping, deductible). Model it as typed
  components — `readonly deductions: readonly { head: DeductionHead; amount: Money }[]` — with the
  only permitted arithmetic being the sum, rendered through `<RollUp>` read-only, exactly as
  Net = sum-of-components already works elsewhere. The single `deduction` field becomes that sum.
- **The rating actually being fed.** `companyRemark` is stored and never read by anything.
  `grep insurerRating` across `src/` returns only comments. FR-04.6 needs an aggregate per insurer:
  claims closed, median days intimation→settlement, query rounds per claim, deduction ratio,
  remarks list. That is a read model over closed claims — `src/data/repo/` derivation, no new
  writes — and it is the payoff that makes the close gate worth its friction. Until it exists, the
  gate collects data for nobody.

---

## Section 3 — Cross-cutting framework

### 3.1 Agent direct-updates toggle (D20 / FR-17.6) — built, three gaps

The decision function is in the domain and used correctly:

```ts
export function routeStatusMessage(ctx: ClaimContext): StatusMessageRouting {
  if (ctx.agentDirectUpdates === false) return { to: 'agent', rerouteLogged: true }
  return { to: 'customer', rerouteLogged: false }
}
```

`planStatusMessage` adds the sentence and handles the case the toggle cannot — a claim with no
sourcing agent still messages the customer, because there is no toggle to be off. The detail screen
renders the plan *inside the ConfirmGate preview*, so the operator sees where the message will go
before committing. That is the right shape and matches D20.

Gaps:

1. **The log is session memory.** `desk.messages` is a plain array on a `WeakMap`-cached object.
   The nine seeded claims have no message history, so a claim that has visibly moved seven states
   shows "No status message has been sent from this screen yet." Collapses onto the `MessageLog`
   repository edge the backlog already tracks.
2. **Channel is unmodelled.** FR-17.6 says WhatsApp; `StatusMessageLogEntry` has `to` and a `note`
   and no channel. Add `channel: 'whatsapp' | 'sms' | 'email'` and record the fallback when the
   first fails, or the log cannot answer "did they get it".
3. **The toggle is read at render, not stored at send.** `planStatusMessage` recomputes from the
   agent's current `directUpdatesEnabled`. If the agent flips the toggle later, the history rewrites
   itself. Store the routing decision on the entry — `rerouteLogged` is already there; make it
   authoritative rather than recomputed.

### 3.2 Bi-directional audit spine

The data is present on every claim — `policyId`, `customerId`, `agentId`, `memberId` — and
`ClaimRepository` already exposes `forPolicy`, `forCustomer` and `inPeriod` (the endorsement
cancellation check at `endorsement-cancellation.test.tsx` uses it: END-0033 cancels POL-4402 and
CLM-0417 was raised against it). So the spine exists in the data layer and is missing only in the UI.

`ClaimDetailScreen` renders one `<Link>`, to `/claims`. The record panel shows facts as text.

Specify: the record panel's policy, customer and agent rows render through `<RecordId>` as links
to `/policies/:id`, `/customers/:id` and the agent's page; and each of those screens carries a
claims section back. Deal (`APP-`) and Inquiry (`INQ-`) are reached transitively through the policy
and customer, which is correct — a claim has no direct deal, and inventing `dealId` on `Claim` to
satisfy a four-hop chain would be a field with no source.

One caution: `Claim` has no `dealId` and should not gain one. The chain is
`CLM → POL → APP → INQ` plus `CLM → CUS`, and each hop must be a real foreign key.

### 3.3 SLA nudge engine (FR-21 / FR-15)

Build it once, in the domain, with claims as the first consumer. The shape the codebase is already
asking for, three times over:

```ts
export type SlaRule = {
  readonly key: string
  readonly entity: 'Claim' | 'Quotation' | 'Inquiry' | 'Task'
  readonly when: (row: unknown, now: Date) => boolean   // per-entity predicate
  readonly afterHours: number
  readonly escalateTo: 'owner' | 'supervisor' | 'pool'
  readonly emits: 'task.created' | 'notice.raised'
}
```

Claims rules for P2:

| Rule | Condition | Threshold | Escalates to |
|---|---|---|---|
| `claim.unassigned` | `state ∈ {raised, intimated}` and `ownerId === null` | 24h | claims pool supervisor |
| `claim.blocked_unworked` | `state === blocked`, no event since | 48h | sourcing agent, then supervisor |
| `claim.upload_link_cold` | `state === upload_link_sent`, no document present | 72h | owner, and re-issue offered |
| `claim.query_ageing` | `state === query_open`, open round unanswered | 48h | owner |

Thresholds are config rows, not constants — the playbook's line 552 records that constants were
already the wrong answer once. Firing emits `task.created`, which needs `TaskRepository.create`
(backlog, P-15). Until that lands, the engine can raise proactive notices, which the notice rail
already renders.

CLM-0414 trips `claim.unassigned` at 24h and has been sitting for 8 days. That is the acceptance
test.

---

## Section 4 — Roadmap and engineering user stories

Phases are re-scoped from the brief to the actual frontier. Playbook step ids continue the existing
series (last claimed: P-19a).

### Phase 1 — P-20a · The tokenised upload engine

`/upload/:token` screen and isolation test · `UploadLink` domain type and four guards · desk edges
`issueUploadLink` / `uploadByToken` / `acceptUpload` · presence-only write on `DocumentRecord` ·
`picked_up → upload_link_sent` issues a real link · `upload_link_sent → summary_received` guarded on
document presence · CLM-0412 walkable end to end.

*Done when:* `upload-isolation.test.ts` green; `boundary.test.ts` green with no new allow-list entry;
an expired and an unknown token render identically; scenario 4.3 walks from the queue to a present
document without a session.

### Phase 2 — P-20b · Lifecycle repair, dead-policy trust boundary, query loop

H1 (cashless query loop) · H2 (`blocked` reopen) · H3 (repudiation, state or reason — decide, do not
defer) · `intimate` re-reads the policy · `ClaimQuery` entity, three rules, seeded for CLM-0417 ·
query history on the detail screen.

*Done when:* CLM-0412 can take a query and return to `tracked`; CLM-0414 can be reopened on
reinstatement with the reason recorded; a `query_open` with no `ClaimQuery` is refused; scenarios
4.6/4.7 walk in Gujarati and the language is on the record.

### Phase 3 — P-20c · Closure gate, insurer rating, SLA engine, spine links

Deduction components + `<RollUp>` · insurer-rating read model feeding FR-04.6 · `SlaRule` engine in
the domain with the four claims rules · record-panel links to policy, customer, agent · claims
sections back on each · message-log channel and stored routing.

*Done when:* CLM-0414 raises an escalation at 24h in a scenario test; the insurer rating page shows
a figure derived from closed claims; every id on the claim detail is clickable and every target
links back.

---

### Story 1 — Tokenised upload link (Phase 1, highest priority)

**As** a customer standing at a hospital discharge desk,
**I want** to send my discharge summary from the link the agency messaged me,
**so that** my cashless claim moves without my downloading an app or remembering a password.

Acceptance criteria:

- `/upload/:token` renders without a session and without importing the app shell, the session store
  or the permission evaluator; `upload-isolation.test.ts` walks the module graph and fails otherwise.
- A live token shows the accepted document types for that claim and nothing about the claim beyond
  its system number.
- An expired, revoked, over-capacity or unknown token renders the same "this link is closed" page,
  with the closing date shown only when the token is genuinely expired.
- An accepted upload writes presence, filename, mime type, size, submitted-at and
  `retentionClass: 'claims'`. It writes no extracted text and no OCR fields.
- No field added by this story appears in `src/data/assistant/projection.ts`; `boundary.test.ts`
  stays green with no modification.
- Sending the link from `/claims/:id` issues a real `UploadLink`; the ConfirmGate receipt "Link
  sent. It is login-free and it expires." is true, and cancelling issues nothing.

### Story 2 — Reopen a blocked claim (Phase 2, highest correctness risk)

**As** a claims-desk operator,
**I want** to reopen a claim that was blocked on a policy since reinstated,
**so that** a customer is not permanently refused by a state the platform cannot leave.

Acceptance criteria:

- `blocked → raised` exists on `claim.reopened`, guarded on the policy reading active **at the time
  of reopening**, read from the policy repository rather than taken from the caller.
- Reopening requires a typed reason; the reason is on the event and rendered in the record timeline.
- Reopening on a still-inactive policy is refused with a sentence naming the policy's current status.
- The move goes through `<ConfirmGate>`; cancel writes nothing and issues no message.
- CLM-0414 is walkable: blocked → reinstate `pol-4377` → reopen → intimate, in a scenario test.

### Story 3 — Multi-language query loop (Phase 2)

**As** a claims-desk operator handling an insurer query,
**I want** the query, the language I asked the customer in, and their answer recorded per round,
**so that** the next person on the file knows what was asked, in what language, and what came back.

Acceptance criteria:

- `ClaimQuery` records round, insurer text, who was asked, `askedIn` (en/gu/hi), customer text,
  answered-at and answered-by.
- `askedIn` defaults from the customer's preferred language and is overridable at the point of asking.
- `filed_with_insurer → query_open` and `tracked → query_open` are refused without a query carrying
  non-empty insurer text.
- Returning from `query_open` is refused while the open round is unanswered; it closes that round
  rather than overwriting it.
- The detail screen lists every round with its language; CLM-0417's seeded query appears there and
  is removed from `companyRemark`.
- Query text is claim-operational data and reaches no Assistant projection.

### Story 4 — SLA escalation on unassigned claims (Phase 3)

**As** a claims supervisor,
**I want** a claim that is raised or intimated and unassigned past the configured threshold to
escalate to me by itself,
**so that** an ageing claim is found by the system rather than by the customer phoning to ask.

Acceptance criteria:

- `SlaRule` lives in `src/domain/`, is entity-agnostic, and imports no React.
- Thresholds are config rows read through `ConfigRepository`, not constants in a feature module.
- `claim.unassigned` fires on `state ∈ {raised, intimated} ∧ ownerId === null` past threshold and
  escalates to the claims pool supervisor.
- Firing emits `task.created` where a task repository write exists, and raises a proactive notice
  otherwise. It never silently does nothing.
- Escalation is idempotent: a rule that has fired for a row does not re-fire until the row changes.
- CLM-0414 escalates in a scenario test at the 24h threshold; a claim assigned within the window
  does not.

---

## Appendix — Backlog lines for the playbook

```
- [ ] (found in claims audit CLM-0412) the cashless fork has no query loop: `query_open` hangs off
  `filed_with_insurer` only, so a cashless claim in `tracked` that receives an insurer query has no
  state to move to — two transition rows plus a fork-aware `pipelineIndex` fold — belongs to P-20b | P2
- [ ] (found in claims audit CLM-0414) `blocked` has no outgoing transition, so a claim blocked on a
  lapsed policy is permanently stuck even after reinstatement — belongs to P-20b | P2
- [ ] (found in claims audit) `IntimateClaimCommand` takes `policyActive` from the caller, so the
  dead-policy guard judges a value the desk never verifies; re-read the policy in
  `claimDesk.intimate` — belongs to P-20b | P2
- [ ] (found in claims audit CLM-0417) the insurer query is stored in `companyRemark`, which is the
  settlement remark feeding the insurer rating — two facts in one field, no language, no rounds —
  belongs to P-20b | P2
- [ ] (found in claims audit) `companyRemark` is collected by the close gate and read by nothing;
  FR-04.6's insurer rating has no read model — belongs to P-20c | P2
- [ ] (found in claims audit) `ClaimDetailScreen` renders one link, to `/claims`; policy, customer
  and agent are text, though `Claim` carries all three foreign keys — belongs to P-20c | P2
- [ ] (found in claims audit) `desk.messages` is session memory, has no channel field, and
  recomputes routing at render, so message history rewrites itself when an agent flips the
  direct-updates toggle — collapses onto the `MessageLog` repository edge — belongs to P1 | P1
- [ ] (found in claims audit) repudiation is unmodelled; a declined claim can only close as a zero
  settlement, indistinguishable from settled-at-nil — belongs to P-20b | P2
```
