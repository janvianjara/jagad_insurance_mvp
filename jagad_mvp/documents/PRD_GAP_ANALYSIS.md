# PRD v0.4.1 → MVP — what is covered, and what is not

**Against** `PRD_Insurance_Agency_Platform_v0_4_1.docx` (21 modules, 153 feature-level FRs,
Appendix B) · **Build inspected** 2026-08-31, after the demo-readiness wave.

---

## How to read this

The previous revision of this file opened by saying `47 of 65` routes in `src/app/route-map.ts`
were built and the other 18 rendered a `PlannedScreen` stub — and that those stubs were the demo
risk, because a stub is what a walkthrough finds first.

**That is no longer true. 65 of 65 routes are built.** `AppShell.test.tsx` now asserts it as a
property rather than leaving it to be re-counted by hand: any route added to the map with no
screen behind it fails the suite.

So the shape of this document has changed. It is no longer "surfaces that do not exist" — that
column is empty. What is left is module depth, and the systemic constraints of a mock-data MVP,
which are deliberate and which decide what may honestly be claimed in the room.

Three kinds of entry, and they are not the same conversation:

- **A — Closed in this wave.** What was a gap and is now built.
- **B — Module depth.** The screen exists; a specific FR inside it does not.
- **C — Systemic.** No backend, no real vendors. Deliberate.

---

## A — Closed in this wave

| Area | PRD ref | What now exists |
|---|---|---|
| **Sign-in** | FR-01.5–.7, D17 | `/login` and `/login/2fa`. The 2FA **enforcement matrix in `/config/users` is now read**: a template that requires two-factor is sent to the challenge, one that does not goes straight in. `auth-isolation.test.ts` walks the import graph and fails if the shell, the session store or the permission evaluator appears in it — §11.1 as a chunk boundary, not a promise. |
| **Customer portal** | FR-09.5, D6 | `/portal` and its four pages, as a nested subtree under their own shell. `portal-isolation.test.ts` enforces the D-I separation; `portal-scoping.test.tsx` asserts one customer's file never renders another's. Includes the DPDP §12 **grievance intake** and the self-service claim raise of story 4.1. |
| **Excel / CSV import and export** | FR-02.4, FR-19.5, U9 | **New, and specified nowhere in the PRD.** See the section below — it was the single largest hole in the product relative to how an agency actually works. |
| **Automation runtime** | FR-21, D9 | `src/domain/automation/` (dispatch, ticks, cadence, ladder, lease, ledger, outbound) and `src/data/automation/` (runtime, actions, clock, outbox, recipients). Trigger → Condition → Action now dispatches, time-based recipes fire off a clock, and **every dispatch writes a `RecipeRun`** — which is FR-21.5, and the claim "every automated action traces to recipe + trigger" is now demonstrable on `/config/automation`. |
| **Row-level ABAC** | §11 | `src/domain/visibility.ts`. The previous revision called this "the one place where a scope leak is a money leak". An agent scoped `{ level: 'own' }` no longer sees the agency's whole commission book. |
| **Commission surfaces** | FR-14.3, .4, .5 | `/commission/ledger`, `/commission/payouts`, `/wallet`. The ledger shows **computed and booked entries as distinguishable things** and names the difference rather than picking one — see B below for why that honesty is required. |
| **Back-office queues** | FR-08.1 | `/back-office/issuance` and `/back-office/ocr-review` complete the six ops queues. |
| **Record depth** | FR-10, FR-20.1, D-A | `/policies/:id/versions`, `/policies/:id/schedule`, `/customers/:id/consent` — built as **tabs on the record**, not as orphan pages, so the deep path is that tab's address and a cold landing paints the right tab on the first frame. |
| **Registers and reporting** | FR-19.2, .4 | The report catalogue went from five to ten: portfolio register, premium calendar, endorsement register, pipeline and commission joined the original five. |
| **Global record search** | *not in the PRD* | See below. Also new, also unspecified. |
| **Assistant conversation** | FR-22 | `/assistant/:threadId` resumes a conversation. |

### The two things added that the PRD never asked for

Both came out of reading the workflow rather than the requirements list, and both are the kind of
absence a client notices in the first five minutes.

**1. Excel import and export.** The PRD mentions import/export only twice in passing (FR-02.4 for
master sets, FR-19.5 for report parameters), and the build had neither. But an agency does not
begin with an empty book: leads arrive as a spreadsheet from a campaign, an existing portfolio
arrives as a spreadsheet at migration, and an insurer's data arrives as a spreadsheet. **Import is
the front door, and there was no door.**

- `src/domain/dataport/` — CSV (RFC 4180) and **real `.xlsx`, with no new dependency**. An xlsx
  file is a ZIP of XML, so the writer builds the OOXML parts and stores them with CRC32, and the
  reader inflates with the platform's own `DecompressionStream('deflate-raw')`. Verified end to
  end: the bytes it emits are identified by `file(1)` as *Microsoft Excel 2007+* and read back
  byte-identical, including embedded commas, quotes, blanks and unicode.
- A four-step wizard: **file → map columns → check → commit.** Auto-mapping by header synonym;
  every required field that is still unmapped is called out; the Check step validates the whole
  file and offers the failed rows back as a sheet to fix and re-upload, which is the single most
  useful thing this screen does for a real agency. Commit is behind `<ConfirmGate>`.
