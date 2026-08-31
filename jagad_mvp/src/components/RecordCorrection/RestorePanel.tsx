import { useState } from 'react'
import type { DiscardableEntity, RestoreCommand } from '../../domain/amend'
import type { MutationResult } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, Textarea } from '../../ui/form'
import { ConfirmGate } from '../guardrails'
import styles from './RecordCorrection.module.css'

export type RestorePanelProps<T extends object> = {
  readonly entity: DiscardableEntity
  readonly subject: string
  readonly actorId: string
  readonly onRestore: (command: RestoreCommand) => Promise<MutationResult<T>>
  readonly onRestored: (record: T) => void
  readonly onCancel?: () => void
}

/**
 * Bringing a discarded record back.
 *
 * The reason is free text rather than a chosen one, and the domain says why: the
 * discard reasons name why a record should not have existed, and none of them
 * explains why it should exist again. So this asks in prose, and refuses a blank
 * one for the same reason the discard did.
 */
export function RestorePanel<T extends object>({
  entity,
  subject,
  actorId,
  onRestore,
  onRestored,
  onCancel,
}: RestorePanelProps<T>) {
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const stated = reason.trim() !== ''
  const noun = entity.toLowerCase()

  async function commit() {
    const outcome = await onRestore({ actorId, reason: reason.trim() })
    if (!outcome.ok) {
      setArmed(false)
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    onRestored(outcome.record)
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
          label="Why is it coming back"
          required
          hint="The discard said why it should not have existed. This says why it should."
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setArmed(false)
              setRefusal(null)
            }}
          />
        </Field>
      </div>

      {armed && stated ? (
        <ConfirmGate
          title={`Restore ${subject}`}
          changes={[
            {
              key: 'placement',
              label: subject,
              from: 'Discarded — out of the queues',
              to: 'Back in the queues',
            },
            { key: 'reason', label: 'Reason', to: reason.trim() },
          ]}
          note={`The ${noun} returns to every queue it belongs in. The discard stays in the trail beside this restore, so the record reads as one story.`}
          confirmLabel="Restore it"
          receipt={`Restored. The ${noun} is back in the queues.`}
          onCancel={() => setArmed(false)}
          onConfirm={() => void commit()}
        />
      ) : (
        <div className={styles.submit}>
          <Button variant="primary" disabled={!stated} onClick={() => setArmed(true)}>
            Review the restore
          </Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Close
            </Button>
          ) : null}
          {stated ? null : (
            <p className={styles.blocked} role="status">
              Bringing a discarded record back has to say why, for the same reason discarding it
              did.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
