import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { WorkQueue } from '../../components/WorkQueue'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/data'
import { endorsementsQueue } from './endorsements-queue'
import styles from './Endorsements.module.css'

/**
 * `/endorsements` — plan §4, §5 ("Endorsement").
 *
 * The screen assembles what the queue configuration needs and hands it to
 * `<WorkQueue>`: the policies and customers a row is about, and who is signed
 * in. Filter, sort and page live in the URL, as they do in every other queue.
 */
export function EndorsementQueueScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const user = useSessionStore((state) => state.user)

  const context = useResource(async () => {
    const [policies, customers] = await Promise.all([
      repositories.policies.list({ page: 1, pageSize: 500 }),
      repositories.customers.list({ page: 1, pageSize: 500 }),
    ])
    return { policies: policies.rows, customers: customers.rows }
  }, 'endorsements:context')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = endorsementsQueue({
    load: (query) => repositories.endorsements.queue(query),
    policies: context.data.policies,
    customers: context.data.customers,
  })

  return (
    <WorkQueue
      config={config}
      actions={
        can(user, 'create', 'endorsements') ? (
          <Button variant="primary" icon="plus" onClick={() => void navigate('/endorsements/new')}>
            New endorsement
          </Button>
        ) : null
      }
    />
  )
}

export default EndorsementQueueScreen
