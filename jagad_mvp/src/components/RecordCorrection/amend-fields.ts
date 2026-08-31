/**
 * How a correctable field is asked for — the presentation half of the
 * allow-list, and nothing more than that.
 *
 * No screen in this folder holds a list of fields. `amendableFields(entity)` in
 * `src/domain/amend.ts` is the list, and this module only decides how each name
 * it returns is labelled and which control it is typed into. A field added to
 * the domain's policy therefore appears on every correction form without a
 * screen being edited, and a field removed from it disappears the same way —
 * which is the only arrangement in which the form and the guard cannot drift.
 *
 * A name this file has no label for still renders: `humaniseField` turns
 * `contactMobile` into "Contact mobile". A missing label is a cosmetic gap, and
 * silently dropping the field would be a functional one.
 */

import { amendableFields, isMoneyField, mayEchoValue } from '../../domain/amend'
import type { AmendableEntity } from '../../domain/amend'
import type { SelectOption } from '../../ui/form'

export const AMEND_INPUTS = {
  text: 'text',
  textarea: 'textarea',
  date: 'date',
  money: 'money',
  choice: 'choice',
} as const

export type AmendInput = (typeof AMEND_INPUTS)[keyof typeof AMEND_INPUTS]

/**
 * The wording a person reads. Keyed by field name rather than by entity,
 * because `agentId` means the same thing on all six.
 */
const LABELS: Readonly<Record<string, string>> = {
  contactName: 'Name taken down',
  contactMobile: 'Mobile',
  contactEmail: 'Email',
  notes: 'Note',
  agentId: 'Agent',
  subAgentId: 'Sub-agent',
  ownerId: 'Owner',
  memberId: 'Member covered',
  revisionReason: 'Reason this version was raised',
  lostReason: 'Reason it was lost',
  fullName: 'Full name',
  mobile: 'Mobile',
  altMobile: 'Alternate mobile',
  email: 'Email',
  addressLine: 'Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  dateOfBirth: 'Date of birth',
  insurerNo: "Insurer's number",
  startDate: 'Start date',
  expiryDate: 'Expiry date',
  sumInsured: 'Sum insured',
  netPremium: 'Net premium',
  gstAmount: 'GST',
  finalPremium: 'Final premium',
}

const HINTS: Readonly<Record<string, string>> = {
  agentId: 'Re-points the attribution. It does not recalculate a commission that has already been earned.',
  subAgentId: 'Re-points the attribution only.',
  state: 'The address, not a status. A status changes through the workflow.',
  insurerNo: 'Recorded once, when the insurer supplies it.',
}

const TEXTAREA_FIELDS: readonly string[] = ['notes', 'revisionReason', 'lostReason']
const DATE_FIELDS: readonly string[] = ['dateOfBirth', 'startDate', 'expiryDate']

export type AmendFieldSpec = {
  readonly field: string
  readonly label: string
  readonly input: AmendInput
  readonly hint: string | null
  /** Empty unless the caller supplied a list, which is what makes it a choice. */
  readonly options: readonly SelectOption[]
  /** `mayEchoValue` — false means the value may be named but never shown. */
  readonly echo: boolean
}

/** `contactMobile` becomes "Contact mobile". The last resort, never the plan. */
export function humaniseField(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function inputFor(
  entity: AmendableEntity,
  field: string,
  options: readonly SelectOption[],
): AmendInput {
  if (options.length > 0) return AMEND_INPUTS.choice
  if (isMoneyField(entity, field)) return AMEND_INPUTS.money
  if (DATE_FIELDS.includes(field)) return AMEND_INPUTS.date
  if (TEXTAREA_FIELDS.includes(field)) return AMEND_INPUTS.textarea
  return AMEND_INPUTS.text
}

/**
 * Every field the domain permits on this entity, in the domain's own order.
 *
 * `choices` supplies the options for a reference field — the agents, the staff,
 * the members on a household. A field with options becomes a select; a field
 * without stays whatever its name and its money list make it.
 */
export function amendFieldSpecs(
  entity: AmendableEntity,
  choices: Readonly<Record<string, readonly SelectOption[]>> = {},
): readonly AmendFieldSpec[] {
  return amendableFields(entity).map((field) => {
    const options = choices[field] ?? []
    return {
      field,
      label: LABELS[field] ?? humaniseField(field),
      input: inputFor(entity, field, options),
      hint: HINTS[field] ?? null,
      options,
      echo: mayEchoValue(entity, field),
    }
  })
}
