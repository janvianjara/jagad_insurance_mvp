import { lazy } from 'react'

/**
 * The module's three route elements, split out of their screens.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so these need no boundary of their own.
 */
export const RenewalPoolRoute = lazy(() => import('./RenewalPoolScreen'))
export const RenewalInstalmentsRoute = lazy(() => import('./InstalmentScreen'))
export const RenewalDetailRoute = lazy(() => import('./RenewalDetailScreen'))
