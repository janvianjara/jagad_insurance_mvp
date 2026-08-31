/**
 * What a correction form holds, and what the gate is shown — all of it derived,
 * none of it hand-listed.
 *
 * Three rules are enforced here rather than in the component, so a second
 * correction surface cannot get them subtly wrong:
 *
 *   1. The "before" is read off the record with the same reader the repository
 *      uses (`readAmendValue` mirrors `readCell` in `src/data/mock/correction.ts`),
 *      so the diff on screen is the diff the guards will run against.
 *   2. Only fields whose value actually differs are submitted. An unchanged
 *      field is not a change, and a trail full of no-ops is a trail nobody reads.
 *   3. A field `mayEchoValue` refuses is NAMED in the preview and never shown.
 *      Amounts are the case that matters: the preview says the figure is being
 *      replaced and prints neither the old one nor the new one, which is the
 *      same rule `amendDetail` applies to the audit event.
 *
 * Nothing in this module computes an amount. A money field's draft is the
 * integer paise `<RecordOnlyAmount>` produced from what a person typed, carried
 * unchanged to the repository, which rebuilds the branded value.
 */

import { isMoney } from '../../domain/money'
import type { AmendValue } from '../../domain/amend'
import type { ConfirmChange } from '../guardrails'
import type { AmendFieldSpec } from './amend-fields'
import { AMEND_INPUTS } from './amend-fields'

/** The form's working copy: one scalar per offered field, in storage shape. */
export type AmendDraft = Readonly<Record<string, AmendValue>>

/**
 * One stored value as a correction speaks it. `null` covers absent and unset
 * alike, which is honest — neither is a value a correction has to tell apart.
 */
export function readAmendValue(record: object, field: string): AmendValue {
  const value = (record as Record<string, unknown>)[field]
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (isMoney(value)) return value.paise
  return null
}

export function initialDraft(record: object, specs: readonly AmendFieldSpec[]): AmendDraft {
  const draft: Record<string, AmendValue> = {}
  for (const spec of specs) draft[spec.field] = readAmendValue(record, spec.field)
  return draft
}

/**
 * What the person has actually changed.
 *
 * An emptied text box is `null` rather than `''`: unrecorded and empty-string
 * are the same fact to every reader of these records, and sending `''` would
 * write a value where there had been an absence.
 */
export function draftChanges(
  record: object,
  specs: readonly AmendFieldSpec[],
  draft: AmendDraft,
): Readonly<Record<string, AmendValue>> {
  const changes: Record<string, AmendValue> = {}
  for (const spec of specs) {
    const next = draft[spec.field] === '' ? null : (draft[spec.field] ?? null)
    if (next !== readAmendValue(record, spec.field)) changes[spec.field] = next
  }
  return changes
}

/** The record's current value for every field being changed. Never the caller's. */
export function beforeOf(
  record: object,
  changes: Readonly<Record<string, AmendValue>>,
): Readonly<Record<string, AmendValue>> {
  const before: Record<string, AmendValue> = {}
  for (const field of Object.keys(changes)) before[field] = readAmendValue(record, field)
  return before
}

const UNRECORDED = 'not recorded'

/** A value as the preview prints it. Only ever reached for a field that may echo. */
export function describeAmendValue(spec: AmendFieldSpec, value: AmendValue): string {
  if (value === null || value === '') return UNRECORDED
  if (spec.input === AMEND_INPUTS.choice) {
    return spec.options.find((option) => option.value === value)?.label ?? String(value)
  }
  return String(value)
}

/**
 * The before-and-after the gate shows, for exactly the fields being changed.
 *
 * A field that may not be echoed contributes a row that names it and says what
 * is happening to it, with no value on either side. That is deliberate: the row
 * has to exist, because a person confirming a change to the premium must see
 * that the premium is in the change — they must simply not be shown the figure
 * in a preview that is also the shape of the audit entry.
 */
export function amendConfirmChanges(
  record: object,
  specs: readonly AmendFieldSpec[],
  draft: AmendDraft,
): readonly ConfirmChange[] {
  const changes = draftChanges(record, specs, draft)
  return specs
    .filter((spec) => Object.prototype.hasOwnProperty.call(changes, spec.field))
    .map((spec) =>
      spec.echo
        ? {
            key: spec.field,
            label: spec.label,
            from: describeAmendValue(spec, readAmendValue(record, spec.field)),
            to: describeAmendValue(spec, changes[spec.field]),
          }
        : {
            key: spec.field,
            label: spec.label,
            to: 'Replaced by the figure you typed. An amount is never echoed in a preview or in the trail.',
          },
    )
}
