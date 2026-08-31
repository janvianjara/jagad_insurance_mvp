# Jagad Insurance — React MVP Implementation Plan

Turning **PRD v0.4.1**, the **workflow canvas** and the **Assistant prototype** into a running React
application. No code written yet — this is the proposal.

Sources: PRD v0.4.1 (153 FRs, 21 modules, D1–D21) · workflow canvas v3 (78 nodes, 89 edges,
48 scenarios) · Assistant prototype 8 (6 personas, 75 cards, 7 documents) · thread handoff.

**Revision 2.** The four blocking decisions are answered (§12). The entity model is unblocked and B1 can
start. Three things changed materially as a result: instalments and mandates are in scope as record-only
history, the AI Assistant sits at the top of the navigation and is the landing view exactly as the
prototype has it, and the Assistant is a committed product feature — which means it needs the FR block
drafted in §14 and it raises one compliance question nobody has answered yet.

---

## 1. Repository audit

`jagad_mvp/` is an untouched Vite starter. `src/App.tsx` is the 122-line Vite demo. No product code,
no router, no state library, no styling system, no tests. Greenfield.

### Toolchain in place

| Item | Version | Consequence |
|---|---|---|
| Vite | 8.2 | Rolldown-based. Single-app bundle is fine for MVP. |
| React | 19.2 | Actions, `useOptimistic`, `use()`. SPA — no server components. |
| React Compiler | 1.0 | **On.** Do not hand-write `useMemo`/`useCallback` — manual memoisation fights it. |
| TypeScript | 6.0 | Two flags below change how domain code must be written. |
| ESLint | 10 | Flat config. Add import-order + a11y plugins. |

### Hard constraints from `tsconfig.app.json`

| Flag | Consequence |
|---|---|
| `erasableSyntaxOnly: true` | **No TS `enum`. No parameter properties.** Every workflow status set in §9 must be a frozen `const` object + `typeof`-derived union. `enum` will not compile. |
| `verbatimModuleSyntax: true` | Type-only imports must use `import type { X } from …`. |
| `noUnusedLocals` / `noUnusedParameters` | No placeholder params or stubbed handlers. Scaffolding must compile clean. |
| `noEmit` + `tsc -b` in build | Type errors break `npm run build`. Types are a gate. |

### Dependencies to add

| Package | Purpose | Why not the alternative |
|---|---|---|
| `react-router` 7 | Route map (§4) is the app spine; queues must be deep-linkable and role-gated. | Hand-rolled routing collapses at nested detail panels + URL-owned filters. |
| `zustand` | Session, permissions, drawer, toasts, three feature drafts. | Context + `useReducer` is the zero-dep fallback and is viable. Redux Toolkit is heavier than needed. |
| `@tanstack/react-table` | Every screen is a dense queue (U2, U4, U9). Headless. | Hand-writing selection + bulk-action + column state across 15 list screens is the biggest avoidable cost. |
| `react-hook-form` + `zod` | Draft-safe long forms (U6), keyboard-first entry (U3). | Zod doubles as the SKU schema validator and fixture-integrity check. |
| `date-fns` | TAT clocks, expiry−N, grace windows, claim aging. | Native `Date` arithmetic across five different clocks is where date bugs live. |
| CSS Modules + `tokens.css` | Styling. Tokens are the single source of truth. | Tailwind is faster to type, but the design system is a deliverable and D1/R-4 want a re-themable token file per agency. If the team prefers Tailwind, map the same tokens into `@theme` — nothing else changes. |

### Missing input

**No Jagad logo asset exists in the repository** — only Vite's `react.svg`, `vite.svg`, `hero.png`.
The palette below is derived from the logo image supplied in conversation. Before build, drop the
source logo (SVG preferred, else transparent PNG @3×) into `src/assets/brand/`. Starter assets and
`App.css` are deleted in the first commit.

---

## 2. The Jagad design system

Derived from the logo, **not** from the prototype. The prototype's greys and its `--act:#2f6ba8`
accent are discarded entirely.

The logo carries four hues: deep forest green graduating to chartreuse in the mark, a navy setting
the wordmark, a cornflower blue in the stacked bars, and a muted sage-grey ground.

### Brand palette

| Token | Hex | Role |
|---|---|---|
| Jagad Green | `#14683B` | Brand mark, positive status, section rules |
| Jagad Lime | `#A6CB3A` | Attention highlight, active-nav rail, focus accents |
| Jagad Navy | `#1C2C6B` | Primary actions, navigation, headings |
| Jagad Blue | `#4C7FC4` | Informational, links, in-progress state |
| Slate | `#5C6A72` | Neutral base — greys carry a faint green bias |

### The conflict this palette resolves

UX charter **U7** fixes the status language as *pending = amber, active = green, escalated = red,
locked = grey*. If green is also the primary action colour, every button, every selected nav item and
every healthy record read as the same thing, and the status language stops carrying information.

**Resolution:** navy carries primary action and navigation; green is reserved for brand identity and
positive status only; lime is the attention accent marking what needs a person; amber, red and grey
keep their U7 meanings. Green still appears everywhere — as brand mark, section rules, the "good"
signal — but never competes with itself.

### Semantic status tokens

| Token | Value | U7 meaning | Seen on |
|---|---|---|---|
| `--ok` | `#14683B` | Active / won / settled / verified | Policy live, deal won, claim closed, KYC complete |
| `--warn` | `#B8801C` | Pending / awaiting / at risk | TAT nearing, KYC partial, OCR unreviewed, grace open |
| `--bad` | `#B03A31` | Escalated / blocked / lapsed / bounced | TAT breached, cheque bounced, policy lapsed, unmatched notice |
| `--info` | `#4C7FC4` | In progress / informational | Quotation shared, claim with insurer, revision loop |
| `--idle` | `#7A867F` | Locked / closed / archived | Retention-locked policy, immutable version, deactivated master |
| `--attn` | `#A6CB3A` | Needs a person (not an error) | Unassigned pool item, draft awaiting completion, proactive alert rail |

### Type

| Role | Face | Used for |
|---|---|---|
| UI & body | IBM Plex Sans | All application chrome. 13px base for tables/forms, 15px for reading surfaces. |
| Data & identifiers | IBM Plex Mono | Every system and insurer number (`POL-DRAFT-0219`, `APP-0774`, `CLM-0412`), all currency, all dates in tables, uppercase micro-cap labels. `font-variant-numeric: tabular-nums` throughout. |
| Documents | Source Serif 4 | **Only** inside generated documents — quotations, policy packs, claim summaries, renewal notices, statements. A produced PDF should read as a document, visibly not as UI. |

### Token file structure

```
src/styles/
├── tokens.css        // the only place a raw hex appears in the codebase
│     :root           // brand, semantic, neutral, space, radius, type, motion
│     [data-density]  // comfortable | compact — U2 lets ops staff choose
├── reset.css
├── base.css          // element defaults, focus ring, scrollbars
└── *.module.css      // per component; consume tokens only
```

Spacing on a 4px base (`--sp-1`…`--sp-10`), radii `4 / 6 / 8 / 12`, three elevation steps, two motion
durations. **Lint rule rejecting literal hex outside `tokens.css`** — that rule is what stops R-4
(config-portability erosion) happening in CSS.

Density is a product feature: a `data-density` attribute on `<html>` swaps row height, font step and
padding tokens. Build it in from the first table.

---

## 3. Application shell & information architecture

```
┌──────────────┬────────────────────────────────────┬─────────────┐
│ SIDE RAIL    │ MAIN                               │ DRAWER      │
│ 240px fixed  │ PageHeader: title · meta · actions │ 340–560px   │
│              │ ────────────────────────────────── │ resizable   │
│ brand mark   │ FilterBar / BulkActionBar          │ max-toggle  │
│ role nav     │                                    │ Esc closes  │
│  (sectioned) │ WorkQueue / DataTable / Form       │             │
│              │                                    │ record      │
│ ──────────── │                                    │ detail  ·   │
│ user + role  │                                    │ document    │
│ switcher     │                                    │ preview     │
└──────────────┴────────────────────────────────────┴─────────────┘
```

Taken from the prototype's proven behaviour: sectioned navigation with live counts, a resizable drawer
that maximises and closes on Escape, persona switcher in the rail footer. The nav counts are not
decoration — they are the queue depths that make U1 work, and must be live.

### The home screen — DECIDED (D-G): Assistant at the top, as the prototype has it

**Assistant is the first item in every role's navigation rail, and it is the landing view.** This
matches the prototype exactly (`AIITEM` is the first entry in all six `NAV` arrays, and `fresh()` opens
the chat feed).

The apparent conflict with U1 (*"the queue IS the app"*) is thinner than it first looks, and the
prototype already resolves it: **the Assistant's opening turn is a briefing on the user's own queue.**

