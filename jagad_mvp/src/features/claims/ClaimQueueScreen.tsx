import { Link, useLocation, useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { QueueDataPort } from '../dataport/QueueDataPort'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Skeleton } from '../../ui/data'
import { claimDesk } from './data/claim-desk'
import { claimQueueConfig } from './queue-config'
import styles from './ClaimQueue.module.css'

/**
 * The claim queue (plan §5, "Claim queue + detail"; §4 `/claims`).
 *
 * The screen assembles what the queue configuration needs — the customers and
 * staff a row names, who is signed in, and the desk the rows come from — and
 * hands it to `<WorkQueue>`. Everything about how a list looks and behaves was
 * decided once.
 *
 * Above the table sits the one thing a row cannot express: the count of claims
 * blocked on an inactive policy. §9 blocks those with a clear message and
 * notifies the agent, and a block nobody can see is the silent drop the whole
 * machine exists to prevent — so the alert is part of the queue rather than a
 * report somebody has to know to open.
 */
export function ClaimQueueScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSessionStore((state) => state.user)
  const desk = claimDesk(repositories)

  const context = useResource(async () => {
    const [customers, users] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: 500 }),
      repositories.config.users(),
    ])
    return { customers: customers.rows, users }
  }, 'claims:context')

  // Re-read whenever the address changes, which is also what every write on this
  // screen does — a bulk action clears the selection out of the URL.
  const blocked = useResource(
    () => desk.queue({ filters: { state: ['blocked'] }, page: 1, pageSize: 1 }),
    `claims:blocked:${location.search}`,
  )

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = claimQueueConfig({
    desk,
    customers: context.data.customers,
    users: context.data.users,
    now: new Date(),
    actorId: user.id,
    canPickUp: can(user, 'edit', 'claims'),
  })

  const blockedTotal = blocked.data?.total ?? 0

  return (
    <WorkQueue
      config={config}
      actions={
        <>
          <QueueDataPort config={config} importSpecKey="claims" />
          {can(user, 'create', 'claims') ? (
            <Button variant="primary" icon="plus" onClick={() => void navigate('/claims/new')}>
              New claim
            </Button>
          ) : null}
        </>
      }
    >
      {blockedTotal > 0 ? (
        <div className={styles.blocked} role="alert">
          <Icon name="alert" size="md" />
          <div className={styles.blockedBody}>
            <p className={styles.blockedTitle}>
              {blockedTotal === 1
                ? '1 claim is blocked on an inactive policy'
                : `${blockedTotal} claims are blocked on an inactive policy`}
            </p>
            <p className={styles.blockedNote}>
              The policy was not in force when the claim was raised, so nothing went to the insurer.
              The sourcing agent was notified to handle it with the customer.
            </p>
          </div>
          <Link className={styles.blockedLink} to="/claims?state=blocked">
            Show the blocked claims
          </Link>
        </div>
      ) : null}
    </WorkQueue>
  )
}

export default ClaimQueueScreen
