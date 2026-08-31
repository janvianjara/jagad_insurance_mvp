import { lazy } from 'react'

/**
 * The notice module's two route elements, split out of their screens.
 *
 * They answer to `/renewals/notices` and `/renewals/notices/:batchId` (plan §4),
 * but the module is its own folder: a notice batch is an insurer's PDF being
 * matched against the book, which is a different job from the renewal pool that
 * the reminders come out of.
 */
export const NoticeQueueRoute = lazy(() => import('./NoticeQueueScreen'))
export const NoticeBatchRoute = lazy(() => import('./NoticeBatchScreen'))