> *"18 open inquiries across the team. Four are still unassigned and two are close to their TAT — if
> those lapse they reassign on their own and the customer waits longer."*

So the landing view is not an empty chat box. It is the work summary U1 asks for, delivered
conversationally, with the queue itself one nav item below and one suggestion chip away. Build it that
way:

- Landing route per role is `/assistant`, opening with a generated queue briefing from live counts —
  never a blank prompt, never a greeting.
- The role's real queue is the **second** nav section and the first suggestion chip.
- Proactive notices arrive in the feed with the prototype's "noticed just now" framing and its stated
  reason, and also mirror into a `NotificationRail` on every queue screen so they are not missed by
  someone who navigated straight past the Assistant.
- `Cmd/Ctrl-K` summons the Assistant as a drawer from any screen, carrying the current record as context.

**Consequence for scope:** the Assistant can no longer be deferred to P1. It is the first thing anyone
sees, so a working shell — briefing, suggestion chips, and the Ask cards over the user's own queue —
moves into M0. See §11.

### Navigation model

The prototype's `NAV` map is a good IA and transfers almost unchanged. Rebuild as typed config, each
item carrying the permission it requires so the rail is rendered by the same `can()` evaluator that
gates the routes (§7).

| Role | Lands on | Nav sections |
|---|---|---|
| Admin | Operations overview | Assistant · Front office · Operations · Money · Records · Configuration (10 surfaces) |
| Sales Manager | Pipeline | Assistant · Front office · My work · Reference |
| Agent | My leads | Assistant · My book · Money · Reference |
| Back-office | Work queue | Assistant · My queue · Servicing · Records |
| Claims | Claim queue | Assistant · Claims · Reference — *P2* |
| Renewals | Renewal pool | Assistant · Renewals · Reference — *P2* |
| Sub-agent | My leads (mobile-first) | Leads · Customers · Wallet — single-task screens per U11 |
| Customer | Portal home | Separate thin shell — see D-I |

---

## 4. Route map

URL owns filter, sort, page, tab, selected record — every queue state is linkable, every escalation
notice can point at a screen.

```
/                                  → redirect to /assistant (role home, D-G)
/login  ·  /login/2fa                  [M0]  TOTP; OTP channels behind FR-18
/assistant                             [M0]  LANDING VIEW — opens with the role's queue briefing
/assistant/:threadId                   [P1]  a resumed conversation

FRONT OFFICE
/inquiries                             [M0]  ?status=&filter=&owner=&page=
/inquiries/new                         [M0]
/inquiries/:id                         [M0]  detail + assignment trail + TAT clock
/quotations                            [M0]
/quotations/new                        [M0]  Composer — customer + policy selection
/quotations/:id                        [M0]  benefit matrix, versions, share
/quotations/:id/v/:version             [P1]  immutable prior version
/deals/:id                             [M0]
/customers  ·  /customers/:id          [M0]  360: household, policies, docs, timeline
/customers/:id/consent                 [P1]  staff view of consent ledger

OPERATIONS
/policies  ·  /policies/:id            [M0]
/policies/new                          [M0]  SKU-rendered; ?dealId= pre-populates
/policies/:id/versions                 [P2]
/policies/:id/schedule                 [P2]  D-A — premium schedule, mandate, debit history
/back-office                           [M0]  work-queue home
/back-office/drafts                    [M0]
/back-office/kyc                       [M0]
/back-office/collections               [P1]
/back-office/issuance                  [P1]
/back-office/ocr-review                [P1]
/tasks                                 [P1]  polymorphic queue, push|pull per module

/renewals                              [P2]  pull pool
/renewals/:id                          [P2]
/renewals/instalments                  [P2]  D-A — dues this week, failed mandates, inside grace
/renewals/notices                      [P2]  upload → OCR → match → send-all
/renewals/notices/:batchId             [P2]
/claims  ·  /claims/:id                [P2]
/claims/new                            [P2]
/endorsements  ·  /endorsements/:id    [P2]
/endorsements/new                      [P2]  ?policyId=&type= — form reshapes by type

MONEY & RECORDS
/commission                            [P1]  read-only ledger view
/commission/ledger                     [P3]
/commission/payouts                    [P3]
/wallet                                [P3]  sub-agent only, ABAC-isolated
/documents                             [P1]  vault, ACL-filtered
/reports  ·  /reports/:key             [P1]  dashboard basic; deep analytics P3

CONFIGURATION — admin only, mirroring canvas column 0
/config/users                          [M0]  users, permission templates, ABAC, 2FA matrix
/config/masters                        [M0]
/config/forms                          [P1]  SKU builder: stages, fields, branching, preview, versions
/config/companies                      [M0]  per line; contacts per category
/config/products                       [M0]  + policy→benefit map (FR-05.7)
/config/benefits                       [M0]  benefit catalog (FR-06.4)
/config/agencies                       [M0]  Agency Master: type, scope, commission %
/config/agents                         [M0]  agent %, sub-agent grant, cap, direct-updates toggle
/config/templates                      [P1]
/config/integrations                   [P1]
/config/automation                     [P1]  recipe params P1; visual builder P3
/config/compliance                     [P1]  consent, retention classes, audit search

CUSTOMER PORTAL — separate shell, separate auth, RESPONSIVE WEB ONLY in MVP (D-I)
/portal  ·  /portal/policies  ·  /portal/documents        [P1]
/portal/claims  ·  /portal/claims/new                     [P2]
/consent/:token                        [P1]  login-free, expiring — consent + sensitive data
/upload/:token                         [P2]  login-free, expiring — FR-16.8 discharge summary
```

**Two routes carry no session.** `/consent/:token` and `/upload/:token` are tokenised, expiring and
login-free by design (FR-09.9, D21). Code-split them out of the authenticated bundle; they must not
import the app shell, the permission store, or anything assuming a user.

---

## 5. Page inventory

### Front office

| Screen | What it does | Derived from | Phase |
|---|---|---|---|
| Inquiry queue | Filterable list; unassigned and TAT-at-risk pinned; bulk assign. Row shows source, category, owner, TAT remaining. | Canvas n1–n8 · `p_unassigned`, `p_tatrisk` | M0 |
| Inquiry detail | Assignment trail, confirm/accept, TAT clock, escalation history, notes, convert-to-quotation. | Canvas n4–n8 · `p_escalate` | M0 |
| **Inquiry engagement** | On the inquiry detail: log an activity (channel, disposition, note), the next action the disposition demands, the attempt counter, and the activity timeline merged with the assignment trail. | FR-06.13–.15 | P1 |
| **Requirement capture** | The dynamic form per category — members, DOBs, budget band, existing cover, urgency — attached to the inquiry and feeding the Composer's header. | FR-06.16 | P1 |
| **Pipeline** | Inquiries by stage with count, median age in stage and conversion to the next; the "% of open inquiries with a dated next action" tile beside it. | FR-06.19 | P1 |
| Quotation list | By stage: draft, shared, revising, won, lost. Stalled (no reply > N days) surfaced. | `p_stalled` | M0 |
| **Quotation Composer** | The core screen. Customer + 1–N company/policy columns → benefit matrix from the policy→benefit map, defaults pre-filled → ad-hoc rows inline → **Final Payable Premium typed per column** → single or side-by-side PDF. | Canvas n9–n12 · `p_compose`, `p_quote`, `p_quotepdf` | M0 |
| Quotation detail | Version stack (immutable), revision with mandatory reason, share log, Won/Lost with mandatory Lost reason. | Canvas n13–n16 · `p_revise`, `p_won`, `p_lost` | M0 |
| Deal detail | Application number, line items, customer/agent/sub-agent links, hand-off to policy entry. | Canvas n16 | M0 |
| Customer list | Search, household grouping, source, linked sub-agent, KYC state. | Prototype nav | M0 |
| Customer 360 | Household + members + relationships, policies, documents, transactions, change requests, consent state, full audit timeline (U14). | `g_360` | M0 |

### Operations

