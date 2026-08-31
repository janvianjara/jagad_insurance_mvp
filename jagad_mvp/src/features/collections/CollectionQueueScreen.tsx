import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { useCustomerNow } from '../customers/clock'
import { collectionDesk } from './data/collection-desk'
import { collectionQueueConfig } from './queue-config'
import styles from './Collections.module.css'

/** Big enough to hold the whole in-memory set the columns read names out of. */
const SCAN_SIZE = 10_000

/**
 * `/back-office/collections` — FR-08.3, plan §9, the fourth of FR-08.1's six
 * ops queues.
 *
 * The screen is short because the queue is configuration. What is left here is
 * the read the configuration is a pure function of: the customers, policies and
 * staff a row prints names out of, and who is signed in — which this screen needs
 * for a reason the other queues do not have. §9 makes verification a back-office
 * act and bars the person who collected the money from verifying it, so the
 * drawer has to know who is looking at it.
 *
 * The three lists are read once for the whole queue rather than once per row: a
 * row prints a policy number, a customer name and two staff names, and a per-row
 * lookup against a repository is how a fifty-row page becomes two hundred
 * requests.
 *
 * The three states are rendered honestly and separately (U13). A queue that has
 * not arrived shows skeletons, a queue that failed says so with a way to retry,
 * and an empty queue explains how a row gets here.
 */
export function CollectionQueueScreen() {
  const repositories = useRepositories()
  const desk = collectionDesk(repositories)
  const user = useSessionStore((state) => state.user)
  // The shared clock, not `new Date()` at the point of use: the row's stripe and
  // the drawer's "waiting to be checked" are two readings of one instant.
  const now = useCustomerNow()

  const context = useResource(async () => {
    const [customers, policies, users] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.config.users(),
    ])
    return { customers: customers.rows, policies: policies.rows, users }
  }, 'collections:context')

  if (context.error) {
    return (
      <EmptyState
        variant="error"
        title="The verification queue could not be loaded"
        explanation={context.error.message}
        action={
          <Button variant="primary" size="sm" onClick={context.reload}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  return (
    <WorkQueue
      config={collectionQueueConfig({
        desk,
        customers: context.data.customers,
        policies: context.data.policies,
        users: context.data.users,
        actor: user,
        now,
      })}
    />
  )
}

export default CollectionQueueScreen
