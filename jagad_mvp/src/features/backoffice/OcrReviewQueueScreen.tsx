import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { useCustomerNow } from '../customers/clock'
import { loadVaultSubjects } from '../documents/data/vault'
import { ocrReviewDesk } from './data/ocr-review-desk'
import { ocrReviewQueueConfig } from './ocr-review-queue-config'
import styles from './OcrReview.module.css'

/**
 * `/back-office/ocr-review` — FR-08.1's sixth ops queue, FR-16, charter U10.
 *
 * The human check on machine extraction, and the screen the product's strongest
 * guardrail is most visible on: an extracted value renders through `<OcrField>`,
 * and a form holding one that nobody has confirmed cannot submit.
 *
 * The screen is short because the queue is configuration. What is left here is
 * the one read the configuration is a pure function of — the subjects a row names
 * itself by. `loadVaultSubjects` is the documents feature's own resolver, reused
 * rather than rewritten: it already knows how to turn a document's
 * `subjectEntity` and `subjectId` into a name and a link, and a second copy of
 * that here would drift from the vault's within a release. A subject it cannot
 * resolve renders as its own entity and id, which is honest — a notice batch has
 * no screen in §4's route map and a row must not claim otherwise.
 *
 * The three states are rendered honestly and separately (U13).
 */
export function OcrReviewQueueScreen() {
  const repositories = useRepositories()
  const desk = ocrReviewDesk(repositories)
  // A verdict is recorded as this person's, so the queue cannot render until the
  // session has resolved.
  const user = useSessionStore((state) => state.user)
  // The shared clock, not `new Date()` at the point of use: the row's stripe and
  // the drawer's "waiting to be read" are two readings of one instant.
  const now = useCustomerNow()

  const context = useResource(
    async () => ({ subjects: await loadVaultSubjects(repositories) }),
    'ocr-review:context',
  )

  if (context.error) {
    return (
      <EmptyState
        variant="error"
        title="The review queue could not be loaded"
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
      config={ocrReviewQueueConfig({
        desk,
        subjects: context.data.subjects,
        actor: user,
        now,
      })}
    />
  )
}

export default OcrReviewQueueScreen
