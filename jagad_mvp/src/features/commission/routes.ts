import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because a file that exports both
 * components and anything else loses fast refresh (the repo's lint rule enforces
 * it). The shell already wraps its outlet in `<Suspense>`, so this needs no
 * boundary of its own.
 *
 * One address only. `/commission/ledger` and `/commission/payouts` are P3 in §4
 * and stay stubs: a payout is a movement of money out of the agency, and this
 * step deliberately builds nothing that can move any.
 */
export const CommissionRoute = lazy(() => import('./CommissionScreen'))
