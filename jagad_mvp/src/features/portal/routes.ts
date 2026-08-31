import { lazy } from 'react'

/**
 * The customer portal's route elements — and the seam that makes §11.1 and
 * decision D-I structural rather than a promise.
 *
 * `lazy` here is not a performance choice, for the same reason `/consent/:token`
 * and `/upload/:token` give. The portal is "a separate shell, registered outside
 * the app shell": a dynamic import is what turns that from a rule somebody has
 * to remember into a chunk boundary the bundler enforces. The router holds a
 * promise, not the module, so nothing on the authenticated side of the app pulls
 * the portal in, and nothing the portal imports is pulled into the authenticated
 * bundle.
 *
 * `portal-isolation.test.ts` walks the module graph from `PortalShell` and fails
 * if the app shell, the session store or the permission evaluator ever appears
 * in it.
 *
 * `PortalShellRoute` is the parent: it renders the header, the four links, the
 * footer and an `<Outlet>`. The other five are its children, so a person moving
 * between the portal's pages keeps the same shell rather than remounting it.
 */
export const PortalShellRoute = lazy(() => import('./PortalShell'))
export const PortalOverviewRoute = lazy(() => import('./PortalOverviewScreen'))
export const PortalPoliciesRoute = lazy(() => import('./PortalPoliciesScreen'))
export const PortalDocumentsRoute = lazy(() => import('./PortalDocumentsScreen'))
export const PortalClaimsRoute = lazy(() => import('./PortalClaimsScreen'))
export const PortalClaimNewRoute = lazy(() => import('./PortalClaimNewScreen'))
