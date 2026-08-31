import { lazy } from 'react'

/**
 * The module's route element, split out of its screen.
 *
 * `lazy` lives here rather than in the router because the router also exports
 * the route tree, and a file that exports both components and anything else
 * loses fast refresh (the repo's lint rule enforces it). The shell already wraps
 * its outlet in `<Suspense>`, so this needs no boundary of its own.
 *
 * `/back-office/drafts` and `/back-office/kyc` are built and stay where they
 * are — the home gathers them, it does not take them over. `/back-office/issuance`
 * and `/back-office/ocr-review` are the two ops queues this module owns outright,
 * and each is split the same way for the same reason.
 */
export const BackOfficeHomeRoute = lazy(() => import('./BackOfficeHomeScreen'))

/** `/back-office/issuance` — policies with the insurer, and issued ones not yet delivered. */
export const IssuanceQueueRoute = lazy(() => import('./IssuanceQueueScreen'))

/** `/back-office/ocr-review` — documents whose extracted values await a person. */
export const OcrReviewQueueRoute = lazy(() => import('./OcrReviewQueueScreen'))
