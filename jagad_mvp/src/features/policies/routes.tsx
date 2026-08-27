import { lazy } from 'react'

/**
 * The module's route elements, split out of their screens.
 *
 * `lazy` lives here rather than in the router because a file that exports both
 * components and anything else loses fast refresh (the repo's lint rule enforces
 * it). The shell already wraps its outlet in `<Suspense>`, so these need no
 * boundary of their own.
 *
 * `/back-office/drafts` sits in this module rather than in a back-office one
 * because a draft is a policy entry: the rows it lists are `PolicyEntryDraft`
 * records, they open a policy, and giving them a second home would mean two
 * places that both know what "still missing" means.
 */
export const PolicyQueueRoute = lazy(() => import('./PolicyQueueScreen'))
export const PolicyEntryRoute = lazy(() => import('./PolicyEntryScreen'))
export const PolicyDetailRoute = lazy(() => import('./PolicyDetailScreen'))
export const PolicyDraftsRoute = lazy(() => import('./PolicyDraftsScreen'))
