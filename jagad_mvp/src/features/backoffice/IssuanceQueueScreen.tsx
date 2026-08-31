import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { useCustomerNow } from '../customers/clock'
import { issuanceDesk } from './data/issuance-desk'
import { issuanceQueueConfig } from './issuance-queue-config'
import styles from './Issuance.module.css'

/** Big enough to hold the whole in-memory set the columns read names out of. */
const SCAN_SIZE = 10_000

/**
 * `/back-office/issuance` — FR-08.1's fifth ops queue, plan §9, canvas 3.6.
 *
 * The desk that takes a policy from "the proposal is with the insurer" to "the
 * insurer has answered and the customer has their document". The screen is short
 * because the queue is configuration; what is left here is the read that
 * configuration is a pure function of.
 *
 * Four wide reads, once for the whole queue rather than once per row: a row
 * prints a customer's name, a product and its company, and needs to know whether
 * the insurer's document is on file. A per-row lookup against a repository is how
 * a twenty-five-row page becomes a hundred requests. The documents read is
 * metadata only — presence and review state — and no column, cell or drawer on
 * this screen touches a `document-content` field (§14.1).
 *
 * The three states are rendered honestly and separately (U13): a queue that has
 * not arrived shows skeletons, one that failed says so with a way to retry, and
 * an empty one explains how a row gets here.
 */
export function IssuanceQueueScreen() {
  const repositories = useRepositories()
  const desk = issuanceDesk(repositories)
  // The bulk send is recorded as this person's act, so the queue cannot render
  // until the session has resolved.
  const user = useSessionStore((state) => state.user)
  // The shared clock, not `new Date()` at the point of use: the row's stripe and
  // the drawer's "in the desk since" are two readings of one instant.
  const now = useCustomerNow()

  const context = useResource(async () => {
    const [customers, products, companies, documents] = await Promise.all([
      repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.products.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.companies.list({ page: 1, pageSize: SCAN_SIZE }),
      repositories.documents.list({ page: 1, pageSize: SCAN_SIZE }),
    ])
    return {
      customers: customers.rows,
      products: products.rows,
      companies: companies.rows,
      documents: documents.rows,
    }
  }, 'issuance:context')

  if (context.error) {
    return (
      <EmptyState
        variant="error"
        title="The issuance queue could not be loaded"
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
      config={issuanceQueueConfig({
        desk,
        customers: context.data.customers,
        products: context.data.products,
        companies: context.data.companies,
        documents: context.data.documents,
        actor: user,
        now,
      })}
    />
  )
}

export default IssuanceQueueScreen
