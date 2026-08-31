import { useState } from 'react'
import type {
  EraseRequest,
  EraseRequester,
  EraseSubjectEntity,
  MutationResult,
  RaiseEraseRequestCommand,
} from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, Select, Textarea } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { DateTime, RecordId } from '../../ui/type'
import { ConfirmGate } from '../guardrails'
import {
  ERASE_REQUESTER_LABELS,
  ERASE_VERDICT_LABELS,
  ERASE_VERDICT_TONE,
  suppressionSentence,
} from './erasure-view'
import styles from './RecordCorrection.module.css'

export type ErasePanelProps = {
  readonly subjectEntity: EraseSubjectEntity
  readonly subjectId: string
  /** How the record is named on screen, so the gate says what it is about. */
  readonly subject: string
  readonly actorId: string
  /** Everything already asked about this record, oldest first. */
  readonly existing: readonly EraseRequest[]
  readonly onRequest: (command: RaiseEraseRequestCommand) => Promise<MutationResult<EraseRequest>>
  readonly onRequested: (record: EraseRequest) => void
  readonly onCancel?: () => void
}

const REQUESTER_OPTIONS = Object.entries(ERASE_REQUESTER_LABELS).map(([value, label]) => ({
  value,
  label,
}))

/**
 * The honest answer to "why can I not delete this customer" — FR-20.2.
 *
 * A customer, a policy and a claim carry regulatory retention, so there is no
 * discard on them and no delete anywhere behind this screen. What there is, is
 * the right to ask: the request is recorded, the platform reads what it actually
 * holds, and the answer comes back as a verdict with the obligation named in
 * prose the person who asked can read. Where a live contract exists that answer
 * is "retained", and the thing they are actually given instead — marketing use
 * and automated chasing switched off — is stated rather than implied.
 *
 * The decision is rendered exactly as the domain wrote it. Nothing in this file
 * paraphrases `obligationNote`.
 */
export function ErasePanel({
  subjectEntity,
  subjectId,
  subject,
  actorId,
  existing,
  onRequest,
  onRequested,
  onCancel,
}: ErasePanelProps) {
  const [requestedBy, setRequestedBy] = useState('')
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [decided, setDecided] = useState<EraseRequest | null>(null)

  const chosen = requestedBy === '' ? null : (requestedBy as EraseRequester)

  async function commit() {
    if (chosen === null) return
    const outcome = await onRequest({
      actorId,
      subjectEntity,
      subjectId,
      requestedBy: chosen,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    })
    if (!outcome.ok) {
      setArmed(false)
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    setDecided(outcome.record)
    onRequested(outcome.record)
  }

  if (decided) {
    return (
      <div className={styles.panel}>
        <div className={styles.decision}>
          <p className={styles.decisionHead}>
            <RecordId systemNo={decided.systemNo} showInsurer={false} />
            <StatusPill tone={ERASE_VERDICT_TONE[decided.verdict]}>
              {ERASE_VERDICT_LABELS[decided.verdict]}
            </StatusPill>
          </p>
          {decided.obligationNote === '' ? null : (
            <p className={styles.decisionNote}>{decided.obligationNote}</p>
          )}
          <p className={styles.decisionNote}>{suppressionSentence(decided.suppressed)}</p>
          <p className={styles.quiet}>
            The request and the decision are both in the log, and the request stands in the register
            at Configuration, Compliance.
          </p>
        </div>
        {onCancel ? (
          <div className={styles.submit}>
            <Button variant="quiet" onClick={onCancel}>
              Close
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}

      <p className={styles.quiet}>
        {`A ${subjectEntity.toLowerCase()} is never deleted — it is held under retention that outlives anybody's preference. What a person may do is ask, and the platform answers by reading what it actually holds: the verdict, the obligation behind it where there is one, and what is switched off instead.`}
      </p>

      {existing.length > 0 ? (
        <ul className={styles.priorRequests}>
          {existing.map((request) => (
            <li key={request.id}>
              <RecordId systemNo={request.systemNo} showInsurer={false} />
              <StatusPill tone={ERASE_VERDICT_TONE[request.verdict]}>
                {ERASE_VERDICT_LABELS[request.verdict]}
              </StatusPill>
              <DateTime value={request.requestedAt} mode="date" />
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.fields}>
        <Field label="Who asked" required hint="The audit answers this differently for each.">
          <Select
            value={requestedBy}
            placeholder="Choose who raised it"
            options={REQUESTER_OPTIONS}
            onChange={(event) => {
              setRequestedBy(event.target.value)
              setArmed(false)
              setRefusal(null)
            }}
          />
        </Field>
        <Field label="What they said" optional>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              setArmed(false)
            }}
          />
        </Field>
      </div>

      {armed && chosen !== null ? (
        <ConfirmGate
          title={`Record an erasure request for ${subject}`}
          changes={[
            {
              key: 'request',
              label: subject,
              from: 'No request standing',
              to: 'Request recorded and decided',
            },
            { key: 'requester', label: 'Raised by', to: ERASE_REQUESTER_LABELS[chosen] },
            ...(note.trim() === '' ? [] : [{ key: 'note', label: 'What they said', to: note.trim() }]),
          ]}
          note="Nothing is deleted by this. The platform reads what it holds, records the decision against this file, and switches off whatever it is free to switch off."
          confirmLabel="Record the request"
          receipt="Recorded. The decision is below."
          onCancel={() => setArmed(false)}
          onConfirm={() => void commit()}
        />
      ) : (
        <div className={styles.submit}>
          <Button variant="primary" disabled={chosen === null} onClick={() => setArmed(true)}>
            Review the request
          </Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Close
            </Button>
          ) : null}
          {chosen === null ? (
            <p className={styles.blocked} role="status">
              A request has to say who raised it. The audit evidences a request the person made
              themselves differently from one staff raised for them.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
