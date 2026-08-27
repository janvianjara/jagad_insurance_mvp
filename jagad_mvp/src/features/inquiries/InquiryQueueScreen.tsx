import { Link, useLocation, useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Skeleton } from '../../ui/data'
import { useInquiryNow } from './clock'
import { DevClock } from './DevClock'
import { inquiryIntake } from './data/intake'
import { inquiryQueueConfig } from './queue-config'
import styles from './InquiryQueue.module.css'

/**
 * The inquiry queue (plan §5 row 1, §4 `/inquiries`).
 *
 * The screen's whole job is to assemble what the queue configuration needs —
 * the categories and staff an admin edits, the clock this module reads, and who
 * is signed in — and hand it to `<WorkQueue>`. Everything about how a list looks
 * and behaves was decided in P-08.
 *
 * Above the table sit the two things a queue cannot express as a row: the demo
 * clock, and the unrouted alert. §9 is explicit that unrouted "is a visible state
 * with an alert, never a silent drop", so the alert is part of the queue rather
 * than a separate admin screen somebody has to know to open.
 */
export function InquiryQueueScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSessionStore((state) => state.user)
  const now = useInquiryNow()
  const intake = inquiryIntake(repositories)

  const context = useResource(async () => {
    const [categories, users] = await Promise.all([
      repositories.config.categories(),
      repositories.config.users(),
    ])
    return { categories, users }
  }, 'inquiries:context')

  // Re-read whenever the address changes, which is also what every write on this
  // screen does — a bulk action clears the selection out of the URL.
  const unrouted = useResource(
    () => intake.unrouted({ page: 1, pageSize: 1 }),
    `inquiries:unrouted:${location.search}`,
  )

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = inquiryQueueConfig({
    intake,
    categories: context.data.categories,
    users: context.data.users,
    now,
    actorId: user.id,
    canAssign: can(user, 'assign', 'inquiries'),
  })

  const unroutedTotal = unrouted.data?.total ?? 0

  return (
    <WorkQueue
      config={config}
      actions={
        can(user, 'create', 'inquiries') ? (
          <Button variant="primary" icon="plus" onClick={() => void navigate('/inquiries/new')}>
            New inquiry
          </Button>
        ) : null
      }
    >
      <DevClock />

      {unroutedTotal > 0 ? (
        <div className={styles.unrouted} role="alert">
          <Icon name="alert" size="md" />
          <div className={styles.unroutedBody}>
            <p className={styles.unroutedTitle}>
              {unroutedTotal === 1
                ? '1 inquiry is unrouted'
                : `${unroutedTotal} inquiries are unrouted`}
            </p>
            <p className={styles.unroutedNote}>
              Routing found no category for these, so nobody owns them yet. They are held here and
              alerted rather than dropped — open one and route it by hand.
            </p>
          </div>
          <Link className={styles.unroutedLink} to="/inquiries?status=unrouted">
            Show the unrouted queue
          </Link>
        </div>
      ) : null}
    </WorkQueue>
  )
}

export default InquiryQueueScreen
