import { lazy } from 'react'

/**
 * The module's three route elements, split out of their screens.
 *
 * `lazy` lives here rather than in the router because a file that exports both
 * components and anything else loses fast refresh (the repo's lint rule enforces
 * it). The shell already wraps its outlet in `<Suspense>`, so these need no
 * boundary of their own.
 *
 * Three addresses, three questions, and none of them a filtered copy of another:
 *
 *   `/commission`          what did the book earn, and how - the summary
 *   `/commission/ledger`   which line, on which policy, at which rate - the evidence
 *   `/commission/payouts`  who is owed what, for which month - the cycle
 *
 * The payout screen is where the module's one outward act lives, and it is gated.
 * The other two hold no control that writes, which is §9's rule about this ledger
 * made structural rather than merely observed.
 */
export const CommissionRoute = lazy(() => import('./CommissionScreen'))
export const CommissionLedgerRoute = lazy(() => import('./LedgerQueueScreen'))
export const CommissionPayoutsRoute = lazy(() => import('./PayoutQueueScreen'))
