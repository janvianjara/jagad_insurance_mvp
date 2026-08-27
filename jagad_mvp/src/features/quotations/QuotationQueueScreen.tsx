import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/data'
import { quotationQueueConfig } from './queue-config'
import styles from './QuotationQueue.module.css'

/**
 * The quotation queue (plan §4 `/quotations`, §5 Composer row).
 *
 * The screen assembles what the configuration needs — the customers whose names
 * the rows print, and the staff the owner filter lists — and hands it to
 * `<WorkQueue>`. Filters, sort, page and selection all live in the URL, so the
 * view is reconstructible from its address.
 */
export function QuotationQueueScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const user = useSessionStore((state) => state.user)

  const context = useResource(async () => {
    const [customers, users] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: 500 }),
      repositories.config.users(),
    ])
    return { customers: customers.rows, users }
  }, 'quotations:context')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const config = quotationQueueConfig({
    load: (query) => repositories.quotations.list(query),
    customers: context.data.customers,
    users: context.data.users,
    now: new Date(),
  })

  return (
    <WorkQueue
      config={config}
      actions={
        can(user, 'create', 'quotations') ? (
          <Button variant="primary" icon="plus" onClick={() => void navigate('/quotations/new')}>
            New quotation
          </Button>
        ) : null
      }
    />
  )
}

export default QuotationQueueScreen
