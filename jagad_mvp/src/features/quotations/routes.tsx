import { lazy } from 'react'

/**
 * The module's route elements, split out of their screens.
 *
 * `lazy` lives here rather than in the router because a file that exports both
 * components and anything else loses fast refresh (the repo's lint rule enforces
 * it). The shell already wraps its outlet in `<Suspense>`, so these need no
 * boundary of their own.
 *
 * `/quotations/:id` and `/quotations/:id/v/:version` are one screen: a version is
 * the same record read at a different point, and giving the archive its own
 * component would be two renderings of one document to keep in step.
 */
export const QuotationQueueRoute = lazy(() => import('./QuotationQueueScreen'))
export const QuotationNewRoute = lazy(() => import('./QuotationNewScreen'))
export const QuotationComposerRoute = lazy(() => import('./QuotationComposerScreen'))
export const DealQueueRoute = lazy(() => import('./DealQueueScreen'))
export const DealRoute = lazy(() => import('./DealScreen'))
