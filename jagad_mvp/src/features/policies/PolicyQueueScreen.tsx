import { useNavigate } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { policyDesk } from './data/policy-desk'
import { policyQueueConfig } from './queue-config'
import styles from './PolicyQueueScreen.module.css'

/** Big enough to hold the whole in-memory set the columns read names out of. */
const SCAN_SIZE = 10_000

/**
 * `/policies` — plan §4, §5's policy queue row.
 *
 * The screen is short because the queue is configuration: `<WorkQueue>` owns the
 * URL, the filter bar, the stripe, the paging and the keyboard model, and
 * `policyQueueConfig` says what a policy row is. What is left here is the read
 * that the configuration is a pure function of.
 *
 * The customers, companies and products are fetched here rather than inside the
 * config for two reasons. The config stays testable without a repository, which
 * is the same posture the customer and KYC queues take. And the three lists are
 * read once for the whole queue rather than once per row: a policy row prints a
 * customer name and a company name, and a per-row lookup against a repository is
 * how a fifty-row page becomes a hundred and fifty requests.
 *
 * The three states are rendered honestly and separately. A queue that has not
 * arrived shows skeletons, a queue that failed says so with a way to retry, and
 * an empty queue explains how a row gets here — U13, and the reason `<WorkQueue>`
 * takes an `empty` that is never "No results".
 */
export function PolicyQueueScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const desk = policyDesk(repositories)
  const user = useSessionStore((state) => state.user)

  const context = useResource(async () => {
    const [customers, companies, products] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.companies.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.products.list({ page: 1, pageSize: SCAN_SIZE }),
    ])
    return { customers: customers.rows, companies: companies.rows, products: products.rows }
  }, 'policies:queue-context')

  if (context.error) {
    return (
      <EmptyState
        variant="error"
        title="The policy queue could not be loaded"
        explanation={context.error.message}
        action={
          <Button variant="primary" size="sm" onClick={context.reload}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  const mayEnter = user !== null && can(user, 'create', 'policies')

  return (
    <WorkQueue
      config={policyQueueConfig({
        desk,
        customers: context.data.customers,
        companies: context.data.companies,
        products: context.data.products,
      })}
      actions={
        mayEnter ? (
          <Button variant="primary" icon="doc" onClick={() => void navigate('/policies/new')}>
            Enter a policy
          </Button>
        ) : null
      }
    />
  )
}

export default PolicyQueueScreen