| Screen | What it does | Derived from | Phase |
|---|---|---|---|
| Back-office work queue | Six ops queues in one view: entry, KYC completion, draft completion, collection verification, claim follow-up, sub-agent intake. | FR-08.1 | M0 |
| Policy entry (SKU form) | Multi-step, branching on product type; line items pre-populate from deal; draft-save with missing-field indicator; premium block per-type with Net roll-up and Final = Net + GST. | Canvas n17–n25 · `b_complete`, `b_missing` | M0 |
| Policy detail | State, dual numbers, premium record, payment block, documents, dispatch, versions, retention lock. | Canvas n24, n25 | M0 |
| KYC queue + detail | Doc checklist, OCR review fields, Aadhaar masked to last-4, consent-link send/resend, completeness gate. | Canvas n17–n19 · `b_kyc`, `b_consent` | M0 |
| Collections | Record-only entry, all modes, no slip, cheque bounce marking, back-office verification before close. | Canvas n20–n23 · `b_collect` | P1 |
| Issuance queue | Policies stuck awaiting insurer; days-waiting; chase-the-insurer draft. | `b_stuck`, `b_chase` | P1 |
| OCR review queue | Extracted rows flagged until confirmed; never silent-commit (U10). | `b_ocr` | P1 |
| Task queue | Polymorphic work items; push or pull per module; ABAC-filtered pool. | FR-15 | P1 |
| Renewal pool | Pull queue, self-assign, due buckets, silent, lapsed + win-back. | Canvas n26–n31 · `r_due`, `r_lapsed`, `r_winback` | P2 |
| Notice bulk ingest | Upload → per-insurer OCR template → match/review → unmatched blocked from send → send-all with per-customer PDF. | Canvas n32–n36 · `r_ocr`, `r_send`, `r_link` | P2 |
| Claim queue + detail | Push-to-team then pickup; cashless vs file fork; checklist per company/product; query loop in three languages; settlement + mandatory company remark to close. | Canvas n37–n50 · 12 `c_*` cards | P2 |
| Endorsement | Type-driven form reshape; non-financial / financial / cancellation; auto claims-in-period refund check; immutable version on approval. | Canvas n51–n56 · `b_endorse` | P2 |

### Money, records, configuration

| Screen | What it does | Phase |
|---|---|---|
| Commission view | **Read-only.** Chain per policy: payer → agency % → agent % → sub-agent share. Booked totals by channel. | P1 |
| Wallet | Sub-agent only; own payouts; ABAC-isolated. | P3 |
| Document vault | Polymorphic docs, versions, retention class, ACL, access log. Every open logged. | P1 |
| Reports | Core dashboard: policy/claim summaries, renewal buckets, YoY, birthdays. Deep analytics P3. | P1 |
| Config × 10 | Users/roles/2FA, masters, form builder, companies, products, benefits, agencies, agents, templates, integrations, automation, compliance. | M0 / P1 |
| Assistant | Four request kinds; every Act gated by confirm; six boundaries enforced in code, not copy. | P1 |
| Customer portal | Thin: policies, documents, transactions, change requests. Claim raise + track P2. | P1 |

---

## 6. Component architecture

### Folder shape

```
src/
├── app/            router, providers, error + suspense boundaries, role guards
├── ui/             primitives — no domain knowledge, no imports from features/
├── components/     shared domain composites — knows Policy, Claim, Task
├── features/       one folder per module: routes, hooks, local state, feature components
│     inquiries/ quotations/ deals/ customers/ policies/ backoffice/
│     renewals/ claims/ endorsements/ commission/ documents/ reports/
│     config/ assistant/ portal/
├── domain/         types (each field dataClass-tagged), workflow machines, guards,
│                  permission evaluator, money
├── data/           repository interfaces + mock adapters + fixtures
│     assistant/    AssistantView projection — allow-listed, sensitive fields absent (§14.1)
├── styles/         tokens.css, reset, base
└── lib/            formatters, date helpers, id generators, hooks
```

One dependency rule, lint-enforced: **`ui/` may not import from `features/`, `components/` or
`domain/`.** It is the layer that survives a re-theme and, if mobile apps arrive (D-J), the layer worth
extracting.

### The three guardrail components

Not UI conveniences — each is a business rule made physical, and each appears in both the PRD and the
prototype as an explicit promise. **Build these before any screen.**

| Component | Rule it enforces | Behaviour |
|---|---|---|
| `<RecordOnlyAmount>` | D3 — the platform records money, it never calculates it. | An amount input that **cannot be auto-filled from a computation**. Renders the "type the figure" affordance the prototype uses for final premium and settlement. Sibling `<RollUp>` displays Net = Σ components and Final = Net + GST as read-only derived text, visibly distinct from anything typed. Any future PR that computes into this component is a review reject. |
| `<OcrField>` | FR-16 — extraction never silent-commits (U10). | Wraps a form field. Three states: *extracted* (lime flag, confidence shown, value present but unconfirmed), *confirmed*, *edited* (original kept for audit). A form containing any unconfirmed `OcrField` cannot submit. |
| `<ConfirmGate>` | Prototype boundary — nothing sends or saves without showing what it will do; Cancel writes nothing. | Renders the intended change as a key/value preview, then Cancel / Confirm. On confirm it emits the mutation and swaps to a done-state receipt. Used by every Assistant Act, every bulk send, every escalation, every status transition that leaves the system. |

### UI primitives — `src/ui/`

| Group | Components |
|---|---|
| Form | Field, Label, Input, NumberInput, MoneyInput, Select, Combobox, CascadeSelect, DatePicker, DateRange, Textarea, Checkbox, RadioGroup, Toggle, FileDrop, FormRow, FormSection, FieldError |
| Data | DataTable, TableToolbar, ColumnPicker, Pagination, SortHeader, SelectionBar, EmptyState, Skeleton, StatCard, Sparkline |
| Signal | StatusPill, StatusStripe, Badge, CountChip, Clock (TAT / grace / aging), ProgressRing, Tag |
| Surface | Card, Panel, Drawer, Modal, Popover, Tooltip, Tabs, Accordion, SplitView, Toast/Toaster |
| Nav | SideRail, NavSection, NavItem, Breadcrumb, PageHeader, ActionBar, RoleSwitcher |
| Type | Money, DateTime, RelativeTime, RecordId, MaskedValue, TruncatedText, KeyValueList |
| Media | Icon (SVG sprite — **no emoji, standing rule**), Avatar, BrandMark, DocThumb |

### Shared domain composites — `src/components/`

| Component | Job | Reused by |
|---|---|---|
| `AppShell` | Rail + main + drawer, density attribute, keyboard map. | Every authenticated route |
| `WorkQueue` | The list pattern: filter bar, dense table, severity stripe, bulk actions, row→drawer or row→route. One implementation, configured per module. | All 15 queue screens |
| `RecordTimeline` | Who did what when, on every record (U14). Reads the audit stream. | Policy, claim, customer, inquiry, endorsement |
| `SchemaForm` | Renders a form from a stored SKU schema: stages, branching, conditional visibility, reserved fields, draft-save, schema version pinning. | Policy entry, endorsement, claim intimation, KYC, inquiry |
| `BenefitMatrix` | Rows = mapped benefits, columns = companies, defaults pre-filled, ad-hoc row insert, per-column Final Premium via `RecordOnlyAmount`. | Quotation Composer |
| `DocumentViewer` | Paged preview in the drawer, Source Serif 4 letterhead surface, download/share gate. | 7 document types |
| `AssignmentTrail` | Assign → confirm → reassign → escalate history with clocks. | Inquiry, task, claim |
| `ChecklistPanel` | Per-company/product document checklist with collection mode. | Claim, KYC, policy docs |
| `ConsentBadge` / `MaskedField` | Consent state; Aadhaar last-4 only, never full, never exportable. | Customer, KYC, documents |
| `NotificationRail` | Proactive notices above the queue — the prototype's push behaviour, relocated. | Every role home |
| `AssistantPanel` | Cmd-K drawer; four request kinds; renders the block vocabulary in §10. | Global |

---

## 7. State architecture

| Layer | Holds | Mechanism |
|---|---|---|
| URL | Filter, sort, page, tab, selected record, drawer target. | React Router search params. A queue view is fully reconstructible from its URL. |
| Data | Every entity read. | Repository interfaces in `data/repo/` returning Promises, with a mock adapter behind them. Thin `useResource` hook in MVP; swap in TanStack Query when a real API lands. **No component imports a fixture directly.** |
| Session | Current user, active role, resolved permission set, density, theme. | Zustand slice, hydrated once at boot. Feeds `can()`. |
| Feature drafts | Composer working state, policy entry draft, notice batch review, claim checklist progress. | Zustand slice per feature + `localStorage` autosave keyed by entity id, so U6 draft-safety survives a session timeout. |
| Form | Field values, validation, dirty tracking. | react-hook-form + zod resolver. Schemas generated from SKU definitions at runtime. |

### Permissions are state, and they gate rendering

FR-01.2/.3 make roles a permission template plus an attribute scope; the Assistant's stated boundary is
*"it runs as you — an agent asking about a customer they did not source gets nothing back."* Both need
one evaluator:

```
can(action, resource, record?) → boolean

  action    'view' | 'create' | 'edit' | 'delete' | 'assign' | 'approve' | 'export'
  resource  module key
  record    optional — enables the ABAC scope test:
            own | team | all,  by company, category, sub-agent ownership
```

Every nav item, route guard, toolbar button, table column and bulk action reads through it. Sensitive-
data classes (health, KYC, financials) are a second axis: `canSeeClass()` drives `MaskedField`. **Build
both in M0** — retrofitting permission gating across 15 screens is the second-biggest avoidable cost
after table state.

