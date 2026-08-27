import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { useCustomerNow } from '../customers/clock'
import { policyDesk } from './data/policy-desk'
import { loadDraftContext } from './entry-data'
import { draftQueueConfig } from './queue-config'
import styles from './PolicyQueueScreen.module.css'

/**
 * `/back-office/drafts` — canvas 3.7's completion queue.
 *
 * "A half-finished entry is saved as a draft and appears in the completion queue
 * with what is still missing." The repository already keeps that promise:
 * `completionQueue` returns only `PolicyEntryDraft` rows that still have missing
 * fields, and it declares a sort on the length of that list. So this screen adds
 * nothing to the rule and only supplies what the rows need words for.
 *
 * It reads every policy rather than a page of them, and that is deliberate. A
 * draft carries a `policyId` and no reference, no customer and no product; the
 * queue is sorted by how much is missing, so which drafts sit on page one
 * changes with the sort, and a page-shaped read would leave half the rows unable
 * to name themselves. The set is small — it is, by construction, the entries
 * somebody has yet to finish.
 *
 * The row opens the policy's own file. There is no drafts-only detail screen and
 * there should not be: finishing an entry happens next to the record it belongs
 * to, and the queue empties itself when the last field is recorded.
 */
export function PolicyDraftsScreen() {
  const repositories = useRepositories()
  const desk = policyDesk(repositories)
  // The shared clock context, not `new Date()` at the point of use: "saved two
  // days ago" is a comparison against an instant, and a pinned instant is what
  // makes the row say the same thing on every run.
  const now = useCustomerNow()

  const context = useResource(() => loadDraftContext(repositories), 'policies:drafts-context')

  if (context.error) {
    return (
      <EmptyState
        variant="error"
        title="The completion queue could not be loaded"
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

  return (
    <WorkQueue
      config={draftQueueConfig({
        desk,
        policies: context.data.policies,
        customers: context.data.customers,
        users: context.data.users,
        labels: context.data.labels,
        now,
      })}
    />
  )
}

export default PolicyDraftsScreen
