/**
 * What this record, in this state, may actually be corrected — and one line for
 * each thing a person will look for and not find.
 *
 * The allow-list says which fields are correctable on an entity; the guards say
 * which of those are correctable on THIS record right now. A premium is on
 * `Policy`'s list and refused once the insurer has issued; an insurer number is
 * on the list and refused once the insurer has supplied one. Offering either as
 * a disabled box would be an apology in the shape of a control. So the field is
 * not offered at all, and the same condition that removes it writes the line
 * saying where the change does happen — an endorsement, a reissue, the workflow.
 *
 * Every sentence below names a real route. None of them is "contact your
 * administrator".
 */

import { AMEND_POLICIES } from '../../domain/amend'
import type { AmendableEntity } from '../../domain/amend'
import type { SelectOption } from '../../ui/form'
import { amendFieldSpecs } from './amend-fields'
import type { AmendFieldSpec } from './amend-fields'
import { readAmendValue } from './amend-model'

export type AmendOfferInput = {
  readonly entity: AmendableEntity
  readonly record: object
  /** True once the insurer has issued. The repository decides it; the screen passes it. */
  readonly issued: boolean
  readonly choices?: Readonly<Record<string, readonly SelectOption[]>>
}

export type AmendOffer = {
  readonly specs: readonly AmendFieldSpec[]
  /** One line each, in reading order. Where a change that is not here happens. */
  readonly notes: readonly string[]
}

const ELSEWHERE: Readonly<Record<AmendableEntity, readonly string[]>> = {
  Inquiry: ['A status changes through the workflow, not through a correction.'],
  Quotation: [
    'A status changes through the workflow, not through a correction.',
    'A premium or a benefit row belongs to the version it was sent on. A new figure is a new version, raised from the composer.',
  ],
  Deal: [
    'A status changes through the workflow, not through a correction.',
    'Everything a deal describes belongs to the quotation behind it, so it is corrected there.',
  ],
  Customer: [
    'A status changes through the workflow, not through a correction.',
    'An Aadhaar number is captured once through KYC and is never edited here, in full or masked.',
  ],
  Policy: ['A status changes through the workflow, not through a correction.'],
  Claim: [
    'A claim state changes through the workflow, not through a correction.',
    "A settlement figure is typed from the insurer's advice on the claim itself, never corrected here.",
  ],
}

const ISSUED_MONEY_NOTE =
  'The insurer has issued this policy, so its figures are contractual. A premium after issue changes through an endorsement, where the delta and any refund are recorded against the version they belong to.'

const INSURER_NUMBER_NOTE =
  'The insurer number came from the insurer, so it is not ours to correct. Ask them to reissue it if it is wrong.'

export function amendOffer({ entity, record, issued, choices }: AmendOfferInput): AmendOffer {
  const money = AMEND_POLICIES[entity].money as readonly string[]
  const insurerNumberHeld =
    (AMEND_POLICIES[entity].fields as readonly string[]).includes('insurerNo') &&
    readAmendValue(record, 'insurerNo') !== null

  const specs = amendFieldSpecs(entity, choices).filter((spec) => {
    if (issued && money.includes(spec.field)) return false
    if (insurerNumberHeld && spec.field === 'insurerNo') return false
    return true
  })

  const notes = [
    ...ELSEWHERE[entity],
    ...(issued && money.length > 0 ? [ISSUED_MONEY_NOTE] : []),
    ...(insurerNumberHeld ? [INSURER_NUMBER_NOTE] : []),
  ]

  return { specs, notes }
}