### The Assistant reads a different shape of the data

Per §14.1, the Assistant never queries an entity. It queries `AssistantView<T>` — an allow-listed
projection carrying operational and contact fields, plus document *presence* flags, with sensitive
values and document contents absent by construction. Two rules make this hold:

- Assistant repository methods return projections only. There is no code path from the Assistant feature
  to an entity type.
- A CI test asserts, per entity, that the projection contains no field tagged `sensitive` or
  `document-content`. That test is the guarantee; the rest is convention.

This sits alongside `can()`, not instead of it. `can()` decides *which records* the Assistant may read as
this user; the projection decides *which fields* exist at all. Both are needed: an admin has permission
to see an Aadhaar number, and the Assistant still must not receive one.

### Events

The PRD's automation engine is an event bus (`policy.issued`, `inquiry.unconfirmed`,
`claim.status_changed`…). In the MVP, emit the same event names from a small in-memory dispatcher on
every workflow transition, and let mock recipes subscribe. Two things fall out free: the audit timeline
is just the event log, and when the real backend arrives the event names already match the FR contracts.

---

## 8. Domain model & mock data

Types first, fixtures second, screens third.

### P1 entity set

| Cluster | Entities |
|---|---|
| Identity | User, PermissionTemplate, AbacRule, Session, TwoFactorConfig, Team |
| Configuration | MasterType, MasterValue, ObjectDef, AttributeDef, FormSchema(+version), Recipe(+version), Template, IntegrationConfig, RetentionClass, **Disposition, InquiryStage** |
| Market | Company, CompanyContact, Product, CommissionRate, DocChecklist, BenefitItem, PolicyBenefitMap |
| Channel | **Agency**, AgencyPolicyScope, Agent, SubAgent, CommissionSplit |
| Demand | Inquiry, Quotation(+version), QuotationLine, Deal, DealLineItem, **RequirementRecord** |
| Customer | Customer, Household, Member, ChangeRequest, CustomerCredential, ConsentRecord |
| Contract | Policy(+PolicyVersion), PremiumRecord, PaymentRecord, CollectionRecord, DispatchRecord |
| Work | Task, WorkQueue, Draft, AuditEvent, **Activity** |
| Records | Document(+version), OcrTemplate, OcrExtraction, MessageLog |
| Money | CommissionRule, LedgerEntry |
| Assistant | AssistantThread, AssistantTurn, AssistantAction, ProactiveNotice · **`AssistantView<T>` projection (§14.1)** |
| Payment schedule | **PremiumSchedule, InstalmentDue, Mandate, MandateEvent** — types in M0, screens in P2 (D-A) |
| *P2 adds* | Claim, ClaimChecklist, ClaimQuery, SettlementRecord, RenewalTask, NoticeBatch, NoticeMatch, Endorsement |

### Premium schedules, mandates and grace — DECIDED (D-A): in scope, record-only

The prototype was right and the PRD had a gap: *"Twelve due dates and one expiry date are different
objects, and only one of them is currently tracked."* Four entities are added, with the **types written
in M0** so Policy and Renewal never need migrating, and the **screens built in P2** alongside renewals.

"We just save history" sets the boundary, and it is the same boundary as D3 everywhere else in this
platform — **the system records the money story, it never runs it.**

| Entity | Holds | Record-only boundary |
|---|---|---|
| `PremiumSchedule` | Mode (annual / half-yearly / quarterly / monthly), instalment amount, debit day, term, grace days for this mode. One per policy. | The instalment amount is **typed from the insurer's schedule** via `RecordOnlyAmount`. The platform never divides an annual premium by twelve — the prototype says this out loud and it stays true. |
| `InstalmentDue` | One row per expected payment: due date, amount, state, linked collection or reference. | Generated from the schedule as a set of dates. Amounts come from the schedule, never computed per row. |
| `Mandate` | e-NACH / NACH / standing instruction reference, bank, debit day, active window, who registered it. | **The platform never initiates a debit and never holds bank credentials.** The mandate is set up through the insurer's own link; we record that it exists. |
| `MandateEvent` | Each presentation outcome: date, result, insurer reason text. | Recorded from what the insurer or customer reports. No status is inferred. |

**Two clocks, not one.** A policy's expiry date and its instalment due dates are separate objects with
separate grace windows — monthly mode commonly carries 15 days against 30 on annual, and motor often
carries none. `GraceClock` and the renewal `ExpiryClock` are distinct components reading distinct
fields, and the renewals queue shows both kinds of item with a visible type distinction. A policy with
a due instalment is **in force and not expiring** — the queue must never imply otherwise.

**Behaviour retained from the prototype** (per the standing instruction to preserve its workflow logic):
a recorded mandate failure raises a same-day follow-up task inside the grace window, notifies the linked
agent, and surfaces as a proactive notice. That is task-raising and messaging — both things this platform
already does everywhere — not payment processing.

**Interpretation flagged:** "we just save history" is read as *record-only money, active workflow* —
we record the schedule, mandate and outcomes, and we still raise tasks and reminders off them. If you
meant a purely passive log with no tasks and no alerts, say so and I will drop the task-raising; it
removes about a third of the P2 work here and two of the prototype's six proactive notices.

### Money as a type

Record-only does not mean careless. Store every amount as **integer paise** in a branded `Money` type
with explicit currency, format at the edge only, give roll-ups a single addition function.
Floating-point rupees in a commission chain that splits three ways produce reconciliation mismatches
that look like business bugs.

### Dual numbering

Every numbered entity carries two optional fields from the first commit — `systemNo` (always present,
generated) and `insurerNo` (present when received). Format `INQ-1041`, `QTN-0332`, `APP-0774`,
`POL-DRAFT-0219`, `CLM-0412`, per the prototype. Render both through `<RecordId>` so the distinction is
visible everywhere.

### Fixture strategy

| Set | Volume | Purpose |
|---|---|---|
| Story records | ~35 hand-authored | The prototype's named cast — Rakesh Patel, Jayesh Kapadia, Nilesh Bhatt, Bhavesh Trivedi, Falguni Shah, Kiran Solanki, Priya Desai, Amit Rana, Sneha Patel. Every demo path in the 48 canvas scenarios must be walkable on these records; the client recognises them from the prototype walkthrough. |
| Volume records | ~300 customers, ~500 policies, ~800 tasks | Generated deterministically from a fixed seed. Makes U12's speed budgets (list < 2s) measurable, and exposes table virtualisation needs early. |
| Config seed | 8 companies, ~24 products, ~40 benefits, 4 agencies, 6 users | Real insurers already named in the prototype: HDFC Ergo, Niva Bupa, Bajaj Allianz, ICICI Lombard, Tata AIG, IFFCO Tokio, Royal Sundaram, LIC. |

Fixtures live behind the repository layer with simulated latency, so loading, empty and error states get
built rather than discovered in UAT.

---

## 9. Business workflow states

Every machine as a frozen `const` map plus a derived union — `enum` will not compile under
`erasableSyntaxOnly`. Guards listed are the PRD's acceptance criteria expressed as code.

### Inquiry — FR-06.3 · canvas n1–n8 · M0

```
new → assigned ─┬─ confirmed within TAT ──→ accepted (owner set, clock stops)
                ├─ TAT elapsed ──────────→ reassigned (next in category group) ──┐
                └─ no category match ────→ unrouted (admin alert)                │
     reassigned ── TAT elapsed again ──────────────────────────→ escalated ←─────┘
     accepted → converted (quotation opens) | lost
```
- Reassignment stays inside the same category group; escalation carries the full assignment history, not just the item.
- Unrouted is a visible state with an alert, never a silent drop.
- TAT duration is a recipe parameter, not a constant.

### Inquiry engagement — FR-06.12 to .19 · the gap between n8 and n9 · P1

The machine above ends at `accepted` and the quotation machine below begins with a customer and a
list of candidate policies already chosen. Between those two sentences somebody rings the customer,
finds out the family size, the ages, the budget and the existing cover, and agrees when to speak
next. None of that was modelled: `accepted` was a state an inquiry could sit in forever with no
record of a call, no callback, no reason and nothing that noticed.

**Task is future tense; Activity is past tense.** A Task says what must be done and is mutable until
it is complete. An Activity says what happened and is append-only. They are different objects and
neither substitutes for the other.

```
accepted ── log activity ──→ stage (master-driven, inside accepted)

  contacted ─┬─ interested ─────→ requirement_captured ──→ quoted → negotiating ─┐
             ├─ call back ──────→ follow_up_scheduled ──↺ (task + reminder)      │
             ├─ needs info ─────→ needs_info ───────────↺ (task + template)      │
             ├─ not reachable ──→ not_reachable (attempt n) ──→ dormant ──→ recycle
             ├─ wrong number ───→ data_issue (source quality flagged)            │
             └─ not interested ─→ lost (reason mandatory)                        │
                                              converted / lost ←─────────────────┘
```

