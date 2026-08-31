import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so this needs no boundary of its own.
 *
 * One address only. §4 gives the vault a single route: a document's detail is
 * its drawer, addressed by `?record=`, and that parameter is also what the
 * access log watches.
 */
export const DocumentVaultRoute = lazy(() => import('./DocumentVaultScreen'))
