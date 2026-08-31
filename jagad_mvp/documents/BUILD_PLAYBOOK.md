# Jagad MVP — Build Playbook

How to drive Claude Code through the M0 build **fast and accurately**. The canonical spec is
`IMPLEMENTATION_PLAN.md` in this folder (cited below as §). This file is **machine-readable**: every
step is written as instructions to Claude, so your prompt for each step is one line.

**Do not paste step specs into the chat.** Commit this file, then each session tells Claude to read the
step from the repo. Zero transcription loss, and the spec is versioned.

---

## 0. Before you start (once)

- [ ] **Write access works** — proven: you pushed `dca68d4`. Run the build in your local Claude Code
      inside this repo (the remote review session is read-only; it cannot push commits).
- [ ] **Node 20+** (`node -v`), npm 10+.
- [ ] **Jagad logo** → `jagad_mvp/src/assets/brand/logo.svg` (SVG preferred, else transparent PNG @3×).
      Plan §1 flags this as the one missing input. P-01 warns and falls back to a wordmark if absent.
- [ ] Commit this playbook:
      `git add jagad_mvp/documents/BUILD_PLAYBOOK.md && git commit -m "docs: build playbook" && git push`
- [ ] Open Claude Code at the **repo root** and run P-00.

---

## 1. The method — why this is fast AND accurate

| # | Lever | What it means |
|---|---|---|
| 1 | **Constitution in CLAUDE.md** | P-00 creates it (Appendix A). It auto-loads into every session: compiler traps (no `enum`, `import type`, compiler-on = no manual memo), product invariants (record-only money, OCR review, ConfirmGate, projection boundary, no emoji, no hex outside tokens). No prompt ever repeats them; no session ever forgets them. |
| 2 | **Self-executing playbook** | Specs live in-repo where Claude reads them verbatim. Your prompt is one line. What Claude builds is what the file says, not what survived a paste. |
| 3 | **One step = one session = one commit** | Small blast radius, resumable from any point, reviewable history. Never let a session sprawl past its step. |
| 4 | **Gates, not vibes** | `/verify` (build + lint + tests + boundary + token check) must be green before any step is "done". The three guardrail components land with refusal tests BEFORE the screens that use them. |
| 5 | **Domain before UI** | §9 machines, Money, `can()` are pure TypeScript, tested headless in P-02/P-03. Half the logic risk retired before one pixel exists. |
| 6 | **Pattern once, then configure** | `WorkQueue` (P-08) and `SchemaForm` (P-12) are built once; the 15 queue screens and every entry form after that are configuration, not code. This is the single biggest speed lever. |
| 7 | **Plan mode only where it pays** | Three hard steps — SchemaForm (P-12), Composer (P-13), commission chain (P-16) — start in plan mode. Everything else runs direct; plan mode on mechanical steps is pure overhead. |
| 8 | **Fixtures are the demo** | The story cast (Rakesh Patel, Jayesh Kapadia, …) is the prototype's cast. Every screen renders the walkthrough Vivek has already seen. |
| 9 | **Fresh context per step** | `/clear` between steps. Continuity lives in CLAUDE.md + this file + git history, not in chat scrollback. |
| 10 | **Parallel tracks after the shell** | Once P-08 lands, P-09 / P-10 / P-11 / P-12 are independent — run them in parallel sessions or worktrees if more than one person (or agent) is building. |

## 2. Operating ritual

**The prompt** (same shape every step — copy, change the step id):

> Read jagad_mvp/documents/BUILD_PLAYBOOK.md and execute step **P-07** exactly. Work only that step's
> scope. Stop when its done-when gates pass, run /verify, then commit with the step's commit message
> and push.

For the three plan-mode steps, prepend: *"Enter plan mode first and show me the plan before writing
any code."*

**Session rules**

1. Session starts with `/verify`. Red base → fix or report before building anything.
2. One step per session. Discover something outside scope → append one line to §5 Backlog, move on.
3. Done-when gates + `/verify` green → commit with the step's message → push → `/clear`.
4. Gates still red after **2 focused fix attempts** → stop, summarize the cause, do not commit.
   (Matches the 1%-human-in-loop posture: escalate cleanly instead of thrashing.)
5. Never skip, disable or quarantine a failing test to get green.

## 3. Step index

| Step | Builds | Depends | Mode | Plan § |
|---|---|---|---|---|
| P-00 | Toolchain, gates, CLAUDE.md, skills | — | direct | §1 |
| P-01 | Design tokens, fonts, icon sprite, gallery | P-00 | direct | §2 |
| P-02 | Domain core: dataClass, Money, ids, events, `can()` | P-00 | direct | §7, §8, §14.1 |
| P-03 | All workflow machines + guards + tests | P-02 | direct | §9 |
| P-04 | Repositories, mock adapter, fixtures | P-02 | direct | §7, §8 |
| P-05 | AssistantView projection + boundary test | P-02, P-04 | direct | §14.1 |
| P-06a | UI primitives: form, type, signal | P-01 | direct | §6 |
| P-06b | UI primitives: DataTable, surfaces, Drawer | P-01 | direct | §6 |
| P-07 | Guardrails: RecordOnlyAmount, OcrField, ConfirmGate | P-06a | direct | §6 |
| P-08 | AppShell, nav, guards, WorkQueue, stores | P-04, P-06b | direct | §3, §4, §6, §7 |
| P-09 | Assistant landing: briefing, chips, blocks, notices | P-05, P-08 | direct | §3, §14 |
| P-10a | Config: users, templates, masters, 2FA matrix | P-08 | direct | §4, §5 |
| P-10b | Config: companies, products, benefits, agencies, agents | P-10a | direct | §4, §5 |
| P-11 | Inquiry module end to end | P-03, P-08 | direct | §5, §9 |
| P-12 | SchemaForm renderer + seed schemas | P-04, P-06a | **plan** | §6, §9 |
| P-13 | Quotation Composer + BenefitMatrix + Deal | P-07, P-10b | **plan** | §5, §9 |
| P-14 | Customer 360, KYC, consent token page | P-08, P-12 | direct | §5, §9, §11.1 |
| P-15 | Policy entry, premium roll-up, issuance | P-12, P-13, P-14 | direct | §5, §9 |
| P-16 | Commission chain + read-only view | P-15 | **plan** | §9 |
| P-17 | Scenario smoke tests, demo script, M0 tag | all | direct | §11.2 |
| P-18a | Spec delta: inquiry engagement layer | P-17 | direct | §5, §8, §9 |
| P-18b | Activity, disposition, next-action mandate | P-18a | direct | §9 |
| P-18c | Master-driven stages, attempts, dormancy | P-18b | direct | §9 |
| P-18d | Requirement capture | P-18c, P-12 | direct | §5, §9 |
| P-18e | Inbound activities, pipeline, next-action KPI | P-18d | direct | §5 |

Parallel after P-08: `{P-09} · {P-10a→P-10b} · {P-11} · {P-12}` are independent tracks.

---

## 4. Steps

### P-00 — Bootstrap & constitution
Depends: — · Plan: §1

Instructions to Claude:
1. In `jagad_mvp/`: delete the Vite starter surface — `src/App.tsx` contents, `src/App.css`,
   `src/assets/react.svg`, `src/assets/hero.png`, `public/icons.svg` demo symbols. Keep configs.