- **Stages are configuration, not code.** `InquiryStage` rows carry `allowedFromKeys`,
  `requiresNextAction`, `countsAsOpen` and `terminal`; an admin edits them. The lifecycle machine
  above is untouched — a stage is a position *inside* `accepted`, and a stage move on an inquiry
  that is not accepted is refused.
- **The rules are data; the evaluation is one place.** `canEnterStage` in
  `src/domain/workflows/inquiryStage.ts` returns the same allow/refuse-with-a-sentence shape every
  machine returns, so a blocked stage move prints why instead of doing nothing.
- **Disposition drives the stage.** Logging an activity forces a disposition, and the disposition
  row names the stage it moves to, whether a next action is required, whether it increments the
  attempt counter and which template it suggests. The matrix is seeded config, not a switch
  statement.
- **No open inquiry may exist without a dated next action.** Logging an activity requires either a
  next action with a date or a terminal outcome. That single constraint is the difference between a
  CRM and a list, and it is what stops leads rotting.
- **Attempts and dormancy are recipe parameters, not constants** — `noContactDays` and `maxAttempts`
  on the `inquiry.dormancy` recipe, read the way the TAT is read today. A dormant lead recycles to
  the pool or a win-back list; Lost must not be its only exit or the win-back list is destroyed.
- **A call note is `document-content`.** A note on a health inquiry routinely carries a diagnosis, so
  the Assistant receives that and when contact happened, the disposition, the attempt count and the
  stage — never what was said (§14.1).

### Quotation — FR-06.5–.10 · canvas n9–n16 · M0

```
draft → composed → generated → shared ─┬─ revision requested → generated (v+1) ↺
                                       ├─ won  → Deal created
                                       └─ lost (reason mandatory)
```
- A revision requires a reason. Prior versions are immutable and remain viewable.
- Lost requires a reason — that mandatory field is what makes lost-reason reporting worth reading.
- Auto-share is a config fork, applying identically to generated and uploaded quotations.
- Final Payable Premium must be present per column before generate. It is typed, never computed.

### Deal → Policy — FR-06.11, FR-10.1 · canvas n16–n25 · M0

```
Deal:   created → line_items_set → consumed
Policy: draft → proposal → sent → issued | declined
                                    ↓
                          dispatch → documents → closed (retention lock, 10 yr)
```
- A deal with zero line items is blocked with a clear message.
- Issue is gated on KYC complete **and** a non-empty Final Premium. Components stay optional.
- Direct-entry path skips proposal for already-issued policies.
- Placement offers only companies and products inside the selected agency's scope.
- A closed policy past its retention class locks; it is never hard-deleted.

### KYC & consent — FR-09.3, .9 · canvas n17–n19 · M0

```
pending → partial ─┬─ staff completes ──────┐
                   └─ consent link filled ──┴→ complete → credentials generated + sent
```
- Aadhaar is masked to last-4 on extraction. No screen and no export ever shows the full number.
- The consent link is tokenised, expiring, login-free, and carries no session.
- Completion fires the credentials recipe automatically — not a manual step.

### Payment & collection — FR-10.4, FR-12.9 · canvas n20–n23 · P1

```
fork ─┬─ direct_to_company → reference recorded (no agency books)
      └─ via_agency → recorded → verified (back-office)
                        └─ cheque → bounced → follow-up task auto-created, collection reopens
```
- Record-only. No receipt slip is issued by the platform.
- On-field collections require back-office verification before the item can close.

### Claim — FR-11 · canvas n37–n50 · P2

```
raised ── policy inactive ──→ blocked (agent notified)
       └─ policy active ───→ intimated (system claim no. + insurer email, CC agent)
              → picked_up (claims team owns; sales agent informed, not owner)
              ├─ cashless → upload_link_sent → summary_received → tracked
              └─ file → checklist_raised → docs_collected (self | on-field pickup)
                     → filed_with_insurer ⇄ query_open (multi-language loop) ↺
                     → settlement_recorded → closed
```
- Close requires both a settlement record and a company remark. The remark feeds the insurer rating.
- Settlement amount and deduction are typed from the insurer's advice — never derived.
- Every status change fires a customer message, unless the agent's direct-updates toggle is OFF, in which case it routes to the agent and the reroute is logged.

### Renewal & notice batch — FR-12 · canvas n26–n36 · P2

```
Renewal: scheduled (expiry − N) → in_pool → assigned (self) → reminded ×n
         → renewed (new term, new PDF version, commission recalc) | lapsed → win_back_list
Batch:   uploaded → ocr_running → review ─┬─ matched ──→ sent (per-customer PDF + renewal request)
                                          └─ unmatched → manual link | reject
```
- An unmatched row cannot be included in a bulk send. Hard block, not a warning.
- Backdating is permitted but logs actor, timestamp, original date and reason.
- Reminders carry year-wise amounts and offers, enriched by the matched notice.

### Premium schedule & mandate — D-A · prototype `r_instal` / `r_mandate` / `r_grace` · P2

```
Schedule:  created (mode + instalment amount typed from insurer) → active → completed | superseded

Instalment: scheduled → due ─┬─ paid (mandate debit recorded | collection | direct reference)
                             └─ missed → in_grace ─┬─ paid_in_grace → back to schedule
                                                   └─ grace_expired → policy at risk → lapsed

Mandate:   registered → active ─┬─ debit_success  (MandateEvent)
                                ├─ debit_failed   (MandateEvent) → follow-up task, agent notified
                                └─ cancelled | expired
```
- The instalment amount is typed, never derived from the annual premium.
- The platform records mandate outcomes; it never initiates a debit and never stores bank credentials.
- Grace days come from the schedule's mode, not from a constant. Monthly is commonly 15 days against 30 on annual; motor is commonly zero.
- An instalment due date is not a renewal date. A policy with a due instalment is in force and not expiring, and the renewals queue must show the two as visibly different kinds of item.
- What is at risk on a missed instalment is continuity — sum insured, No Claim Bonus, waiting periods already served. That is the real cost and it belongs in the customer message, not just the amount.
- Two failures inside three months is a pattern worth surfacing to the agent, per the prototype.

### Endorsement & cancellation — FR-13 · canvas n51–n56 · P2

```
type_selected ─┬─ non_financial → correction fields only (no premium block)
               ├─ financial → delta entry → commission delta hook
               └─ cancellation → claims-in-period check ─┬─ claim found → refund_not_eligible
                                                         └─ clear → refund typed (insurer figure)
       → submitted → approved → policy_versioned (immutable, both endorsement nos., new PDF)
```
- The claims-in-period check runs against the platform's own claim data and returns instantly.
- Non-financial types must render no premium fields at all.
- A change too large for endorsement triggers a guard suggesting fresh issue.

### Commission chain — FR-07.3a, FR-14.9 · canvas n57–n59 · P1

```
trigger: policy.issued | renewal.completed | endorsement.approved (delta)

  payer (company on own code | broker as vendor channel)
    → Jagad pay-in   = agency % (per company × policy, on the Agency record)
      → agent cut    = agent %
        → sub-agent share = carved from the agent's own cut, admin cap enforced
    → ledger entries at every level → net profit
```
- An Individual agency locks to exactly one company; Broker allows many.
- A share above the configured cap is blocked; with no cap set, any share within the agent's own % is accepted.
- Wallets exist for sub-agents only. A broker is a payer, never a payee and never a user.
- The Assistant reads this ledger and never writes to it, from any role including admin.

---

## 10. Prototype reuse map

The HTML files are the **behavioural specification**. They are not the styling specification, and none
of their code ships.

### Keep as reference — rebuild properly in React

| From the prototype | What it teaches | Becomes |
|---|---|---|
| Three-region shell | Rail / main / resizable drawer, max-toggle, Escape-to-close. Proportions are right and staff-tested. | `AppShell`, `Drawer` |
| `NAV` map (6 roles) | The information architecture — which modules each role sees, grouped and counted. The most valuable single object in the file. | `app/navigation.ts`, permission-gated |
| Block vocabulary `para · rows · table · kv · act · choice · file · stop · note` | A complete, disciplined set of ways to present a business answer. Nine block types cover 75 scenarios — a well-designed vocabulary that maps one-to-one onto components. | `TextBlock`, `SignalList`, `DataTable`, `KeyValueList`, `ConfirmGate`, `ChoiceGate`, `DocumentCard`, `RecordOnlyAmount`, `NoteBlock` |
| `.row .mk` severity stripe (hot/warm/cool/good) | A four-level attention language readable at a glance without text. Retain the mechanic; remap the colours to §2 tokens. | `StatusStripe` |
| `PUSH` proactive notices | The product's best idea: the system raises what nobody asked about, and says why. Preserve the "noticed just now" framing and the stated reason. | `NotificationRail` |
| The `stop` block | Refusing to fill the premium, in the UI, with an explanation. D3 made visible — should survive verbatim in behaviour. | `RecordOnlyAmount` |
| `NEVER` — six boundaries | Product constraints stated as features. Encode as tests, not copy. | Test suite + review checklist |
| `KINDS` — four request types | Ask / Analyse / Act / Produce, each with its own affordance and confirmation posture. | Assistant intent taxonomy |
| 7 `DOCS` layouts | What each module produces on letterhead, including the client's reference quotation header (persons, DOBs, PORT, floater). | Document templates, Source Serif 4 |
| Named cast & scenarios | A coherent demo narrative the client has already seen. | Fixtures (§8) |

