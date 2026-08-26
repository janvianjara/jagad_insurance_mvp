---
name: verify
description: Run the Jagad MVP gate suite (build, lint, tests incl. Assistant boundary, token check) and report a pass/fail table. Use at session start, before every commit, and whenever asked to verify or check the build.
---
From `jagad_mvp/` run, in order: `npm run build` · `npm run lint` · `npm run test` ·
`node scripts/check-tokens.mjs`.
Report ONE table: gate | pass/fail | first error line if failed.
If a gate fails: fix only when the cause is inside the current step's scope; otherwise report and
stop. Never declare a step done on a red gate. Never skip, disable or quarantine a test to get green.
