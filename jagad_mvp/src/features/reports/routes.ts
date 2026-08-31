import { lazy } from 'react'

/**
 * The module's two route elements, split out of their screens.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so these need no boundary of their own.
 *
 * §4's two addresses, and no third. Deep analytics is P3 and belongs to a screen
 * nobody has designed; this module builds the core dashboard and the five
 * reports it indexes.
 */
export const ReportsRoute = lazy(() => import('./ReportsScreen'))
export const ReportRoute = lazy(() => import('./ReportScreen'))