| From the workflow canvas | What it teaches | Becomes |
|---|---|---|
| 9 lanes × 8 columns | Who does what, in what order, across the whole business. The canonical process map. | Route-map ordering and module boundaries |
| 78 nodes | An inventory of every distinct system state and human step, including the error and loop states most specs omit. | Screen and state checklist — every node maps to a screen, a state, or a transition in §9 |
| Column 0 — 12 config groups | The complete admin surface, richer than the PRD's own bird's-eye. | The 10–12 `/config` routes |
| Scenarios tab — 48 G/W/T rows | Executable acceptance criteria covering happy paths, edges and error states. | Route smoke tests + component stories, one per row |
| Auto / decision / error / loop node types | Which steps are automated, which fork, which fail, which repeat. Informs where `ConfirmGate` is and is not required. | Recipe seed list |

### Do not carry over

| Thing | Why |
|---|---|
| The entire colour set (`--act:#2f6ba8`, `--doc:#6b5bb0`, `--side:#fbfbfa`) | Replaced wholesale by the Jagad tokens in §2. No prototype hex survives. |
| Inter as the UI face | Replaced by IBM Plex Sans — better figure clarity in the dense tables this product is made of. |
| Chat-first home | Contradicts U1. See §3 and decision D-G. |
| `KEYS` regex intent matcher | A demo device for a fixed script. Replace with a typed intent registry, or drop the free-text box until a real backend exists. |
| Hardcoded content in `C{}` / `ROLES{}` | Becomes fixtures behind the repository layer. |
| `innerHTML` string templating | Becomes JSX. Every one of these is an injection surface once real customer data flows through it. |
| Module-scope mutable state (`cur`, `seq`, `view`, `made`, `pushed`, `drawW`) | Becomes store slices (§7). |
| Inline `onclick="fn('id')"` | Becomes props and handlers. |
| Canvas pan/zoom/minimap engine | Not a product feature. The canvas stays a standalone reference document, maintained alongside the code, not ported into it. |

**Standing rule, carried forward:** no emoji in any deliverable or in the product. Icons are SVG, from a
single sprite. The prototype already complies and its icon set is a reasonable starting inventory.

---

## 11. Scope boundary

### 11.1 Web now, mobile app later — DECIDED (D-I)

**No mobile app is built in this MVP. Web only.** The finished product has three mobile apps in it
(PRD NFR §11 names them); none is in this plan, and none should be estimated as part of it.

| Audience | Their channel in the finished product | Built now? | What they get in the MVP instead |
|---|---|---|---|
| Admin · Sales Manager · Back-office · Claims · Renewals | Desktop web | **Yes — in full** | The ERP. This is the MVP. |
| Agent | Web at the desk, mobile in the field | **Yes — web** | Agent screens inside the same web app |
| Sub-agent | **Mobile app** — inquiry capture, own leads/customers, wallet | **No app** | Responsive web on the same routes, so the M0 field-capture path is demonstrable end to end |
| On-field | **Mobile app** — pickup/collection tasks, doc scan, payment entry | **No app** | Responsive web for pickup and collection tasks (P1/P2) |
| **Customer** | **Mobile app** — policies, documents, claim raise and track | **No app** | Two web surfaces, below |

#### The customer surfaces that do ship — and why they are not the app

This is the distinction that matters most, because M0 is blocked without the first one.

| Surface | What it is | Ships |
|---|---|---|
| `/consent/:token` | A **login-free, expiring web page** the customer opens from a WhatsApp message on their phone. They fill in sensitive health data and give consent. No session, no account, no app. | **M0** — KYC cannot complete without it |
| `/upload/:token` | The same mechanic for a cashless claim's discharge summary (FR-16.8, D21). One tap from the link. | **P2** |
| `/portal/*` | A thin responsive web portal — policies, documents, transactions. The browser fallback and the "what does the customer see" view for staff. | **P1**, read-only |

A tokenised link is **not** a stripped-down app. It is the deliberate design in FR-09.9 and D21: the
least possible friction at the moment a customer is standing in a hospital corridor. It stays a web page
even after the app exists.

#### What the MVP must do so the apps are cheap to build later

The apps are a separate project with their own estimate. This MVP's job is to not make them expensive:

- `domain/` and `data/` contain **no DOM and no React** — types, workflow machines, guards, `can()`,
  `Money`, repository interfaces. A React Native app imports them verbatim.
- `ui/` may not import from `domain/`, `components/` or `features/` (the rule already in §6). That is
  the seam where a native component layer substitutes in.
- Every screen the future apps need has its data shaped by a **repository method**, never assembled
  inside a component — so the app calls the same method against the real API.
- The API contracts the web consumes are the contracts the apps will consume. One backend, three
  clients.

**Explicitly not in this plan, and not costed anywhere in it:** React Native setup, app-store release,
push notifications, device camera and document scan, and offline sync for on-field staff. Offline sync
in particular is a genuinely hard problem — conflict resolution on collection entries recorded without
signal — and it should not be assumed to fall out of a responsive web build.

### 11.2 Phases

PRD Phase 1 is fifteen modules. That is a release, not a first increment. This plan inserts a thinner
slice in front of it.

### M0 — the vertical slice

**One golden path, end to end, on real workflow rules:** land on the Assistant and read your queue
briefing → configure a company, a product, a benefit map, an agency and an agent → capture an inquiry →
route it with a TAT clock → build a side-by-side quotation in the Composer → revise it with a reason →
mark it Won → complete KYC through the consent link → issue credentials → enter the policy from the
deal's line items → upload the policy PDF → **POLICY LIVE** → see the commission chain calculate.

That single path exercises the design system, the shell, the Assistant landing view, the permission
evaluator, the SKU form engine, all three guardrail components, five workflow machines and the event
bus. Everything after M0 is addition rather than invention — which is the point of doing it first.

| Phase | Contains | Deliberately excluded |
|---|---|---|
| **M0** Vertical slice | Design system + shell + permission evaluator · **Assistant shell: landing briefing, suggestion chips, Ask cards over the user's own queue (D-G/D-H)** · config for users, masters, companies, products, benefits, agencies, agents · Inquiry · Quotation Composer · Deal · Customer 360 · KYC + consent link · Policy entry & issuance · commission calculation (view only) · the three guardrail components · **premium-schedule and mandate types (D-A — types only, no screens)** · mock repository + fixtures | Claims, renewals, endorsements, bulk OCR, the customer portal, reports beyond a stub |
| **P1** Operate the core | Everything in PRD P1: SKU form builder UI · collections + cheque bounce · issuance queue · OCR single-doc review · task engine with push/pull queues · templates & comms · integrations config · automation recipe parameters · compliance spine (consent ledger, retention, audit search) · document vault · core dashboard · customer portal web view · **Assistant: Analyse, Act with confirm gates, Produce (FR-22, §14)** | Visual recipe builder, payout cycles, wallets, deep analytics |
| **P2** Service the book | Claims full lifecycle · renewals incl. bulk notice ingest · **premium-schedule, instalment and mandate screens (D-A)** · endorsements & cancellation · vault-full and OCR everywhere · multi-language content · tokenised upload link · registers | — |
| **P3** Optimise | Commission full: payout cycles, sub-agent wallets, reconciliation, GST export · visual recipe builder, versioning, test mode · deep analytics · full customer self-service · Assistant free-text intent | — |
| **Post-MVP** Separate project | The three mobile apps (customer, sub-agent, on-field) — §11.1 | Not costed in this plan |

### Out of scope in every phase

Carried from PRD §4, restated because the prototype blurs two of them (see D-F): no premium rating or
calculation engine · no claim adjudication · no mutual funds · no insurer-portal or Bima Sugam API ·
no bulk historical migration · no multi-tenant runtime.

---

## 12. Decisions

### RESOLVED — the entity model is unblocked, B1 can start

