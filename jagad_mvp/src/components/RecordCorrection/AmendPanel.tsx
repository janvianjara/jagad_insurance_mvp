import { useState } from 'react'
import { amendVerdict } from '../../domain/amend'
import type { AmendableEntity, AmendCommand, AmendValue } from '../../domain/amend'
import { fromPaise } from '../../domain/money'
import type { MutationResult } from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { DatePicker, Field, Input, Select, Textarea } from '../../ui/form'
import type { SelectOption } from '../../ui/form'
import { ConfirmGate, RecordOnlyAmount } from '../guardrails'
import { AMEND_INPUTS } from './amend-fields'
import { amendOffer } from './amend-offer'
import { amendConfirmChanges, beforeOf, draftChanges, initialDraft } from './amend-model'
import type { AmendDraft } from './amend-model'
import styles from './RecordCorrection.module.css'

export type AmendPanelProps<T extends object> = {
  readonly entity: AmendableEntity
  readonly record: T
  /** The record's number, so the gate names what is being corrected. */
  readonly subject: string
  readonly actorId: string
  /** True once the insurer has issued. Removes the money fields, per D3. */
  readonly issued?: boolean
  /** Options for the reference fields — agents, staff, members. */
  readonly choices?: Readonly<Record<string, readonly SelectOption[]>>
  readonly onAmend: (command: AmendCommand) => Promise<MutationResult<T>>
  readonly onAmended: (record: T) => void
  readonly onCancel?: () => void
  /**
   * The way out of a correction that turns out to be a removal.
   *
   * Somebody opens this form to fix a record and discovers the record should not
   * exist — a duplicate, a test row, a lead entered against the wrong person.
   * Making them close the drawer and find a second button treats that as a
   * different intention when it is the same one, arrived at a moment later.
   * Present only where the entity can be discarded at all, which is why its
   * absence is the control rather than a disabled state.
   */
  readonly onDiscardInstead?: () => void
}

/**
 * The correction form — one component, six entities, no field list of its own.
 *
 * What it renders comes from `amendOffer`, which reads the domain's allow-list
 * and removes what this record's own state has already put out of reach. What it
 * refuses comes from `amendVerdict`, the same function the repository runs, so
 * the sentence under the disabled button is the sentence the write would have
 * come back with — rendered exactly as the domain wrote it, never rephrased.
 *
 * The reason is required and never defaulted. Confirming goes through
 * `<ConfirmGate>`, which shows the real before-and-after of exactly the fields
 * being changed; Cancel writes nothing, and a refusal from the repository
 * dismisses the gate rather than leaving a receipt over a write that never
 * happened.
 */
export function AmendPanel<T extends object>({
  entity,
  record,
  subject,
  actorId,
  issued = false,
  choices,
  onAmend,
  onAmended,
  onCancel,
  onDiscardInstead,
}: AmendPanelProps<T>) {
  const { specs, notes } = amendOffer({ entity, record, issued, choices })

  const [draft, setDraft] = useState<AmendDraft>(() => initialDraft(record, specs))
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  function set(field: string, value: AmendValue) {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setArmed(false)
    setRefusal(null)
  }

  const changes = draftChanges(record, specs, draft)
  const verdict = amendVerdict({
    entity,
    reason,
    changes,
    before: beforeOf(record, changes),
    issued,
  })

  async function commit() {
    const outcome = await onAmend({ actorId, reason: reason.trim(), changes })
    if (!outcome.ok) {
      // The machine's own words, and nothing was written. The gate comes down so
      // no receipt is left standing over a change that did not happen.
      setArmed(false)
      setRefusal(outcome.reason)
      return
    }
    setRefusal(null)
    onAmended(outcome.record)
  }

  return (
    <div className={styles.panel}>
      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}

      {specs.length === 0 ? (
        <p className={styles.none}>
          Nothing on this record is correctable in the state it is in.
        </p>
      ) : (
        <div className={styles.fields}>
          {specs.map((spec) => {
            const value = draft[spec.field] ?? null

            if (spec.input === AMEND_INPUTS.money) {
              return (
                <RecordOnlyAmount
                  key={spec.field}
                  label={spec.label}
                  hint={spec.hint ?? undefined}
                  value={typeof value === 'number' ? fromPaise(value) : null}
                  onValueChange={(amount) => set(spec.field, amount === null ? null : amount.paise)}
                />
              )
            }

            return (
              <Field key={spec.field} label={spec.label} hint={spec.hint ?? undefined}>
                {spec.input === AMEND_INPUTS.choice ? (
                  <Select
                    value={value === null ? '' : String(value)}
                    placeholder="Not attributed"
                    options={spec.options}
                    onChange={(event) => set(spec.field, event.target.value)}
                  />
                ) : spec.input === AMEND_INPUTS.textarea ? (
                  <Textarea
                    rows={3}
                    value={value === null ? '' : String(value)}
                    onChange={(event) => set(spec.field, event.target.value)}
                  />
                ) : spec.input === AMEND_INPUTS.date ? (
                  <DatePicker
                    value={value === null ? '' : String(value)}
                    onChange={(event) => set(spec.field, event.target.value)}
                  />
                ) : (
                  <Input
                    value={value === null ? '' : String(value)}
                    onChange={(event) => set(spec.field, event.target.value)}
                  />
                )}
              </Field>
            )
          })}

          <Field
            label="Why is this being corrected"
            required
            hint="Written into the record's trail beside the change. It is never defaulted."
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
      )}

      {notes.length > 0 ? (
        <ul className={styles.elsewhere}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {armed && verdict.ok ? (
        <ConfirmGate
          title={`Correct ${subject}`}
          changes={amendConfirmChanges(record, specs, draft)}
          note="Nothing goes to the customer or the insurer. The change and this reason are written into the record's trail."
          confirmLabel="Record the correction"
          receipt="Corrected. The change and the reason are on the record."
          onCancel={() => setArmed(false)}
          onConfirm={() => void commit()}
        />
      ) : specs.length === 0 ? null : (
        <div className={styles.submit}>
          <Button variant="primary" disabled={!verdict.ok} onClick={() => setArmed(true)}>
            Review this correction
          </Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Close
            </Button>
          ) : null}
          {verdict.ok ? null : (
            <p className={styles.blocked} role="status">
              {verdict.reason}
            </p>
          )}
        </div>
      )}

      {onDiscardInstead && !armed ? (
        <div className={styles.instead}>
          <p className={styles.insteadNote}>
            If this record should not be here at all — a duplicate, a test row, the wrong
            person — remove it instead of correcting it. It stays in the book and can be
            brought back.
          </p>
          <Button variant="quiet" icon="close" onClick={onDiscardInstead}>
            Discard this record
          </Button>
        </div>
      ) : null}
    </div>
  )
}
