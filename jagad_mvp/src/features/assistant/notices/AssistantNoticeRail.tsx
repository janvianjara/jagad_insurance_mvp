import { NotificationRail } from '../../../components/NotificationRail'
import { useNotices } from './use-notices'

/**
 * The connector a queue screen mounts — the Assistant's notices, mirrored.
 *
 * `<WorkQueue>` takes `children` for exactly this ("anything that belongs above
 * the table: a notification rail, pinned stats"), so a queue screen renders
 *
 *   <WorkQueue config={…}><AssistantNoticeRail /></WorkQueue>
 *
 * and inherits the rules, the dedupe and the dismissals with no further wiring.
 * The rail draws nothing when no threshold has fired, so mounting it costs a
 * queue screen no vertical space on a quiet day.
 */
export function AssistantNoticeRail({ label }: { label?: string }) {
  const { notices, dismiss } = useNotices()

  return (
    <NotificationRail
      notices={notices.map((notice) => ({
        id: notice.id,
        severity: notice.severity,
        headline: notice.headline,
        reason: notice.reason,
        count: notice.count,
        to: notice.to,
      }))}
      onDismiss={dismiss}
      {...(label === undefined ? {} : { label })}
    />
  )
}
