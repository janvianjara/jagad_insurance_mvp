import { lazy } from 'react'

/**
 * The wallet's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because a file that exports both
 * components and anything else loses fast refresh, and the repo's lint rule
 * enforces the split. The shell already wraps its outlet in `<Suspense>`.
 *
 * One address. A wallet is one person's own statement, so there is nothing under
 * it to route to: the detail of a line opens in place, one tap in.
 */
export const WalletRoute = lazy(() => import('./WalletScreen'))
