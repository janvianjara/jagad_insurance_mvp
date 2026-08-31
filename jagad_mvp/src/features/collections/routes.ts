import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router for the reason the other modules
 * give: a file that exports both components and the route tree loses fast
 * refresh, and the repo's lint rule enforces the split. The shell already wraps
 * its outlet in `<Suspense>`, so this needs no boundary of its own.
 */
export const CollectionQueueRoute = lazy(() => import('./CollectionQueueScreen'))
