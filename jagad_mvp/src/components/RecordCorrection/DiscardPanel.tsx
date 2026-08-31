import { useState } from 'react'
import { DISCARD_REASONS, DISCARD_REASON_LABELS, isDiscardReason } from '../../domain/amend'
import type { DiscardableEntity, DiscardCommand } from '../../domain/amend'
import type { MutationResult } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, Select, Textarea } from '../../ui/form'
import { ConfirmGate } from '../guardrails'
import styles from './RecordCorrection.module.css'

export type DiscardPanelProps<T extends object> = {
  readonly entity: DiscardableEntity
  readonly subject: string
  readonly actorId: string
  readonly onDiscard: (command: DiscardCommand) => Promise<MutationResult<T>>
  readonly onDiscarded: (record: T) => void
  readonly onCancel?: () => void
}

const REASON_OPTIONS = Object.values(DISCARD_REASONS).map((reason) => ({
  value: reason,
  label: DISCARD_REASON_LABELS[reason],
}))

/**
 * Discarding a pre-contractual record — and saying plainly which of the two
 * things it is.
 *
 * It is not a deletion. The row keeps its number, leaves the queues, stays in
 * the book and comes back through Restore. A person about to press this deserves
 * to know that before they press it rather than after, so the gate's note says
 * it in the sentence above the button rather than in a tooltip.
 *
 * The reason comes from `DISCARD_REASONS` and is not free text: the register of
 * why records should not have existed is only worth reading if it is countable.
 * The note beside it is free text, and optional.
 */
export function DiscardPanel<T extends object>({
  entity,
  subject,
  actorId,
  onDiscard,
  onDiscarded,
  onCancel,
}: DiscardPanelProps<T>) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const chosen = isDiscardReason(reason) ? reason : null
  const noun = entity.toLowerCase()

  async function commit() {
    if (chosen === null) return
    const outcome = await onDiscard({
      actorId,
      reason: chosen,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    })
    if (!outcome.ok) {
      setArmed(false)
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    onDiscarded(outcome.record)
  }

  return (
    <div className={styles.panel}>
      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}

      <div className={styles.fields}>
        <Field
          label="Why is it being discarded"
          required
          hint="Counted in the register of records that should not have existed."
        >
          <Select
            value={reason}
            placeholder="Choose a reason"
            options={REASON_OPTIONS}
            onChange={(event) => {
              setReason(event.target.value)
              setArmed(false)
              setRefusal(null)
            }}
          />
        </Field>
        <Field label="Anything to add" optional>
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
          title={`Discard ${subject}`}
          changes={[
            {
              key: 'placement',
              label: subject,
              from: 'In the queues',
              to: 'Discarded — out of the queues, still in the book',
            },
            { key: 'reason', label: 'Reason', to: DISCARD_REASON_LABELS[chosen] },
            ...(note.trim() === '' ? [] : [{ key: 'note', label: 'Note', to: note.trim() }]),
          ]}
          note={`This is reversible and nothing is deleted. The ${noun} keeps its number and stays in the book; it leaves every queue until somebody restores it, and the discard, the reason and your name are written into its trail.`}
          confirmLabel="Discard it"
          receipt={`Discarded. The ${noun} has left the queues and is still in the book.`}
          onCancel={() => setArmed(false)}
          onConfirm={() => void commit()}
        />
      ) : (
        <div className={styles.submit}>
          <Button variant="primary" disabled={chosen === null} onClick={() => setArmed(true)}>
            Review the discard
          </Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Close
            </Button>
          ) : null}
          {chosen === null ? (
            <p className={styles.blocked} role="status">
              A discard has to name one of the recorded reasons. Choose one and the preview will say
              exactly what happens.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