**D-A — Premium instalments, mandates and grace periods: IN SCOPE, record-only.**
"Yes, we just save history." Four entities added (`PremiumSchedule`, `InstalmentDue`, `Mandate`,
`MandateEvent`), **types written in M0** so Policy and Renewal never need migrating, **screens in P2**
alongside renewals. The boundary is the same D3 boundary as everywhere else: the platform records the
money story, it never runs it — instalment amounts are typed from the insurer's schedule, no debit is
ever initiated, no bank credentials are held. Full design in §8; state machine in §9.
*One interpretation flagged there: I read "save history" as record-only money with active workflow —
we still raise tasks and alerts off a recorded mandate failure, as the prototype does. If you meant a
purely passive log, say so and I will drop the task-raising.*

**D-G — AI Assistant at the top, as the HTML has it.**
First item in every role's nav rail and the landing view, matching the prototype exactly. The apparent
U1 conflict dissolves once you notice the prototype's opening turn *is* a queue briefing — so the
landing view is the work summary U1 asks for, delivered conversationally, never a blank prompt. Queues
sit one nav section below and one suggestion chip away. Full design in §3.
**Consequence:** the Assistant moves from P1 into M0. It is the first thing anyone sees, so it cannot be
deferred.

**D-H — The Assistant is part of the product.**
It therefore needs requirements, and PRD v0.4.1 has none for it. **FR-22 is drafted in §14** — 12
requirements covering the four request kinds, the six boundaries as enforceable rules, proactive
notices, document production and audit attribution. It needs inserting into the PRD before the
walkthrough, and it raises **one compliance question nobody has answered yet** — see §14.

**D-I — Customer is on a mobile app; MVP is web only.**
No mobile app is built in this MVP. Three apps exist in the finished product (customer, sub-agent,
on-field); none is in this plan or costed by it. What ships for customers is the two tokenised
login-free web links (`/consent/:token` in M0, `/upload/:token` in P2) plus a thin read-only web portal
in P1. **Full web-versus-app boundary in §11.1** — including what the MVP must do so the apps are cheap
to build later, and what is explicitly not costed anywhere (React Native setup, push, device scan,
offline sync).

### Still open — document defects, fix before the walkthrough

**D-B — FR-16.8 is still missing from the docx.** FR-16 stops at `.7` in both §8.16 and Appendix B. The
capability is specified three times elsewhere (FR-11.1, D21, the FR-21.2 recipe list), so it is a
traceability hole in Document Vault rather than a scope hole. Flagged twice, still unpatched. It *is*
present in the requirements package.

**D-C — Appendix A has claims and endorsements swapped.** Row 10 (Claim management) points at §8.13; row
11 (Endorsement) points at §8.11. Claims is §8.11, Endorsement is §8.13. This is the client-facing
traceability table.

**D-D — §16 P1 scope names the wrong module.** "Commission core (FR-15)" — FR-15 is the Task & Activity
Engine; Commission is FR-14. Two errors from one slip: the wrong module is named, and the Task &
Activity Engine, whose FRs are all P1 and on which every queue in this plan depends, is not named in the
P1 list at all.

**D-E — Which scenario set is the acceptance-test source of truth?** Canvas has 48 rows across 7 flows;
PRD has 43 across 6 heart workflows. The canvas adds an Admin Configuration flow the PRD lacks, and
per-flow counts differ (quotation 8 vs 9, claims 9 vs 8).
→ **Recommendation:** canvas, as the later and broader artifact — then backport the five extra rows into
the PRD so the two agree.

**D-F — The prototype demonstrates two explicitly deferred capabilities.** `c_summ` reads "14 documents
read" and produces a claim summary — that is claim-document summarisation. `g_gap` surfaces coverage
gaps — that is cross-sell. PRD §2.3 places both in "future roadmap (out of scope now)". The prototype
hedges defensibly ("read from records already on file, nothing here is guessed" — rules over records,
not a model), but that distinction will not survive a client walkthrough.
→ **Decision needed:** move the §2.3 line, or relabel the two cards.

### Technical calls taken in this plan — override if you disagree

| # | Call | Reasoning |
|---|---|---|
| D-J | ~~Web-only for MVP~~ — **superseded by D-I, which confirms it.** See §11.1 for the full boundary. | — |
| D-K | Money is integer paise in a branded type; formatted only at the edge. | A three-way commission split on floating-point rupees produces reconciliation mismatches that read as business bugs. |
| D-L | CSS Modules over Tailwind. | The token file is a deliverable and must be auditable and re-themable per agency (D1, R-4). Tailwind is a fine substitute if the same tokens drive it. |
| D-M | Mock data behind repository interfaces, not imported directly. | Swapping to a real API becomes one adapter file. Also forces loading, empty and error states to be built rather than discovered in UAT. |

---

## 13. Build sequence

Ordered by what unblocks what. No dates — durations after estimation, per CON-1.

| Step | Work | Unblocks |
|---|---|---|
| B1 | Strip the Vite starter. Add dependencies. Land `tokens.css`, reset, type scale, icon sprite, brand mark. Lint rule rejecting hex outside tokens. | Everything visual |
| B2 | `domain/`: entity types **with a `dataClass` tag on every field**, workflow machines as frozen const maps, guards, `Money`, `can()`, event dispatcher. **No React in this step.** | All logic; testable alone |
| B3 | `data/`: repository interfaces, mock adapter with simulated latency, config seed + story cast + generated volume. | Every screen |
| B3a | **`AssistantView` projection + the CI boundary test** (§14.1). Allow-listed; sensitive fields absent by construction. | The Assistant shell — nothing assistant-facing is safe to build before this |
| B4 | `ui/` primitives, starting with DataTable, StatusPill, StatusStripe, Field set, Drawer. Storybook or a route-based gallery. | All composites |
| B5 | The three guardrail components, with tests asserting each refusal. | Composer, policy entry, every Act |
| B6 | `AppShell`, navigation config (Assistant first, D-G), role guards, role switcher, `WorkQueue`. | Every route |
| B6a | **Assistant shell**: landing route, queue briefing from live counts, suggestion chips, block renderer, `NotificationRail`. Ask cards only — no Act yet. | The landing view; nothing is reachable without it |
| B7 | Config screens: companies, products, benefits + policy→benefit map, agencies, agents, users. | M0 golden path needs data to exist |
| B8 | Inquiry → routing → TAT → escalation. | First live workflow machine |
| B9 | `SchemaForm` renderer (consuming stored schemas; builder UI comes in P1). | Policy, endorsement, claim, KYC |
| B10 | **Quotation Composer** + `BenefitMatrix` + versions + Won/Lost + Deal. | The client's headline change |
| B11 | Customer 360, KYC, **`/consent/:token` login-free page** (mobile-web, no session — §11.1), credentials. | Issuance gate |
| B12 | Policy entry from deal, premium roll-up, issuance, document upload, POLICY LIVE. | Closes M0 |
| B13 | Commission chain calculation + read-only ledger view. | M0 complete — demo-ready |
| B14 | Route smoke tests written from the 48 canvas scenarios. | UAT evidence |

**What M0 proves.** At B13 the client can be walked from an empty system through configuration to a live
policy with a calculated commission, in the new Jagad identity, with every guardrail visibly working.
That is the walkthrough M1 was always supposed to be — run on software rather than on a canvas.

---

## 14. FR-22 — AI Assistant (draft, for insertion into the PRD)

D-H makes the Assistant a committed product feature. PRD v0.4.1 has no requirement covering it — it is
not among the 153 FRs, not in the phase plan, not in the compliance register, and not estimated. This is
the missing block, written in the PRD's own format so it can be pasted into §8 as module 22 and into
Appendix B.

**FR-22 — Every staff member's entry point: a role-scoped assistant that reads the system as them,
changes it only with confirmation, and raises what nobody asked about.**

