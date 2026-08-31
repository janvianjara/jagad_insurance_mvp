import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so this needs no boundary of its own.
 *
 * One address only. §4 gives tasks a single route: a task's detail is its
 * drawer, addressed by `?record=`, and the work itself is done on the record the
 * task points at.
 */
export const TaskQueueRoute = lazy(() => import('./TaskQueueScreen'))
