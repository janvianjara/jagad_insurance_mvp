import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so this needs no boundary of its own.
 *
 * There is no `/back-office/kyc/:id`: §4's route map has one KYC address, and a
 * row opens the customer's own file at `/customers/:id?tab=kyc`.
 */
export const KycQueueRoute = lazy(() => import('./KycQueueScreen'))