2. Install runtime deps: `react-router` (v7), `zustand`, `@tanstack/react-table`, `react-hook-form`,
   `zod`, `date-fns`. Dev deps: `vitest`, `jsdom`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`, `eslint-plugin-import`.
   Read each library's installed major version before using its API — do not assume from memory.
3. Configure vitest (jsdom env, `src/test/setup.ts` with jest-dom) inside `vite.config.ts`.
   Scripts: `"test": "vitest run"`, `"check": "npm run build && npm run lint && npm run test && node scripts/check-tokens.mjs"`.
4. `scripts/check-tokens.mjs`: fail (exit 1, listing offenders) if any hex color literal appears in
   `src/**` outside `src/styles/tokens.css`.
5. ESLint: add `eslint-plugin-import` with `import/no-restricted-paths` zones — `src/ui` may not
   import from `src/features`, `src/components`, `src/domain`, `src/data`; `src/domain` and
   `src/data` may not import `react` or anything from `src/ui|components|features|app`.
6. Create `CLAUDE.md` at the **repo root** with EXACTLY the content of Appendix A below.
7. Create `.claude/skills/verify/SKILL.md` and `.claude/skills/new-module/SKILL.md` with EXACTLY the
   contents of Appendix B.
8. Minimal `src/App.tsx` (renders "Jagad Insurance — MVP") + one trivial passing test so every gate
   runs.
Done when: fresh `npm ci && npm run check` is fully green.
Commit: `chore: bootstrap toolchain, gates and Claude constitution`

### P-01 — Design tokens & visual ground
Depends: P-00 · Plan: §2

1. `src/styles/tokens.css` — the ONLY file with hex: brand (`--jag-green #14683B`, `--jag-green-2`,
   `--jag-lime #A6CB3A`, `--jag-navy #1C2C6B`, `--jag-navy-2`, `--jag-blue #4C7FC4`), semantic
   (`--ok --warn #B8801C --bad #B03A31 --info --idle --attn`), green-biased neutrals (ground, surface,
   sunken, border, hair, ink/ink2/ink3), spacing `--sp-1..10` on 4px, radius 4/6/8/12, 3 shadows,
   2 motion durations, type stacks. `[data-density="compact"]` overrides row-height/font/pad tokens.
   Light theme only for MVP; structure tokens so a dark block can be added later without renames.
2. `reset.css`, `base.css` (focus-visible ring uses `--jag-lime`, scrollbars, selection).
3. `index.html`: title "Jagad Insurance", Google Fonts — IBM Plex Sans (400/500/600/700), IBM Plex
   Mono (400/500/600), Source Serif 4 (600/700) — with real fallback stacks; swap favicon to a brand
   mark derived from the logo.
4. Icon sprite `src/assets/icons.svg` + `<Icon name>` component: port the ~21 icon geometries from
   `documents/jagad-ai-prototype (8).html` (`ICON` + `EXTRA_ICONS` objects). SVG only — no emoji.
5. `<BrandMark>` from `src/assets/brand/logo.svg`; if the asset is missing, render a wordmark
   fallback and print a console warning naming the expected path.
6. Dev-only `/dev/gallery` route (guard `import.meta.env.DEV`): swatches with token names, type
   scale, spacing scale, both densities side by side.
Done when: gallery renders; `check:tokens` green; fonts load with fallbacks declared.
Commit: `feat(styles): Jagad token system, fonts, icon sprite, dev gallery`

### P-02 — Domain core
Depends: P-00 · Plan: §7, §8, §14.1 · No React imports anywhere in this step.

1. `src/domain/dataclass.ts`: `type DataClass = 'operational'|'contact'|'sensitive'|'document-content'`;
   `FIELD_CLASSES` registry — per entity, every field name → DataClass. Seed with Customer, Member,
   Policy, Document, Inquiry, Quotation, Deal (extend in later steps as entities are added; adding a
   field without classifying it must be a type error).
2. `src/domain/money.ts`: branded `Money` = integer paise + currency; `money(rupees, paise?)`,
   `addMoney`, `sumMoney`, `formatINR` (edge only). Constructing from float throws. Tests.
3. `src/domain/ids.ts`: dual numbering — `nextSystemNo(prefix)` for INQ/QTN/APP/POL/CLM/END/TSK with
   zero-padded sequence from an injectable counter (deterministic under test).
4. `src/domain/events.ts`: typed event-name union matching the plan's FR contracts
   (`inquiry.created`, `inquiry.unconfirmed`, `quotation.won`, `deal.created`, `kyc.completed`,
   `policy.issued`, `claim.raised`, `claim.status_changed`, `renewal.due`, `mandate.failed`,
   `cheque.bounced`, `endorsement.approved`, …); tiny synchronous dispatcher with `emit`/`on` and an
   audit-sink subscriber hook.
5. `src/domain/permissions.ts`: `PermissionTemplate`, `AbacScope` (own/team/all + company/category/
   sub-agent-ownership), `can(user, action, resource, record?)`, `canSeeClass(user, dataClass)`.
   Tests: sub-agent cross-record denial, team scope, admin breadth, sensitive-class masking.
Done when: vitest green; eslint layer zones prove domain imports no React.
Commit: `feat(domain): data classes, Money, dual numbering, events, permissions`

### P-03 — Workflow machines
Depends: P-02 · Plan: §9 — every bullet under every machine becomes a named test.

1. `src/domain/workflows/` — one module per machine, each exporting
   `const STATES = {...} as const`, `type State`, a `TRANSITIONS` adjacency map,
   `canTransition(from, to, ctx)` and guard functions. NO `enum` (erasableSyntaxOnly).
   Machines: inquiry, quotation, deal, policy, kycConsent, collection, claim, renewalTask,
   noticeBatch, premiumSchedule/instalment/mandate (D-A), endorsement.
2. Guards encode §9 exactly — examples that MUST exist as tests: reassignment stays in category
   group; escalation carries history; zero-line-item deal blocked; issue gated on KYC + Final
   Premium; unmatched notice cannot bulk-send; claim close needs settlement + company remark;
   cancellation refund-eligibility check; instalment amount never derived from annual; grace days
   come from schedule mode; sub-agent share cap enforcement.
3. Transitions emit the P-02 event names.
Done when: every §9 guard bullet has a named passing test; illegal transitions rejected.
Commit: `feat(domain): workflow state machines with §9 guards`

### P-04 — Repositories & fixtures
Depends: P-02 · Plan: §7 (data layer), §8 (fixture strategy)

1. `src/data/repo/`: interfaces per cluster — customers, inquiries, quotations, deals, policies,
   companies, products, benefits, agencies, agents, tasks, documents (metadata), commission, config
   (masters/users/templates). All async, Promise-returning.
2. `src/data/mock/`: in-memory store hydrated from fixtures; 150–400 ms simulated latency; mutations
   run through the P-03 machines and emit events. Components NEVER import fixtures — repository only.
3. `src/data/fixtures/`:
   - Config seed: 8 insurers (HDFC Ergo, Niva Bupa, Bajaj Allianz, ICICI Lombard, Tata AIG,
     IFFCO Tokio, Royal Sundaram, LIC), ~24 products, ~40 benefit items + policy→benefit maps,
     4 agencies (2 Individual, 2 Broker) with per company×policy %, 6 staff users matching §3's
     role table, agent Kiran Solanki + a sub-agent under him.
   - Story cast (~35 records) from the prototype: Rakesh Patel (household, health floater, cashless
     claim CLM-0412 seeded for P2), Jayesh Kapadia (monthly schedule + bounced mandate),
     Nilesh Bhatt, Bhavesh Trivedi, Falguni Shah, drafts POL-DRAFT-0219/0224/0230, inquiries
     INQ-1036/1041/1042/1044. Every M0 scenario row must be walkable on these records.
   - Volume: seeded PRNG generator — ~300 customers, ~500 policies, ~800 tasks; same seed → same ids.
4. `src/lib/useResource.ts` (load/error/reload) — TanStack Query NOT added in MVP; keep the seam.
5. Zod fixture-integrity test + determinism test.
Done when: integrity + determinism tests green.
Commit: `feat(data): repositories, mock adapter, story-cast and volume fixtures`

### P-05 — AssistantView projection + boundary test
Depends: P-02, P-04 · Plan: §14.1 — this is FR-22.13/.14/.15 made real.

1. `src/data/assistant/projection.ts`: `ASSISTANT_ALLOW` — per entity, an explicit **allow-list**
   (never a deny-list) of field names; builders map entity → `AssistantView<T>`; Document maps to
   metadata only (type, dates, states — no content, no extracted text).
2. Assistant repo facade returning projections only; eslint zone: `src/features/assistant` may
   import types from `src/data/assistant` but not entity types from `src/domain` or `src/data/repo`.
3. `boundary.test.ts`: for EVERY entity in `FIELD_CLASSES`, assert
   `ASSISTANT_ALLOW[entity] ∩ (sensitive ∪ document-content) = ∅`; assert the masked-Aadhaar last-4
   field is also excluded; include a red-team case proving the test fails when a sensitive field is
   added to an allow-list.
Done when: boundary test green and demonstrably capable of failing.
Commit: `feat(data): Assistant operational-data projection with CI boundary test`

### P-06a — UI primitives: form, type, signal
Depends: P-01 · Plan: §6 tables · All styling via tokens; CSS Modules.

Form: Field, Label, Input, NumberInput, Select, Combobox, CascadeSelect, DatePicker, Textarea,
Checkbox, RadioGroup, Toggle, FileDrop, FormRow, FormSection, FieldError.
Type: Money, DateTime, RelativeTime, RecordId (system + insurer side by side), MaskedValue,
TruncatedText, KeyValueList — mono face + `tabular-nums` where numeric.
Signal: StatusPill, StatusStripe (hot/warm/cool/good mapped to --bad/--warn/--info/--ok, plus
--attn), Badge, CountChip, Clock (TAT / grace / aging modes off `date-fns`), Tag.
Gallery pages per group. RTL smoke tests for interactive ones.
Commit: `feat(ui): form, type and signal primitives`

### P-06b — UI primitives: data & surfaces
Depends: P-01 · Plan: §3 shell behaviors, §6

DataTable on @tanstack/react-table: sort, row selection, column visibility, sticky header,
density-aware row height, keyboard row navigation. TableToolbar, Pagination, SelectionBar,
EmptyState (teaches, per U13), Skeleton, StatCard.
Surfaces: Card, Panel, Modal, Popover, Tooltip, Tabs, Accordion, Toast/Toaster, and **Drawer** with
the prototype's exact behaviors — resizable 340–560px, max-toggle, Esc closes (Esc un-maxes first).
Gallery + tests (Drawer resize/Esc, table selection).
Commit: `feat(ui): DataTable and surface primitives with resizable drawer`

### P-07 — Guardrail components (tests FIRST)
Depends: P-06a · Plan: §6 — write the refusal tests red, then implement to green.

1. `<RecordOnlyAmount>`: "Type the figure" affordance; its props API contains NO computed/default
   value path. `<RollUp>` renders Net = Σ components and Final = Net + GST as read-only derived
   text, visually distinct. Tests: renders empty, accepts typed Money, has no auto-fill API.
2. `<OcrField>`: extracted (lime flag + confidence) / confirmed / edited (original kept);
   `OcrFormProvider` blocks submit while any field is unconfirmed. Tests for all three states +
   the submit block.
3. `<ConfirmGate>`: key/value preview of the intended change → Cancel / Confirm; Cancel invokes
   nothing and writes nothing; Confirm emits mutation then swaps to a done receipt. Tests both paths.
Commit: `feat(components): guardrails — RecordOnlyAmount, OcrField, ConfirmGate`

### P-08 — AppShell, navigation, WorkQueue
Depends: P-04, P-06b · Plan: §3, §4, §6, §7

1. Zustand slices: session (user, role, resolved permissions, density), drawer, toasts.
2. `app/navigation.ts`: typed nav config for all roles from §3's table (Assistant FIRST in every
   role — D-G), each item carrying its permission key + live count selector (reads repositories).
3. `app/router.tsx`: EVERY M0 route from §4 registered — unbuilt ones lazy-load a
   `<PlannedScreen step="P-xx">` stub so navigation is complete from day one. Role guards via
   `can()`; `/` redirects to `/assistant`.
4. `<AppShell>`: 240px rail (brand, sectioned nav with counts, role switcher footer), main
   (PageHeader, ActionBar), right Drawer outlet. `data-density` on `<html>`. Cmd/Ctrl-K opens the
   (stub) Assistant drawer.
5. `<WorkQueue>` composite: one implementation configured per module — `{ columns, filters,
   stripeMapping, bulkActions, rowTarget: drawer|route }` — URL owns filter/sort/page/selection.
Done when: switch through all roles; nav renders per permissions; counts live; stubs everywhere.
Commit: `feat(app): shell, role navigation, guarded router, WorkQueue`

### P-09 — Assistant landing shell
Depends: P-05, P-08 · Plan: §3 (D-G design), §14 FR-22.1/.2-Ask/.3/.8

1. `/assistant` = landing per role: opening turn is a GENERATED queue briefing from live counts via
   the projection facade (per-role template; never a blank prompt, never a greeting).
2. Block renderer for the prototype vocabulary subset: para, rows (severity stripe), table, kv,
   note. (act/choice/file/stop arrive with the features that need them.)
3. Suggestion chips per role → Ask cards implemented as projection queries over the user's own
   queue (my leads / unassigned / TAT at risk / my drafts / due this week).
4. Proactive notices v0: threshold rules over fixtures (TAT < 3h, claim aged > 30d, mandate failed)
   → feed entry labeled "noticed just now" WITH its reason line + mirrored `<NotificationRail>` on
   queue screens. Dismiss + dedupe.
5. Cmd/Ctrl-K drawer carries current record id as context. Free-text input deferred (P3) — the
   input row can exist but routes to chips.
6. Boundary: this feature imports ONLY `data/assistant` (eslint-enforced).
Done when: each role lands on a truthful briefing; every notice states why it fired; boundary green.
Commit: `feat(assistant): role landing briefing, Ask cards, proactive notices`

### P-10a — Configuration I: users, masters
Depends: P-08 · Plan: §4, §5 config rows; FR-01, FR-02

`/config/users`: user CRUD, permission-template editor (clone-and-edit starter library), ABAC scope
rules, 2FA enforcement matrix (record-only in MVP). `/config/masters`: master types + values CRUD,
versioning, cascade (Make→Model), deactivate-not-delete when in use, and the shared
`<InlineMasterAdd>` used later by every form (FR-02.2).
Tests: template assignment changes visible nav; in-use master deletion blocked.
Commit: `feat(config): users, permission templates, masters with inline add`

### P-10b — Configuration II: market & channel
Depends: P-10a · Plan: §5; FR-04/05/06.4/07 acceptance criteria as tests

`/config/companies` (per line — HDFC Life ≠ HDFC General; contacts per category),
`/config/products` (+ per-product doc checklist), `/config/benefits` (catalog: label, field type,
options, default, section, order), policy→benefit map editor on the product screen,
`/config/agencies` (Agency Master: auto-code, **Individual locks to exactly one company — guard +
test**, Broker multi; company-type filter; per-agency policy multi-select scope; commission % per
company×policy), `/config/agents` (agent %, delegated sub-agent grant, share cap, direct-updates
toggle).
Tests: Individual second-company blocked; scope filters placement options; cap blocks over-share.
Commit: `feat(config): companies, products, benefit catalog, agency master, agents`

### P-11 — Inquiry module
Depends: P-03, P-08 · Plan: §5 row 1–2, §9 inquiry machine; canvas scenarios 1.1–1.6 as RTL tests

WorkQueue config (unassigned + TAT-at-risk pinned, bulk assign); `/inquiries/new` (minimal capture:
name + mobile suffices, source, sub-agent link); detail: `<AssignmentTrail>`, TAT `<Clock>` (duration
from config, not constant), confirm/accept, auto-reassign + escalate per machine, unrouted queue for
admin; convert→quotation CTA. Dev-only clock-advance control to demo TAT lapse live.
Done when: scenario tests 1.1–1.6 green; timeline shows every event.
Commit: `feat(inquiries): capture, routing, TAT chain, escalation`

### P-12 — SchemaForm renderer  [PLAN MODE]
Depends: P-04, P-06a · Plan: §6 SchemaForm row, §9 · The portability heart — worth the plan pass.

1. `src/domain/forms/`: FormSchema types — stages, field defs (text/number/date/select/cascade/
   file/computed-rollup/repeating group), conditional visibility rules, reserved (non-removable)
   system fields, schema version.
2. `<SchemaForm>`: multi-step with branching on values; zod schema generated from the definition;
   keyboard-first (tab order, enter-to-next); draft-save to localStorage keyed by entity id with a
   missing-field summary; records pin `schemaVersion` and historical records render against their
   creation-time schema.
3. Seed schemas as fixtures: Health policy, Motor policy, LI policy (mode, PPT, riders, cashflow
   repeating group), inquiry, KYC.
Tests: branch rendering, draft resume after "timeout", reserved-field immutability, version pinning.
Commit: `feat(forms): schema-driven form engine with drafts and versioning`

### P-13 — Quotation Composer → Deal  [PLAN MODE]
Depends: P-07, P-10b (P-11 for the convert entry point) · Plan: §5 Composer row, §9 quotation
machine; canvas scenarios 2.1–2.9 as tests. The client's headline change (D18).

1. `/quotations/new`: select/create customer → pick 1–N company/policy columns.
2. `<BenefitMatrix>`: rows = union of mapped benefits, defaults pre-filled, per-cell entry, ad-hoc
   row inline (this quotation only — catalog untouched), premium-mode choice row (Annual/Half-yearly/
   Quarterly/Monthly — D-A, informational), **Final Payable Premium per column via
   `<RecordOnlyAmount>` — generate is blocked until every column has a typed figure.**
3. Generate: quotation document model → `<DocumentViewer>` letterhead render (Source Serif 4),
   single vs side-by-side; header pulls persons/DOBs/floater from the customer; auto-share config
   fork honored (ON → send + log via mock; OFF → manual share action); upload path as fallback.
4. Versions: revise requires reason, prior versions immutable + viewable; Lost requires reason;
   Won → Deal (APP-…, line items) → `/deals/:id`; zero-line-item deal blocked.
Done when: scenarios 2.1–2.9 green; the premium stop is demonstrably un-fillable by the system.
Commit: `feat(quotations): composer, benefit matrix, versions, won-lost, deal`

### P-14 — Customer 360, KYC, consent link
Depends: P-08, P-12 · Plan: §5, §9 KYC machine, §11.1; scenarios 3.1–3.2

1. `/customers` + 360: household/members/relationships, policies, document metadata, transactions,
   change requests, consent state, full `<RecordTimeline>` from the event log (U14).
2. KYC queue + detail: per-product doc checklist, `<OcrField>` mock-extraction review flow, Aadhaar
   via `<MaskedValue>` — last-4 max, an assertion test that no full number ever renders.
3. Consent link: token issue (expiring) from KYC screen; **`/consent/:token` as a separate Vite
   entry chunk** — no AppShell, no session store import (§11.1) — mobile-first page where the
   customer self-fills sensitive fields + consent; submit updates KYC; expired token page.
4. KYC completion fires the credentials recipe automatically → message log + toast.
Commit: `feat(customers): 360, KYC with OCR review, tokenised consent page`

### P-15 — Policy entry & issuance
Depends: P-12, P-13, P-14 · Plan: §5, §9 deal→policy machine; scenarios 3.3–3.7

`/policies/new?dealId=` pre-populates line items; SchemaForm by product type; **placement
scope-filter**: selecting the agency filters company/product options to its scope (FR-07.4);
premium block: per-type components each via `<RecordOnlyAmount>`, `<RollUp>` shows Net and
Final = Net + GST (Final compulsory to issue, components optional); payment fork (direct-to-company
reference vs agency collection record; cheque → bounce-watch task); direct-entry path (no proposal);
issuance: upload policy PDF → mock OCR into `<OcrField>` review → confirm → dual numbers stored →
**POLICY LIVE** → `policy.issued` event → customer message log + feedback stub; draft-save surfaces
in back-office drafts queue with missing-field indicator.
Done when: scenarios 3.3–3.7 green; issue blocked without KYC or Final Premium.
Commit: `feat(policies): deal-fed entry, record-only premium, issuance to live`

### P-16 — Commission chain  [PLAN MODE]
Depends: P-15 · Plan: §9 commission machine · Money precision matters — plan pass earns its keep.

`src/domain/commission.ts`: on `policy.issued` (later `renewal.completed`, `endorsement.approved`)
compute the chain — payer (company on own code | broker channel) → agency % (per company×policy from
the Agency record) → agent % → sub-agent share carved from the agent's cut with cap enforcement —
producing `LedgerEntry` rows at every level, all integer-paise `Money`. `/commission`: **read-only**
view — per-policy chain expansion + booked totals by channel.
Tests: cap blocks over-share; no cap = free within agent's %; Individual-lock respected; paise
reconciliation (chain parts sum exactly, no float drift); broker is payer never payee.
Commit: `feat(commission): three-level chain calculation and read-only ledger view`

### P-17 — Scenario harness, demo, M0 tag
Depends: all · Plan: §11.2 M0 definition

1. Route-level smoke tests for every M0-relevant canvas scenario row (1.x, 2.x, 3.x, admin-config
   rows) that isn't already covered — one named test per row id.
2. `documents/DEMO_SCRIPT.md`: the golden path click-by-click on the story cast (login → Assistant
   briefing → configure → inquiry → TAT → Composer → Won → KYC → consent → policy → LIVE →
   commission), ready to run for Vivek.
3. Polish pass — **layout and visual quality, not only the checklist**. The checklist below is
   the floor, not the scope: a screen can pass every item on it and still look wrong, and this
   build has already proved that (the nav rail clipped its own footer and hid the role switcher
   on every screen at 900px, while lint, tokens and 1191 tests were all green — no automated
   gate in this repo could have caught it, and none ever will).
   - **Drive the running app and look at every built screen.** Screenshot each one, at
     1440x900 and at a narrow width, in both densities. Judge composition, rhythm, alignment,
     hierarchy, empty space, table legibility and whether the eye lands on the thing that
     matters. List defects. **When profiling or driving Chrome on an Apple Silicon machine,
     launch it via `arch -arm64`** — `node` here is x64, so Playwright's `channel: 'chrome'`
     runs the x86_64 slice under Rosetta and every timing you take will be roughly 6x wrong.
   - **The Assistant landing is its own design task.** D-G makes it the first thing every role
     sees and the product's front door; §3 says it opens with a generated queue briefing and
     never a blank prompt or a greeting. It carries the most product meaning per pixel of any
     screen here and should be designed, not merely assembled from primitives.
   - Then the floor: every list has loading, empty and error states; focus visible everywhere;
     labels on all inputs; no emoji anywhere; `check:tokens` still clean.
4. Tag `v0.1.0-m0`.
Done when: full `/verify` + scenario suite green from a clean clone; demo script walks end to end.
Commit: `test: M0 scenario harness and demo script — golden path complete`

---

### P-18a — Spec delta: the inquiry engagement layer
Depends: P-17 · Plan: §5 front office, §8 entity set, §9 inquiry engagement

The PRD models the artifact and not the process around it: §8.15 is titled "Task & Activity Engine"
but FR-15 owns only `Task, WorkQueue`, and §9.1 ends at the TAT fork while §9.2 opens with the
customer and candidate policies already chosen. The discovery conversation — the call, what was
said, when to speak next — falls in the seam.
Write it down before building it: §8's entity set gains Activity, RequirementRecord, Disposition and
InquiryStage; §9 gains the engagement stage model; §5 gains three screens;
`documents/PRD_DELTA_v0_4_1_engagement.md` carries FR-06.12–.19, the disposition matrix, the revised
§9.1 narrative and the next-action KPI for client sign-off.
Done when: the delta doc stands on its own for a reader who has not seen this thread.
Commit: `docs(spec): inquiry engagement layer — activity, disposition, next-action mandate`

### P-18b — Activity, disposition, next-action mandate
Depends: P-18a · Plan: §9 inquiry engagement · FR-06.13, .14, .15

`src/data/repo/activities.ts`: `Activity` — polymorphic subject like `Task`, channel, direction,
occurredAt, actor, dispositionKey, notes, nextTaskId, attemptNo. `ActivityRepository` is
`forSubject` / `list` / `log` and **nothing else** — append-only is the type, not a convention.
`Disposition` config record + seeded matrix; `TaskRepository.create` lands here (existing Backlog
line) because the next action *is* a Task. `src/domain/workflows/nextAction.ts` holds the one rule
that makes this a CRM rather than a list: **an open inquiry may not be saved without a dated next
action or a terminal outcome.** `Activity.notes` is `document-content` — a call note on a health
inquiry carries a diagnosis — and every other field is operational, which is exactly what lets the
Assistant answer "not touched in 10 days" without reading what was said.
Log-activity is outward (it notifies and schedules) so it goes behind `<ConfirmGate>`.
Tests: the mandate refuses and writes nothing; callback creates the task and the reminder; the
timeline merges activities with the assignment trail; the boundary test stays green.
Commit: `feat(inquiries): activity log, disposition matrix and the next-action mandate`

### P-18c — Master-driven stages, attempts, dormancy
Depends: P-18b · Plan: §9 inquiry engagement · FR-06.12, .17

`InquiryStage` config rows carry `allowedFromKeys`, `requiresNextAction`, `countsAsOpen`, `terminal`
— stages are configuration, and the lifecycle machine is untouched. The compiler no longer proves a
stage move is legal, so the proof moves to `src/domain/workflows/inquiryStage.ts`: one pure tested
place returning the same allow/refuse-with-a-sentence shape every machine returns. Inquiry gains
`stageKey`, `stageEnteredAt`, `contactAttempts`, `lastActivityAt`, `nextActionAt`. Dormancy is the
`inquiry.dormancy` recipe's parameters, never a constant, read the way the TAT already is. A dormant
lead recycles — Lost must not be its only exit or the win-back list is destroyed.
Tests: a move outside `allowedFromKeys` refuses in the module's words; a stage move on a
non-accepted inquiry refuses; three no-answers reach dormant, not Lost.
Commit: `feat(inquiries): master-driven stages, attempt tracking and dormancy`

### P-18d — Requirement capture
Depends: P-18c, P-12 · Plan: §5 requirement capture row · FR-06.16

Requirement schemas per category through the existing `defineFormSchema` — no new renderer. Members,
DOBs, budget band, existing cover, urgency, port-in; pinned to `schemaVersion` like every other
record. Classification is the careful part: DOBs `contact`, any health declaration `sensitive`,
free text `document-content`. The values feed `/quotations/new?inquiry=` — this is the input §9.2
step 4 has been assuming the agent already had.
Tests: branch rendering per category; a captured requirement pre-fills the Composer header.
Commit: `feat(inquiries): requirement capture feeding the quotation composer`

### P-18e — Inbound activities, pipeline, the honest KPI
Depends: P-18d · Plan: §5 pipeline row · FR-06.18, .19

Inbound replies become activities with `direction: 'inbound'` linked to the `MessageLog` thread; no
live channel exists, so this ships as a logged action plus a seeded inbound activity — an honest
stub naming the gap, the pattern this build already uses for collections and templates, never a fake
integration. `REPORT_KEYS.pipeline`: by stage, count, median age in stage, conversion to the next.
Beside it the KPI that replaces a vanity number — **% of open inquiries with a dated next action** —
on the report and on the sales-manager briefing. Assistant ask-cards for stalled and untouched leads.
Done when: the pipeline report reconciles against a direct repository read; the boundary test proves
`notes` is absent from the projection.
Commit: `feat(inquiries): inbound activities, pipeline report and the next-action KPI`

---

### P-19a — Derived customer state (audit CUS-0251, Gap 1)
Depends: P-14, P-15 · Plan: §9 KYC · FR-09.3, FR-20.4 · audit CUS-0251

`kycState` was a column on `Customer`, written by whoever called `advanceKyc`, while the checklist a
screen drew came from the document vault - two sources of truth on one screen, so a header could
read "KYC complete" above a checklist showing nothing on file and neither half was wrong. Worse,
`everyRequiredDocumentPresent` compared `ctx.requiredDocuments` against `ctx.presentDocuments`, both
supplied by the caller, so the guard checked that the caller's own claim was internally consistent
and never read the ledger; `requiredDocuments: []` satisfied it vacuously.

`src/domain/derive/customerState.ts` computes the file from what is actually on it: requirements
resolved against vault presence and desk receipts, rejection and expiry and supersession all
decaying the state because it is recomputed rather than remembered, and an unconfigured checklist
reading as an open question rather than an empty one. The mock adapter builds the facts from its own
tables, so a screen can no longer assert completeness. The badge names what is missing instead of
asserting a state, and a live policy held against an incomplete file raises an integrity alarm on
the compliance desk - not a customer-facing nudge.

Done when: a customer with no documents cannot reach `complete` by any path; a complete file falls
back to `partial` when one document is rejected, with no transition invoked; an empty checklist
never completes; `kycState` appears in no `apply` anywhere in `src/`.
Commit: `fix(customers): derive the KYC file instead of storing what someone claimed`

---

### P-20a — The tokenised upload engine (audit CLM-0412)
Depends: P-14, P-19a · Plan: §5 page inventory, §11.1 · FR-11.1, FR-16.8, D21 · audit CLM-0412

`/upload/:token` sat in `route-map.ts` as a declared P2 row with no owning step and no screen, while
`ClaimDetailScreen` already promised "Link sent. It is login-free and it expires." on the
`picked_up -> upload_link_sent` edge. Nothing was sent and no link existed, so the receipt was a
sentence rather than a fact. `upload_link_sent -> summary_received` was likewise an unguarded
operator move: a desk could mark the discharge summary received while the link was still empty.

`src/domain/workflows/uploadLink.ts` holds the rule half - what a link is, when it stops working,
and that a claim link may never collect an identity document, since a photographed Aadhaar at a
hospital desk is the full number the constitution forbids everywhere. `src/features/upload/` holds
the page, reached only through `lazy()` so the chunk boundary is the bundler's rather than a promise,
with `upload-isolation.test.ts` walking the module graph the way the consent page's does. The desk
records presence and never content: name, type and size off the `File`, never its bytes, and
`extractedText` and `ocrFields` stay empty by construction. An unknown token, an expired one and a
withdrawn one render identically, because the difference between them is what a guesser is looking
for.

`dischargeSummaryReceived` now reads the ledger, and `presentDocTypes` is threaded through
`ClaimTransitionCommand` so the screen's `canTransition` and the write ask the same question.

Done when: the isolation walk is green and the Assistant boundary test is unchanged; an expired and
an unknown token are indistinguishable in the DOM; a document accepted through the link records
presence with no extracted text; canvas 4.5 walks customer-side upload to desk-side record.
Commit: `feat(claims): the tokenised upload link, and a state that stops lying about the file`

---

## 5. Backlog / discoveries

Sessions append one line here instead of widening their step. Format:
`- [ ] (found in P-xx) description — belongs to P-yy | P1 | P2`

- [ ] (found in claims audit CLM-0412) the cashless fork has no query loop: `query_open` hangs off `filed_with_insurer` only, so a cashless claim in `tracked` that receives an insurer query has no state to move to - two transition rows plus a fork-aware `pipelineIndex` fold - belongs to P-20b | P2
- [ ] (found in claims audit CLM-0414) `blocked` has no outgoing transition, so a claim blocked on a lapsed policy is permanently stuck even after reinstatement, with no reopen and no correction path - belongs to P-20b | P2
- [ ] (found in claims audit) `IntimateClaimCommand` takes `policyActive` from the caller, so the dead-policy guard judges a value the desk never verifies; re-read the policy inside `claimDesk.intimate` - belongs to P-20b | P2
- [ ] (found in claims audit CLM-0417) the insurer query is stored in `companyRemark`, which is the settlement remark feeding the insurer rating - two facts in one field, no language, no rounds - belongs to P-20b | P2
- [ ] (found in claims audit) repudiation is unmodelled; a declined claim can only close as a zero settlement, indistinguishable from settled-at-nil - belongs to P-20b | P2
- [ ] (found in claims audit) `companyRemark` is collected by the close gate and read by nothing; FR-04.6's insurer rating has no read model, so the gate's friction currently buys no data - belongs to P-20c | P2
- [ ] (found in claims audit) `ClaimDetailScreen` renders one link, to `/claims`; policy, customer and agent are text though `Claim` carries all three foreign keys - belongs to P-20c | P2
- [ ] (found in claims audit) nothing watches an ageing claim: CLM-0414 is `raised` and unassigned for 8 days with no task, nudge or threshold. Same shape as the P-09 proactive-notice and quotation-stall entries - build one `SlaRule` engine in the domain, claims as first consumer - belongs to P-20c | P2
- [ ] (found in P-20a) `desk.messages` in `claim-desk.ts` is session memory, has no channel field, and recomputes routing at render, so message history rewrites itself when an agent flips the direct-updates toggle - collapses onto the `MessageLog` repository edge - belongs to P1 | P1
- [ ] (found in P-20a) the upload ledger lives in a feature desk because `DocumentRepository` is read-only, so `presentDocTypes` is a command field rather than something the store derives; it collapses to a store-side read when documents gain a write API - belongs to orchestrator integration | P1

- [ ] (found in FR-08.3/08.4 work) `<BulkActionGate>` passes `confirmTitle` to BOTH the `Modal` title and the `<ConfirmGate>` title, so every bulk action in the product renders its sentence twice in the DOM. Harmless visually inside the dialog chrome, but it makes any test that queries the title ambiguous and reads as a stutter to a screen reader — drop it from one of the two — belongs to P-17 polish | P1
- [ ] (found in FR-08.3 work) `<WorkQueue>`'s `board()` equivalent on `/back-office` reads its six depths with no ABAC predicate, so a sub-agent sees the agency's whole 131. Either scope the six reads or say on the page that the board is agency-wide; it currently implies the former while doing the latter — belongs to P1 | P1
- [ ] (found in FR-08.4 work) `CONSENT_CADENCE.resendAfterDays` and `quietHours` in `src/features/kyc/chase-rules.ts` are written down but unread: there is no scheduler in the MVP, so only `maxAttempts` is enforced (by the bulk action). FR-21's cadence should read the same constant rather than a second copy — belongs to P1 | P1
- [ ] (found in P-06a/b) chevron, close, sort and maximise marks are drawn in CSS in `Glyph.tsx` and `controls.module.css`; the sprite gained that geometry at wave integration — swap them to `<Icon>` — belongs to P-06b polish | P1
- [ ] (found in P-06a) `cx()` class-joiner is duplicated once per ui group; fold into a shared `src/ui/lib` when one exists — belongs to P-06b polish | P1
- [ ] (found in P-06b) `Card.module.css` and `StatCard.module.css` still repeat the six status branches; compose the shared `src/ui/tones.module.css` class instead — belongs to P-06b polish | P1
- [ ] (found in P-06b) `Sparkline` is listed in plan §6's Data group but is in no step's scope — belongs to P-17 polish | P1
- [x] (found in P-06b) `rowPaginationFeature` and filtering are deliberately unregistered on DataTable because URL owns page and filter state; confirm this holds when `<WorkQueue>` lands — belongs to P-08 | M0
      **RESOLVED in P-08: confirmed it holds; a test mounts at a URL and asserts rows, count, ticked row and filter control all match a direct repository read.**
- [x] (found in P-07) plan §6's UI primitive table lists no `Button` in any group, so 21 files hand-roll `<button>`; add one to the Nav/action group and collapse them onto it — belongs to P-08 | M0
      **RESOLVED in P-08: `src/ui/Button` exists (navy primary, quiet, danger; no green variant). The 21 pre-existing hand-rolled sites are NOT yet collapsed onto it - that part remains, as P-17 polish.**
- [x] (found in P-04) field classification is split across two registries: `FIELD_CLASSES` (domain, 7 M0 entities) and `DATA_FIELD_CLASSES` (`src/data/repo/classification.ts`, 36 data-layer entities). Folding the second into the first is NOT possible — it carries 13 type imports from `src/data/repo`, so the move would invert the domain/data dependency. The union is therefore unified at the Assistant boundary test instead (P-05), which is the one place allowed to import both — belongs to P-05 | M0
      **RESOLVED in P-05: the union is unified in `boundary.test.ts`, which carries a deliberately incomplete domain-only checker and proves it misses eight data-registry leaks the real audit catches.**
- [ ] (found in P-04) `RECORD_PREFIXES` has no customer or document prefix; fixtures format `CUS-0001` / `DOC-0001` locally via `localNo` in `src/data/fixtures/ids.ts` — belongs to P-14 | P1
- [ ] (found in P-13) one CSS-level assertion is missing: `?raw` on a `.css` file cannot work while `vite.config.ts` sets `test.css: false`, because the `vitest:css-disable` plugin rewrites the `?raw` id first. Fix is one line in `vite.config.ts` (`css: { include: [/\.module\.css\?raw/] }`). Verified by hand meanwhile: `--font-doc` is declared exactly once, on `.letterhead`; DOM-level proofs are green - belongs to P-17 | M0
- [ ] (found in P-13) `benefitRows` sits on the quotation header rather than per version, so a revision that REMOVES a row would not be reflected in the prior version's stored rows. Fine on today's fixtures; needs versioning before a real revision path - belongs to P1 | P1
- [ ] (found in P-13) the quotation upload path records a file reference in screen state and does not create a `DocumentRecord`; a work-in-progress benefit matrix likewise lives in screen state because `compose` is a one-shot edge. Both need a repository edge - belongs to P1 | P1
- [ ] (found in perf work) **the earlier 8-10s cold-load figure was a measurement artefact, not an app defect.** `node` on this machine is x64 on Apple Silicon, so Playwright's `channel: 'chrome'` launched the x86_64 Chrome slice under Rosetta 2 and V8's JIT ran ~6x slow. Always drive Chrome via `arch -arm64` when profiling here. True cold load was 2.7s; after the font fix it is 0.7-1.5s across routes - belongs to nobody, recorded so it is not rediscovered | M0
- [ ] (found in perf work) ~1.0s of the remaining cold load is four SERIALISED rounds of the section 8 simulated latency: shell waits for session, screen waits for its context, then WorkQueue queries. Correct-by-design but worth collapsing to two rounds if a list ever needs to be faster - belongs to P1 | P1
- [x] (found across waves) the suite is timeout-sensitive under parallel load: 12-21 failures at the default 5s timeout, 1281/1283 at 25s. Raise the default `testTimeout` in `vite.config.ts` or make the slow scenario tests cheaper - a suite that fails differently by machine load is a suite nobody trusts - belongs to P-17 | M0
      **RESOLVED: `asyncUtilTimeout` raised in `src/test/setup.ts` and `testTimeout`/`hookTimeout` in `vite.config.ts`. Full suite went from 12-21 varying failures to 1304/1304.**
      **RECURS at the raised 30s timeout (found in FR-13 endorsement review).** On an 8-core / 8 GB machine a 7-file scoped run failed a DIFFERENT test each time, always by `Test timed out in 30000ms` and never by a failed assertion: two in `endorsement-reshape.test.tsx` on one run, one in `endorsement-approval.test.tsx` on the next (311/312). `endorsement-approval.test.tsx` then passed alone, 2/2 in 49.5s wall with 17.66s in tests. The trigger is memory, not the timeout value: vitest's default fork pool sizes to core count, and jsdom plus the React Compiler babel transform put node RSS at ~1.4 GB against ~57 MB free, so workers swap. Raising the timeout again treats the symptom; cap `test.poolOptions.forks.maxForks` (3-4 on an 8 GB box) or set `test.fileParallelism: false` for the scenario files. Until then a green local run is not evidence and a red one is not a defect - belongs to P-17 | M0
- [x] (found in visual review) **Cold direct load of a queue screen takes 8-10s to usable on the PRODUCTION build.** Measured with CDP: of ~8.8s wall, ~7.5s is TaskDuration (3.6s script, 1.0s layout, 0.8s recalc-style) and only ~1.3s is idle - so this is NOT the 150-400ms simulated latency, it is real work. Fixture build is 22ms and store hydration 23ms, so it is not data generation either. Profile is dominated by `(program)` (parse/compile) plus GC with no single hot app frame, consistent with bundle parse plus a large amount of React work on boot. Warm in-app navigation settles in ~2.2s. Charter U12 budgets a list at under 2s - belongs to P-17 | M0
      **SUPERSEDED: the 8-10s figure was a Rosetta measurement artefact (see the entry below). Real cold load was 2.7s; the font-blocking fix in `index.html` brought it to 0.7-1.5s, inside the U12 budget.**
- [x] (found in visual review) `src/features/config/products/benefit-map.test.tsx > takes a benefit off the sheet only once the change is confirmed` fails intermittently under full-suite parallel load at ~5.1s while passing in isolation. A timeout flake, not a logic fault, but a flaky gate is a gate nobody trusts - belongs to P-17 | M0
      **RESOLVED by the timeout fix above; full suite is green and stable.**
- [x] (found in P-11) `InquiryRepository` has no `create` - the data layer is read plus transitions only, so `/inquiries/new` writes through a documented decorator at `src/features/inquiries/data/intake.ts`. When a write API lands it collapses to a delegate with no screen changes - belongs to orchestrator integration | M0
      **RESOLVED: the create API landed on five repositories; `intake.ts` collapsed from 437 lines to 55 with no screen changes.**
- [ ] (found in P-10a) `ConfigRepository` is read-only, so config edits live in a feature Zustand slice; master cascade (`parentTypeId`/`parentValueId`) and versioning are feature-layer extensions for the same reason. Fold both into the repo records with the write API - belongs to orchestrator integration | M0
- [ ] (found in P-09) proactive-notice thresholds are constants in `queue-rules.ts`; FR-22 makes them L1 config per role - belongs to P1 | P1
- [ ] (found in P-09) FR-22.11 audit attribution and FR-22.12 transcript retention are in no M0 step - belongs to P1 | P1
- [ ] (found in P-08/P-09/P-11) `PageHeader`, `ActionBar`, `SideRail`, `NavSection`, `NavItem` and `RoleSwitcher` live in `src/components/AppShell/` but plan section 6 lists them as `src/ui` Nav primitives; move them - belongs to P-17 polish | P1
- [ ] (found in P-12) the six seed schemas live in `src/domain/forms/seeds/` but are NOT stored fixture rows: `FormFieldDef` in `src/data/repo/config.ts` has a 7-value `kind` union with no `cascade`/`rollup`/`group` and a narrow `visibleWhen`, and `src/data/fixtures/schema.ts` derives its validator from it. The domain `FormSchema` is a strict superset that stored rows already satisfy (compiler-proven), so the fix is for repo/config to re-export the domain type rather than widen field-by-field. Consumers work today via `resolveFormSchema`, which serves stored and seeded schemas from one catalogue — belongs to orchestrator integration, before P-15 | M0
- [ ] (found in P-15) `CollectionRepository` has `record`/`verify`/`markBounced`/`close` but no `create`, so a collection can only be recorded against a row that already exists in the fixtures. The payment fork on `/policies/:id` therefore renders two honest empty states (`data-empty="collections"` and `data-empty="pending"`) naming the gap rather than inventing a create path. Canvas 3.3 and 3.4 are walked on `col-0002` for that reason - belongs to orchestrator integration | P1
- [ ] (found in P-15) `TaskRepository` has no `create` and the `cheque.bounced` edge emits `task.created` without writing a row, so the §9 follow-up is held on the policy desk (`BounceFollowUp`). It is real and asserted, but nothing surfaces it in the FR-15 task queue. Same shape as the `MessageLog` gap: both collapse to repository edges the day those repositories gain a write API - belongs to P1 | P1
- [ ] (found in P-15) fixtures configure a `policy.issued` message template but no `policy.feedback` one, so the issuance feedback stub renders an honest "no template is configured" line rather than claiming a request went out. FR-19 needs the template before the stub becomes a send - belongs to P1 | P1
- [ ] (found in P-15) `<IssuancePanel>` does not re-hydrate extraction verdicts recorded in an earlier session from `dossier.reviews` - it shows the current session's confirmations - and it holds its own copy of the record after a write rather than re-reading. Both are one-line changes now that `/policies/:id` owns the re-read - belongs to P-17 polish | P1
- [ ] (found in P-15) the customer picker on `/policies/new` with no `?dealId=` is a `<Select>` over every customer; at volume-fixture scale that wants the `<Combobox>` primitive - belongs to P-17 polish | P1
- [ ] (found in P-15) `/policies/:id` has no `<RecordTimeline>`: the event log is not reachable through the `Repositories` interface, and the customer feature reconstructs its timeline in `customerDesk` from record timestamps. §5's Policy detail row does not ask for a timeline, so this is a gap by omission rather than a miss - fold it in when `events(subject)` lands on the repositories - belongs to P1 | P1
- [ ] (found in P-16) `CommissionRepository` has no write API, so `/commission` computes each chain from the configured percentages on every read rather than reading booked rows; the three seeded `commission_booked` entries are shown beside the computed pay-in and deliberately never reconciled against it. When a write API lands, `commissionChain`'s `entries` are exactly what gets persisted and the screen reads them instead - belongs to orchestrator integration | P1
- [ ] (found in P-16) there is no broker master, so a broker-channel placement uses the broking agency's own id as the payer party in `payerFor`. The chain already takes the payer as an input rather than inferring it, so a real `Broker` entity replaces two lines in `commission-desk.ts` and nothing else - belongs to P1 | P1
- [ ] (found in P-16) `renewal.completed` and `endorsement.approved` are triggers `commissionChain` accepts and is tested against (the reversal case nets to zero exactly), but nothing calls it on those edges because neither machine has a screen yet. §9's delta hook is a call site, not new arithmetic - belongs to P2 | P2
- [ ] (found in P-16) no screen in the build applies §11's row-level ABAC scope - `RequireAccess` gates the route, not the rows - and `/commission` is the first screen where that matters in money terms: an agent's grant is `{ level: 'own', includeSubAgents: true }`, but the ledger view shows the whole book. A shared `visibleTo(user, rows)` on the desk layer covers every queue at once - belongs to P1 | P1
- [ ] (found in P-18b) the load flake is back and the earlier fix has been outgrown: the suite has gone from 1304 tests to 1690, and a default full run fails 1-4 tests that all pass in isolation, with a different set each run (quotation 2.7 one run, admin-config 6.1 the next). **The knob is `asyncUtilTimeout` in `src/test/setup.ts` (15s), NOT `testTimeout` in `vite.config.ts`** - `findBy*` waits on its own clock, which is why raising `--testTimeout` changes nothing and the failures still land at ~1.2s of test time. `npx vitest run --maxWorkers=2` is 1690/1690 green, which is the proof it is CPU contention and not logic. Raise `asyncUtilTimeout`, or cap workers in the config - a suite that fails differently by machine load is a suite nobody trusts - belongs to P-17 | M0
- [ ] (found in P-04) `NoticeBatch`, `NoticeMatch`, `OcrTemplate` and `Endorsement` entities are unmodelled, so canvas flow 5 rows 5.3-5.5 and all of flow 7 are not walkable — both are P2 and outside P-04's cluster list — belongs to P2 | P2
- [ ] (found in inquiry audit INQ-1032) `dormant()` filters on the literal `stageKey === 'dormant'` in `src/data/mock/pipeline.ts`, and `reports.test.tsx` repeats the literal, while stages are admin-editable rows — renaming or retiring that stage empties the win-back list with no error. Fix is a `parksTheLead` boolean on the `InquiryStage` row, read the way `countsAsOpen` already is — belongs to P-18c follow-up | P1
- [ ] (found in inquiry audit INQ-1032) `referral` is a value in `CUSTOMER_SOURCES` with no subject anywhere: `Inquiry` carries `agentId` and `subAgentId` but no referrer, so a referred lead cannot be attributed, thanked or paid, and the enum reads as working attribution when it is a label. Wants a `referral` field and the biconditional `source === 'referral'` iff `referral !== null` enforced at create — belongs to P1 | P1
- [ ] (found in inquiry audit INQ-1032) `renewal-scenarios.test.tsx > 5.5` is a calendar bomb that went off on 2026-08-30: it types a new term starting `2026-08-29`, and `RenewalDetailScreen` reads `today` off the real `new Date()`, so that date is now in the past, the backdating branch opens, and the confirm gate the test waits for never renders. Nothing to do with the renewal logic — the test needs a term date computed from the clock rather than typed as a literal. Green until yesterday, red every day from here — belongs to P-17 | M0
- [ ] (found in quotation audit QTN-0331) `BenefitItem` carries `sortOrder` but no section, so the matrix and the generated sheet are flat and FR-06.4's Coverage / Add-on split cannot be expressed. Fix is a `section` field on the catalogue item in `src/data/repo/benefits.ts`, grouped in `<BenefitMatrix>` and in `DocumentSheet` — belongs to P1 | P1
- [ ] (found in quotation audit QTN-0331) there is no portability flag anywhere in the quotation domain or `QuotationDocument`: `floater` is derived from the persons list, but PORT is a fact the client's reference header prints and nothing records it. Wants a field on the quotation, printed in the "Prepared for" block — belongs to P1 | P1
- [ ] (found in quotation audit QTN-0331) `sideBySide` puts EVERY column on one letterhead (`DocumentViewer.tsx` builds one sheet unless the layout is `single`), so a four- or five-company comparison squeezes past the printable width. Chunk at three columns per sheet with continuation sheets — belongs to P-17 polish | P1
- [ ] (found in quotation audit QTN-0331) a member with no date of birth prints `not recorded` on the CUSTOMER-FACING sheet, where age is the premium driver. Either gate generate on a complete persons block or suppress the column when every row is absent — a client copy should not show the agency's own gaps — belongs to P-17 polish | P1
- [ ] (found in quotation audit QTN-0331) `SentPanel` logs origin, channel and the auto-share fork but no sent-at, no delivery status and no resend, and there is no download of the generated PDF, so "did the customer get it" is unanswerable from the record. Collapses onto the `MessageLog` repository edge already noted in the P-15 entries — belongs to P1 | P1
- [ ] (found in quotation audit QTN-0332) `revisionReason` is a single field on the quotation header, overwritten by each revision, so v1's reason is lost when v2 opens and the version switcher shows tabs with no why. Same shape as the P-13 `benefitRows` entry above and wants the same fix - move it onto the version - plus a changed-cell diff against the prior version — belongs to P1 | P1
- [ ] (found in quotation audit) nothing watches a stalled quotation: QTN-0329 sits composed-not-generated and QTN-0331 shared-with-no-decision with no task, nudge or age threshold against either. Same recipe shape as the P-09 proactive-notice thresholds — belongs to P1 | P1
- [ ] (found in renewals audit POL-4437) the FR-21 recipe runtime is specified in plan §7 ("let mock recipes subscribe") but no P-step builds it: `src/domain/events.ts` exposes `on`/`onAny` and the only production subscriber in the tree is `bus.onAudit` in `src/data/mock/store.ts`. `renewal.reminder` is seeded active on trigger `renewal.due` with a real template and nothing listens, so a renewal reaches expiry having sent nothing. Not a renewals defect — the same hole silences inquiry TAT breach, stalled quotations and the bounced-cheque task — belongs to P1 | P1
- [ ] (found in renewals audit POL-4437) `src/features/documents/documents.test.tsx > shows a customer's Aadhaar and PAN only as their last four characters` is red, and it fails BEFORE it asserts anything about masking: `findByText('What it evidences')` times out at line 164, so the drawer never renders and the `document.body.textContent` check at line 166 is never reached. Nothing is leaking — but a masking invariant whose test cannot get as far as looking is worse than a failing assertion, because it reads as coverage. Confirmed pre-existing against the renewals changes — belongs to P-17 | M0
- [ ] (found in FR-13 endorsement review) **the claims-in-period check fails open on an unresolvable policy.** `claimsVerdictFor` (`src/data/mock/servicing.ts:140`) collects claims by matching `policyId`, so a policy that does not resolve matches nothing and `claimsInPeriodCheck` returns `refundEligible: true` — a broken link reads to the operator as "nothing was claimed inside this policy period" and opens the refund gate. The header comment defends the fallback as "the cautious direction", which is true for a policy with no dates and exactly backwards for a policy that is absent. Wants a `periodSource` on the verdict that forces `refundEligible: false` when the policy is missing, a `policyIsOnFile` guard on all three edges out of `type_selected`, and a resolve check in `create` — belongs to P1 | P1
- [ ] (found in FR-13 endorsement review) `EndorsementDetailScreen` renders its spine before the context resource settles — the render gate at `:99` reads `loaded.isLoading` only, while policy, customer and versions load in a second resource at `:90-97` keyed on the loaded record — so `KeyValueList` prints "not recorded" against Policy and Customer on every visit for the length of the second read. A link that is still loading and one that is genuinely broken are rendered identically, which is how this was first misread as missing data. Skeleton the rows while loading and give an unresolved link its own state — belongs to P-17 polish | P1
- [ ] (found in FR-13 endorsement review) `effectiveFrom` is optional on `CreateEndorsementCommand` and required only at `versionPolicy`, so a cancellation's refund eligibility is decided with no date on which cover ends: END-0033 and END-0036 both sit decided with `effectiveFrom: null`. Wants a `cancellationHasEffectiveDate` guard on both edges out of `claims_check`, refusing an effective date earlier than the policy start — belongs to P1 | P1
- [ ] (found in FR-13 endorsement review) the claims-in-period window is `[policy.startDate, policy.expiryDate]` — the whole term rather than the cover actually consumed — so a claim raised after the cancellation effective date still blocks the refund, and on `pol-4419`'s twenty-year LIC term the window is twenty years wide. Whether the window closes at the effective date or at expiry is an insurer-facing rule and may differ per insurer, so it belongs in config; record `checkedFrom`/`checkedTo` on the verdict either way so the screen can state what was checked — belongs to P1 | P1
- [ ] (found in FR-13 endorsement review) `changeFitsEndorsementScope` returns `allow()` when nothing passes a scope (`src/domain/workflows/endorsement.ts:164`), and `EndorsementDetailScreen`'s `ctxFor` (`:143`) passes neither `scope` nor `renderedFields`. The capture screen passes both, so the ordinary path is covered, but a record reaching `type_selected` by any other route can be typed from the detail page with the scope guard AND the non-financial premium-field guard both inert — the latter because an empty `renderedFields` is what a compliant form would also report. Derive both from `shapeFor(record.type)` — belongs to P1 | P1
- [ ] (found in FR-13 endorsement review) FR-13.7's major-change guard is only `replacesInsuredEntity`, a boolean the person raising the endorsement ticks about their own request, and it is `false` on all six seeds. Nothing compares the proposal against the policy's current values, so a sum insured moved from 10 lakh to 95 lakh meets the same bar as a nominee spelling. Wants a `materialChangeCheck` against a policy snapshot with thresholds in config, suggesting fresh issue with a recorded override rather than refusing outright — a threshold nobody can override gets routed around by raising two smaller endorsements — belongs to P2 | P2
- [ ] (found in FR-13 endorsement review) floater member changes are the strings `memberAdded`/`memberRemoved` inside `changedFields: readonly string[]`, so the record cannot say WHICH member. `Household`, `HouseholdView`, `Member.coveredUnderPolicyIds` and `Policy.memberIds` already exist and `fixtures.test.ts` asserts the link both ways; Scenario 6.2 needs a typed `memberChanges` array joining them, applied to the policy at `versionPolicy` so both sides of the link move together or neither does — belongs to P2 | P2
- [ ] (found in FR-13 endorsement review) the endorsement commission delta is emitted and never booked: the `submitted -> approved` edge carries `alsoEmits: ['commission.booked']` with a note saying the hook fires here, and `src/domain/commission.ts:141,151` maps `endorsement.approved` to the `endorsement` source, but `approve()` (`src/data/mock/servicing.ts:379`) writes no ledger row — searching the servicing adapter for "commission" returns nothing. `chain(-x) === -chain(x)` is documented at `commission.ts:47` for exactly this delta and is never called. Booking must be additive against the original and idempotent on `(policyId, source, discriminator)` — belongs to P2 | P2
- [ ] (found in FR-13 endorsement review) money only flows inward: `CollectionRecord` (`src/data/repo/policies.ts:364`) tracks premium in and there is no outbound counterpart, so END-0034's recorded refund can never be marked paid and nothing answers "which recorded refunds are still outstanding" — the question the customer actually rings about. Wants a record-only `Disbursement` ledger: amount due read from the endorsement figure so the two cannot drift, amount paid typed off the bank advice, a short payment recorded as a discrepancy and never reconciled here — belongs to P2 | P2
- [ ] (found in FR-13 endorsement review) endorsement completion notifies nobody: `versionPolicy` writes the version and the document and emits no message, though channels, templates and the agent `directUpdatesEnabled` toggle all exist in the config module. FR-09.7/FR-17.6 want `policy.versioned`, `endorsement.refund_recorded` and `endorsement.refund_blocked` routed through one shared resolver (to the agent when direct updates are off, suppressed where consent does not cover the channel) and through `<ConfirmGate>` like every other outward send — a notification that fires automatically on a state change is an outward mutation with no cancel path — belongs to P2 | P2

### Found in the demo-readiness wave (2026-08-31)

All 65 routes are now built, so the backlog below is depth rather than absence.

- [ ] (found in record-depth work) consent withdrawal is recorded on the customer desk, not on the record: `CONSENT_STATES` has no `withdrawn` member and `CustomerRepository` has no write for it, so the consent pill deliberately does not move and the screen says why. Closing it properly = add `withdrawn` to `CONSENT_STATES`, an edge `submitted -> withdrawn` on `consentMachine`, and a `consent.withdrawn` event name - all in `src/domain/` - belongs to P1 | P1
- [ ] (found in record-depth work) the policy version diff has no before-and-after column: no per-version field snapshot exists anywhere in section 8, so the Versions tab lists which fields an endorsement changed and prints one honest line where the prior values would go - belongs to P1 | P1
- [ ] (found in record-depth work) FR-17.3's skip log does not exist: the consent tab names which channels a withdrawal suppresses and states on screen that individual suppressed sends are not logged - belongs to P1 | P1
- [ ] (found in dataport work) import commit lands only on the repositories that have a `create`; for the rest the Check step validates and says on screen that the entity cannot yet be written. Collapses to a real commit the day those repositories gain a write API - belongs to orchestrator integration | P1
- [ ] (found in dataport work) `/config/masters` has no in-field add (FR-02.2), which is one of the client's own named acceptance criteria. The import path now covers bulk creation of master values, which is a different need and does not close it - belongs to P1 | P1
- [ ] (found in wiring) `REPORTS[0]` was asserted positionally in `reports.test.tsx` and silently retargeted when the catalogue grew from five reports to ten. Fixed to look up by key; worth checking no other test indexes a catalogue by position - belongs to P-17 polish | M0
- [ ] (found in wiring) multi-language content (FR-11.8, FR-17.4 - Gujarati / Hindi / English) is absent everywhere: no language field, no translated template. For a Gujarat agency this is a product gap, not a cosmetic one - belongs to P2 | P2

---

## Appendix A — CLAUDE.md (P-00 creates this at repo root, verbatim)

```markdown
# Jagad Insurance MVP — Constitution

Single-tenant insurance-agency ERP for Jagad Insurance. Web only; mock-data MVP.
Canonical spec: `jagad_mvp/documents/IMPLEMENTATION_PLAN.md` (cited as §).
Build sequence: `jagad_mvp/documents/BUILD_PLAYBOOK.md` — work exactly one P-step at a time.

## Commands (run inside jagad_mvp/)
- `npm run dev` · `npm run build` · `npm run lint` · `npm run test`
- `npm run check` = build + lint + test + token check — the gate. `/verify` runs it.

## Compiler rules — the build fails otherwise
1. NO TypeScript `enum`, no parameter properties (erasableSyntaxOnly). Status sets are
   `const X = {...} as const` + a `typeof`-derived union.
2. Type-only imports use `import type { ... }` (verbatimModuleSyntax).
3. No unused locals or params — delete them.
4. React Compiler is ON: never hand-write useMemo / useCallback / React.memo.
5. Verify a library's API against the version in package.json — never assume from memory.

## Product invariants — violating any is a review reject
- Record-only money (D3): never compute, suggest or default a premium, settlement, refund or
  endorsement delta. Only arithmetic allowed: Net = sum of typed components; Final = Net + GST.
  All amounts are integer-paise `Money`; format only at the render edge.
- Amounts enter via `<RecordOnlyAmount>`; derived roll-ups render via `<RollUp>`, read-only.
- OCR never silent-commits: extracted values render via `<OcrField>`; a form with any unconfirmed
  extraction cannot submit.
- Every outward mutation (send, escalate, bulk action, notifying status change) goes through
  `<ConfirmGate>`. Cancel writes nothing.
- The Assistant reads ONLY `AssistantView` projections from `src/data/assistant/` — never entity
  types. Allow-list, not deny-list. The boundary test must stay green; never weaken it.
- Aadhaar: last-4 maximum in staff UI, never the full number anywhere, never ANY form (masked
  included) in Assistant context. Health/diagnosis/document text never reaches Assistant code.
- Dual numbering: `systemNo` always, `insurerNo` when received; render via `<RecordId>`.
- NO emoji anywhere — UI, code, comments, docs, commits. Icons come from the SVG sprite.
- No hex color outside `src/styles/tokens.css` (checked by `npm run check`).
- Layer rule: `src/ui/` imports nothing from features/components/domain/data; domain and data
  import no React. Components never import fixtures — data flows through repositories.
- URL owns list state: any queue view is reconstructible from its URL.

## Design system (§2)
Navy = primary action + navigation. Green = brand + positive status ONLY. Lime = attention
(needs a person). Amber/red/grey keep their U7 meanings. IBM Plex Sans for UI, IBM Plex Mono for
ids/money/dates (tabular-nums), Source Serif 4 ONLY inside generated documents.

## Session ritual
1. Start with `/verify`; do not build on red.
2. Work exactly one playbook step; out-of-scope findings go to the playbook Backlog, one line.
3. Step's done-when gates + `/verify` green → commit with the step's message → push.
4. Gates red after 2 focused fix attempts → stop and report; do not commit.
5. Never skip, disable or quarantine a failing test to get green.
```

## Appendix B — Skills (P-00 creates these, verbatim)

`.claude/skills/verify/SKILL.md`:

```markdown
---
name: verify
description: Run the Jagad MVP gate suite (build, lint, tests incl. Assistant boundary, token check) and report a pass/fail table. Use at session start, before every commit, and whenever asked to verify or check the build.
---
From `jagad_mvp/` run, in order: `npm run build` · `npm run lint` · `npm run test` ·
`node scripts/check-tokens.mjs`.
Report ONE table: gate | pass/fail | first error line if failed.
If a gate fails: fix only when the cause is inside the current step's scope; otherwise report and
stop. Never declare a step done on a red gate. Never skip, disable or quarantine a test to get green.
```

`.claude/skills/new-module/SKILL.md`:

```markdown
---
name: new-module
description: Scaffold a Jagad MVP feature module (routes, WorkQueue screen, repository, fixtures, tests) following the established pattern. Use when adding any module or queue screen from the plan's route map.
---
Input: module name + its plan references (route in §4, screen row in §5, machine in §9 if any).
1. `src/features/<module>/` with routes, `<Module>ListPage`, `<Module>DetailPanel`.
2. Register in `app/router.tsx`; nav entry in `app/navigation.ts` with permission key + count
   selector.
3. Repository interface in `src/data/repo/` + mock adapter methods + fixtures (story cast first).
4. List = `<WorkQueue>` configured (columns, filters, stripe mapping, bulk actions) — never a
   bespoke table. URL owns filter/sort/page.
5. Detail renders in the right Drawer unless the plan says full page.
6. Status pills map machine states through the shared status-token map; transitions call the
   domain machine — never set status strings directly.
7. Outward actions behind `<ConfirmGate>`; amounts via `<RecordOnlyAmount>`.
8. Vitest smoke test: list renders fixtures, row opens detail, one legal + one illegal transition.
9. Finish with `/verify`.
```
