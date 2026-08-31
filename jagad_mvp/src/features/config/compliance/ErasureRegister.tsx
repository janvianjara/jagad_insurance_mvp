/**
 * The erasure register — FR-20.2, and the page the client was told to read.
 *
 * Every request a data principal has made, with the answer they were given. It
 * is a register rather than a queue on purpose: there is nothing here for a
 * person to decide. The verdict follows from what the platform actually holds —
 * a live contract, an open claim, a record still inside its retention window —
 * so a request arrives already answered, and what an admin needs is to be able
 * to read the answers back and prove they were given.
 *
 * The obligation sentence is the domain's own, printed exactly as
 * `assessErasure` wrote it. Nothing on this screen paraphrases it, because a
 * second wording of a regulatory answer is a second answer.
 *
 * Read-only, and it holds no write path at all. A request is raised from the
 * record it is about — the customer file — where the person asking is in front
 * of somebody. There is no button here that erases anything, and there is none
 * behind this screen either.
 */

import { useRepositories } from '../../../app/repositories-context'
import { useResource } from '../../../lib/useResource'
import {
  ERASE_REQUESTER_LABELS,
  ERASE_VERDICT_LABELS,
  ERASE_VERDICT_TONE,
  suppressionSentence,
} from '../../../components/RecordCorrection'
import type { EraseRequest } from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { EmptyState, Skeleton } from '../../../ui/data'
import { FormSection } from '../../../ui/form'
import { StatusPill } from '../../../ui/signal'
import { DateTime, RecordId } from '../../../ui/type'
import { useComplianceStore } from './compliance-store'
import styles from './compliance.module.css'

const PAGE = { page: 1, pageSize: 200 } as const

export function ErasureRegister() {
  const repositories = useRepositories()
  const customers = useComplianceStore((state) => state.customers)

  const requests = useResource(
    () => repositories.eraseRequests.queue(PAGE),
    'compliance:erasure-register',
  )

  const subjectOf = (request: EraseRequest): string => {
    if (request.subjectEntity !== 'Customer') return `${request.subjectEntity} ${request.subjectId}`
    const customer = customers.find((entry) => entry.id === request.subjectId)
    return customer ? customer.fullName : request.subjectId
  }

  return (
    <div className={styles.panels}>
      <FormSection
        title="Requests to be forgotten, and what each one was told"
        description="A request is answered by reading what the platform holds rather than by anybody's judgement. Where a record has to be kept, the obligation is named and marketing use is locked instead — which is the part the person asking actually gets."
      >
        {requests.status === 'loading' ? (
          <div aria-busy="true">
            <Skeleton width="40ch" />
            <Skeleton width="60ch" />
          </div>
        ) : requests.status === 'error' ? (
          <EmptyState
            variant="error"
            title="The register could not be read"
            explanation={requests.error?.message ?? 'The repositories did not answer.'}
            action={
              <Button variant="primary" onClick={() => requests.reload()}>
                Try again
              </Button>
            }
          />
        ) : (requests.data?.rows.length ?? 0) === 0 ? (
          <EmptyState
            title="Nobody has asked to be forgotten yet"
            explanation="A request is raised from the customer file, where the person asking is in front of somebody. It is recorded and answered in the same act, and the answer lands here."
          />
        ) : (
          <ul className={styles.cards}>
            {(requests.data?.rows ?? []).map((request) => (
              <li key={request.id} className={styles.card} data-erase-request={request.systemNo}>
                <div className={styles.cardHead}>
                  <h3 className={styles.cardTitle}>{subjectOf(request)}</h3>
                  <StatusPill tone={ERASE_VERDICT_TONE[request.verdict]}>
                    {ERASE_VERDICT_LABELS[request.verdict]}
                  </StatusPill>
                </div>

                <p className={styles.recordLine}>
                  <RecordId systemNo={request.systemNo} showInsurer={false} />
                  <span>{ERASE_REQUESTER_LABELS[request.requestedBy]}</span>
                  <DateTime value={request.requestedAt} mode="datetime" />
                </p>

                {request.obligationNote === '' ? null : (
                  <p className={styles.obligation}>{request.obligationNote}</p>
                )}
                <p className={styles.obligation}>{suppressionSentence(request.suppressed)}</p>
                {request.note ? <p className={styles.requestNote}>{request.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </div>
  )
}
