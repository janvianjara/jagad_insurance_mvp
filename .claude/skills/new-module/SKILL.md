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