| FR ID | Feature | MoSCoW | Phase | Depth |
|---|---|---|---|---|
| FR-22.1 | Landing view per role: opens with a generated briefing of that user's own queue from live counts — never a blank prompt. First item in the navigation rail. | M | P1 | Full (M0) |
| FR-22.2 | Four request kinds, each tagged in the response: **Ask** (retrieve), **Analyse** (explain a movement from the ledgers), **Act** (change something), **Produce** (generate a document). | M | P1 | Ask M0; rest P1 |
| FR-22.3 | **Runs as the requesting user.** Every read and every write passes through the same RBAC/ABAC evaluator as the UI (FR-01.2/.3). No elevation, ever. An agent asking about a customer they did not source gets nothing back. | M | P1 | Full |
| FR-22.4 | **Confirmation gate on every Act**: shows the intended change before it happens; Cancel writes nothing; Confirm emits the mutation and records it as user-initiated with assistant attribution. | M | P1 | Full |
| FR-22.5 | **Money boundary**: never produces, suggests, computes or estimates a premium, settlement, refund or endorsement delta. Never writes to the commission ledger, from any role including admin. Reads and analyses only. | M | P1 | Full |
| FR-22.6 | **OCR boundary**: cannot confirm an extracted value on a person's behalf, and cannot include an unmatched row in a bulk send. | M | P2 | Full |
| FR-22.7 | **Claim boundary**: never decides, predicts or scores a claim outcome. Coordinates, records and chases only — the insurer and TPA decide. | M | P2 | Full |
| FR-22.8 | Proactive notices: threshold-triggered, per role, each carrying the reason it was raised ("raised because both passed the aging threshold overnight, not because anyone asked"). Deduplicated, dismissible, logged. Mirrored into the queue screens' notification rail. | M | P1 | Full |
| FR-22.9 | Document production: generates the configured document types from data already in the system, on agency letterhead. Nothing sends without confirmation. | M | P1 | Full |
| FR-22.10 | Context binding: opened from a record it carries that record as context; summonable from any screen by keyboard shortcut. | S | P1 | Full |
| FR-22.11 | Audit attribution: every assistant interaction records the request, the user, the records read and any mutation emitted — into the same append-only store as FR-20.4. | M | P1 | Full |
| FR-22.12 | Conversation retention: transcripts contain personal data and carry a retention class like any other record. Not indefinite, not exportable outside the user's own scope. | M | P1 | Full |
| FR-22.13 | **Operational Data Layer**: the Assistant reads from an allow-listed projection of the domain, never from entities directly. Business and workflow state only. Sensitive values and document contents are absent from the projection — not filtered out of the response, absent from the query. | M | P1 | Full (M0) |
| FR-22.14 | **Document presence, never document content**: the Assistant sees that a document exists, its type, its submitted and verified state — never the file, never its OCR-extracted text, never an identity or bank number in any form including masked. | M | P1 | Full (M0) |
| FR-22.15 | **Health data is out of scope by default**: raw medical documents, health declarations and diagnosis fields are excluded from the projection. Any exception requires a separately approved requirement and its own consent basis. | M | P1 | Full (M0) |

**Entities** — Owns: `AssistantThread`, `AssistantTurn`, `AssistantAction`, `ProactiveNotice`.
Refs: all (read, scope-filtered).
**Config** — L1: proactive thresholds per role, enabled request kinds per permission template, retention
class for transcripts. Fixed: the boundaries in FR-22.3–.7.
**Depends on** — FR-01 (permissions), FR-15 (queues), FR-17 (templates), FR-20 (audit, retention,
consent), FR-21 (event bus).

**Acceptance criteria**
- A sub-agent asking about another sub-agent's customer receives nothing, and the refusal is logged.
- Cancelling an Act leaves no record changed and no message sent.
- No prompt, phrasing or role can make the assistant output a premium or settlement figure it was not given.
- Every proactive notice states why it fired.
- Every assistant-originated mutation is traceable in the audit log to a user and a confirmation.

### 14.1 Assistant data access scope — DECIDED

> *"The Assistant should understand the business state and workflow, not the underlying sensitive
> document data. It should operate on a controlled, permission-filtered operational data layer rather
> than having unrestricted access to the customer's complete record."*

This is the right shape, and it is enforceable — but only if it is built as a **data boundary**, not as
an instruction to the model.

**The non-negotiable engineering point:** telling a model not to reveal an Aadhaar number is not a
control. Prompts are not permissions. The only durable enforcement is that **the sensitive value never
enters the context in the first place** — the Assistant queries a projection that does not contain the
field, so there is nothing for any phrasing, role or jailbreak to extract.

#### Four data classes

Every field on every entity carries a class. This extends FR-01.4's sensitive-data classes rather than
inventing a parallel scheme.

| Class | Contains | Assistant sees | Staff UI sees |
|---|---|---|---|
| **Operational** | Policy, product, company, status, premium amount, payment history, expiry, renewal state, claim status and workflow stage, quotation and deal data, assigned agent/sub-agent, tasks, request history, member composition | Full value | Full value |
| **Contact** | Customer and member name, mobile, email, address, DOB, relationship | Full value — the Assistant cannot identify a record or draft a message without it | Full value |
| **Sensitive value** | Aadhaar number (**including the masked last-4**), PAN number, bank account, IFSC, health declaration answers, diagnosis | **Status flag only** — `submitted`, `verified`, `pending`. Never the value, in any form | Masked / permission-gated per FR-01.4 |
| **Document content** | File binaries, images, PDFs, OCR-extracted text, medical reports | **Metadata only** — type, submitted date, verified-by, review state | Per document ACL (FR-16.7), every open logged |

Worked example, exactly as specified:

```
Assistant receives:            Assistant never receives:
  Aadhaar    Submitted ✓         Aadhaar Number  XXXXXXXX1234
  PAN        Submitted ✓         PAN Number      ABCDE1234F
  KYC        Completed ✓         aadhaar-front.pdf
  Health cover · HDFC Ergo       discharge-summary.pdf
  Premium ₹18,200 · paid         health declaration answers
  Renews 12 Mar 2027             diagnosis / medical condition
  Claim CLM-0412 · with insurer
```

Note that the masked form is denied too. Staff with the grant see last-4 in the UI; the Assistant sees
neither. That is stricter than FR-01.4 and it is the correct default — a masked identifier is still an
identifier for correlation purposes.

#### How it is built

Three layers, in ascending order of how much they actually protect:

1. **Field classification on the domain model** — a `dataClass` tag on every field, colocated with the
   type definition so it is impossible to add a field without classifying it.
2. **An allow-listed projection** — `data/assistant/projection.ts` builds `AssistantView<T>` from an
   explicit **allow-list**, never a deny-list. A deny-list means one forgotten field is a leak; an
   allow-list means a forgotten field is merely missing. The Assistant's repository methods return only
   projections; it has no route to an entity.
3. **A boundary test suite in CI** — for every entity, assert the projection contains no field tagged
   `sensitive` or `document-content`. This is what keeps the guarantee true as the schema grows over
   P1, P2 and P3, long after everyone has forgotten this conversation.

Layer 3 is the one that matters in eighteen months. Build all three in **M0**, alongside `can()` — the
projection and the permission evaluator are the same kind of object and should ship together.

#### Two consequences worth knowing before the walkthrough

**This retires the claim-summarisation half of D-F, correctly.** The prototype's `c_summ` card is
labelled *"14 documents read"* and outputs *"Dengue with thrombocytopenia. Four nights, no ICU."* That is
raw medical document content and this scope rule now forbids it. It was already deferred by PRD §2.3, so
the two decisions agree — but the card must come out of the prototype before the client sees it, or be
rebuilt to summarise only the **operational** claim state: type, hospital, dates, claimed amount,
insurer position, what is outstanding. That reduced version is genuinely useful and stays in scope.

**`g_query` gets narrower.** Drafting a reply to an insurer's clinical query needs the clinical detail.
The Assistant can draft the frame — reference numbers, dates, what the insurer asked, the covering
language in Gujarati/Hindi/English — and the claims handler supplies the medical substance. Worth
setting that expectation now, because the prototype shows it as a complete draft.

**`g_gap` survives unchanged.** Coverage-gap detection reads household composition and vehicle records —
operational data. Only the PRD §2.3 wording still needs moving for it (D-F's other half).

### The compliance question — substantially reduced, not closed

The scope decision in §14.1 removes the sharpest edge: **no health data and no identity documents reach
the model.** That is the single biggest risk reduction available, and it makes the vendor conversation a
normal one rather than a difficult one. Two things still need an answer, and they still carry vendor lead
time.

| Still open | Why the scope decision does not close it |
|---|---|
| **Data residency** | IRDAI's Maintenance of Information Regulations 2025 require regulated records *"stored solely in India"*, and the NFR commits to India-region hosting. Customer names, policy numbers, premium amounts and claim states are still **regulated records** even though they are not sensitive personal data. If they reach a model API outside India, the commitment is still broken — just less badly. Needs an India-region endpoint, or an explicit legal position on why inference is not storage. |
| **Processor contract** | Name, mobile, address, DOB and policy holdings are personal data under DPDP regardless of sensitivity. A model vendor processing them on the agency's behalf is a Data Processor, needs a contract in the **FR-20.6 registry** — which today lists BSP, SMS, SMTP and OCR but no model vendor — and needs coverage in the itemised consent notice under FR-20.1. |

Neither is a blocker for M0, because M0 runs on mock data. Both must be settled before the Assistant
touches a real customer record, which means before P1 go-live. **Add them to the open-questions register
as OQ-7 (model vendor + residency) and OQ-8 (model processor contract + consent notice wording)**,
alongside OQ-1 (OCR) and OQ-2 (BSP).

The build stance is unchanged and now cheap to hold: **the Assistant sits behind an adapter**, exactly
as OCR and WhatsApp do. Residency and vendor are then configuration questions answered at deployment,
not architecture questions answered in code — which is also what D1 config-portability requires if a
second agency is ever deployed in a different posture.