- Export is a toolbar action on the queue, exporting **the view that is on screen** — current
  filters, current sort, visible columns — which is well defined precisely because URL owns list
  state.
- Import specs exist for customers, policies, inquiries, claims and master values.
- **Where a repository cannot write, the Check step says so on screen and Commit does not
  pretend.** An honest gap demos well; a fake write does not.

**2. Global record search.** The most frequent act on an agency desk — somebody rings with a name
or a number — had no single place to ask. Every repository already declared searchable fields, so
the capability existed and the front door did not. `src/features/search/` fans out across the
records the signed-in user may read, as an **allow-list** (a resource the user cannot view is
never queried, rather than queried and hidden). A name resolves to customers first and then to
their policies, because policy search is by number only — so "Patel" now finds Patel's policies.

---

## B — Module depth gaps

These are real and they are stated so nobody claims otherwise in a walkthrough.

### FR-02 Master Configuration
- **FR-02.2 in-field add** — a form still cannot create a master option inline; the user
  navigates to `/config/masters`. This is one of the client's own named requirements and appears
  in their acceptance criteria. Cascade, versioning and referential safety *are* built.

### FR-04 Companies
- **FR-04.6 company rating from claim experience + block-list** — the claim screen captures the
  company remark; nothing yet aggregates it into a rating or blocks a company on new proposals.

### FR-07 Agency Master & Agents
- **FR-07.6 delegated sub-agent creation** — the fields and the share cap exist and are enforced
  in `commissionShare.ts`, but no screen lets an agent create a sub-agent.
- **No `Broker` entity.** A broker-channel placement uses the broking agency's own id as the payer
  party. Correct arithmetic, wrong model.

### FR-09 Customer Management
- **FR-09.6 detail-change verification** — no `ChangeRequest` entity.
- **FR-09.8 repeat purchase with the original sub-agent auto-attached** — no code path.

### FR-10 / FR-13 Policy and Endorsement
- **The version diff has no before-and-after column.** No per-version field snapshot exists in §8,
  so the Versions tab lists *which* fields an endorsement changed and prints one honest line where
  the prior values would go. Inventing them was the only alternative.
- **Floater member changes stay unattributed** — `memberAdded` / `memberRemoved` are bare strings,
  so the record names the kind of change and not the row it touched.
- **FR-13.7's major-change guard** is still a self-declared boolean, not a comparison against the
  policy's current values.

### FR-14 Commission
- **No write API.** Chains are recomputed from configured percentages on every read. The ledger
  shows computed beside booked and **names the difference rather than reconciling it**, because
  reconciling without a write would be a number nobody could trace.
- **FR-14.8 endorsement delta** — `commissionChain` accepts and is tested against
  `endorsement.approved` and `renewal.completed`; the approve path still books no row.

### FR-20 Compliance
- **Consent withdrawal is recorded on the customer desk, not on the record.** `ConsentState` has
  no `withdrawn` member and `CustomerRepository` has no write for it, so the consent pill
  deliberately does **not** move and the screen says why in words. Closing it properly means
  adding `withdrawn` to `CONSENT_STATES`, an edge on `consentMachine`, and a `consent.withdrawn`
  event.
- **FR-17.3's skip log does not exist.** The consent tab names which channels a withdrawal
  suppresses and states plainly that individual suppressed sends are not yet logged.
- **FR-20.3 breach runbook with dual clocks** (CERT-In ≤6h / DPDP ≤72h) — no code.
- **Parental consent for minors** — no code.
- **FR-20.6 processor-contract registry** — no code.

### Multi-language
- **FR-11.8 and FR-17.4 (Gujarati / Hindi / English)** — absent. There is no language field and no
  multi-language content anywhere in the build. For a Gujarat agency this is a real gap, not a
  cosmetic one, and it should be said out loud rather than discovered.

---

## C — Systemic, and deliberate

State these plainly rather than letting a demo imply otherwise.

- **No backend, no persistence.** Mock repositories over fixtures. A refresh resets the book.
  Several repositories are read-only, which is why some screens state a gap instead of writing.
- **OCR is modelled, not integrated.** Extraction records, review states, per-insurer templates
  and the never-silent-commit rule are real and tested; the vendor is undecided and unwired.
- **WhatsApp / SMS / SMTP are configuration screens.** No BSP, no DLT, no SMTP. Every "sent" in
  the demo is a mock log line. The automation runtime's outbox stages outward sends for a person
  to release rather than firing them, which keeps the `<ConfirmGate>` rule intact.
- **Authentication is mocked.** `/login` is a real screen over a real permission model with no
  password check, and it says so on itself.
- **No mobile apps.** The sub-agent, on-field and customer paths are responsive web.
- **Excluded in every phase, carried from PRD §4:** premium rating, claim adjudication, mutual
  funds, insurer-portal / Bima Sugam APIs, historical migration, multi-tenant runtime.

---

## What a reviewer is most likely to probe

Ordered by what a walkthrough exposes first.

1. **"Where does the data come from?"** — Import. Answer it with the wizard and a real `.xlsx`.
2. **"Can an agent see another agent's commission?"** — No, and `src/domain/visibility.ts` has the
   test that says so.
3. **"What fires the reminder?"** — The recipe runtime, and the run log on `/config/automation`
   that traces each action to its recipe and trigger.
4. **"What does the customer see?"** — The portal, reachable from any Customer 360 header.
5. **"Is it in Gujarati?"** — No. Say so.
