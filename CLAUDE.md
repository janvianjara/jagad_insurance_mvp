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
