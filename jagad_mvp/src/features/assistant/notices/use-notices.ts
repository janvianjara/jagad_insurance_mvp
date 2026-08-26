/**
 * The proactive notices this account has not waved away.
 *
 * Evaluated from the same snapshot the briefing is built from, so the feed and
 * the queue-screen rail cannot disagree about what is on fire. Dismissals come
 * from the feature store; everything else is derived, which is why a notice
 * disappears the moment the fact behind it stops being true.
 */

import { evaluateNotices } from './notice-rules'
import type { Notice } from './notice-rules'
import { useNoticesStore } from './notices-store'
import { useAssistantSession, useQueueSnapshot } from '../use-assistant'
import type { ResourceStatus } from '../../../lib/useResource'

export type NoticeFeed = {
  readonly notices: readonly Notice[]
  readonly status: ResourceStatus
  dismiss(id: string): void
}

export function useNotices(): NoticeFeed {
  const session = useAssistantSession()
  const snapshot = useQueueSnapshot(session)
  const dismissed = useNoticesStore((state) => state.dismissed)
  const dismiss = useNoticesStore((state) => state.dismiss)

  const raised = snapshot.data ? evaluateNotices(snapshot.data) : []

  return {
    notices: raised.filter((notice) => !dismissed.includes(notice.id)),
    status: snapshot.status,
    dismiss,
  }
}
