import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Skeleton } from '../../ui/data'
import { dealQueueConfig } from './queue-config'
import styles from './QuotationQueue.module.css'

/**
 * The deal index (`/deals`). §4 has no deals list of its own — the rail needs
 * one so the deals a role can see are reachable without holding an id.
 */
export function DealQueueScreen() {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)

  const context = useResource(async () => {
    const [customers, users] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: 500 }),
      repositories.config.users(),
    ])
    return { customers: customers.rows, users }
  }, 'deals:context')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = dealQueueConfig({
    load: (query) => repositories.deals.list(query),
    customers: context.data.customers,
    users: context.data.users,
    now: new Date(),
  })

  return <WorkQueue config={config} />
}

export default DealQueueScreen
