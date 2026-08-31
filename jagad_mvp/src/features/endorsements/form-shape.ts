/**
 * The reshape — plan §5 ("Type-driven form reshape"), §9, canvas n51.
 *
 * §9 forks the endorsement machine three ways on the type, and the form has to
 * fork with it: a correction, a financial change and a cancellation ask for
 * different things and must not ask for each other's. This module is that fork,
 * expressed once, with no React in it, so the screens render it and the tests
 * assert on it without mounting anything.
 *
 * The sharp rule is §9's: "Non-financial types must render no premium fields at
 * all." It is held here structurally rather than by a branch somebody could add
 * a case to. `premiumFields` is `premiumFieldsFor(type)` — the domain's own
 * answer, which is an empty list for a non-financial endorsement — narrowed to
 * what the capture form is entitled to ask for at all. A filter of an empty list
 * is an empty list, so there is no edit to this file that gives a correction a
 * money field without first changing the domain.
 *
 * The screen then reports `renderedFields` to `selectType`, and
 * `nonFinancialRendersNoPremiumFields` checks the claim against what is actually
 * on screen. The rule is therefore asserted twice: once by the shape that builds
 * the form, and once by the machine that reads back what the form built.
 */

import { premiumFieldsFor } from '../../domain/workflows'
import type { EndorsementType, PremiumFieldName } from '../../domain/workflows'

export type EndorsementChangeField = {
  readonly key: string
  readonly label: string
  readonly hint: string
}

/**
 * The money fields the capture form may ask for, whatever the type.
 *
 * A refund is deliberately absent: §9 puts the claims-in-period check between
 * the cancellation being raised and the refund being typed, so a capture form
 * that offered a refund box would be inviting a figure the platform has not yet
 * established is due. The refund is typed on the record, after the check.
 */
const CAPTURE_PREMIUM_FIELDS: readonly PremiumFieldName[] = ['premiumDelta']

export type EndorsementFormShape = {
  readonly type: EndorsementType
  /** What this endorsement is, in the words the back office uses. */
  readonly heading: string
  /** One line, for the type chooser. */
  readonly summary: string
  readonly explanation: string
  /** What an endorsement of this type may change. The scope guard reads these. */
  readonly permittedFields: readonly string[]
  readonly changeFields: readonly EndorsementChangeField[]
  /** The money fields the capture form renders. Empty for a correction. */
  readonly premiumFields: readonly PremiumFieldName[]
  /** True where §9 puts the claims-in-period check before anything else. */
  readonly runsClaimsCheck: boolean
}

const NON_FINANCIAL_FIELDS: readonly EndorsementChangeField[] = [
  { key: 'nomineeName', label: 'Nominee name', hint: 'A spelling on the schedule against the KYC.' },
  { key: 'insuredName', label: 'Insured name', hint: 'A correction, not a change of person.' },
  { key: 'addressLine', label: 'Address', hint: 'Where the documents are sent.' },
  { key: 'contactMobile', label: 'Mobile number', hint: 'Where the reminders go.' },
  { key: 'emailAddress', label: 'Email address', hint: 'Where the schedule is emailed.' },
]

const FINANCIAL_FIELDS: readonly EndorsementChangeField[] = [
  { key: 'sumInsured', label: 'Sum insured', hint: 'Raised or reduced mid-term.' },
  { key: 'memberAdded', label: 'Member added', hint: 'A person joining a floater.' },
  { key: 'memberRemoved', label: 'Member removed', hint: 'A person leaving the cover.' },
  { key: 'addOnCover', label: 'Add-on cover', hint: 'A rider bought or dropped mid-term.' },
  { key: 'ownershipTransfer', label: 'Ownership transfer', hint: 'The asset changes hands, the cover follows it.' },
]

const CANCELLATION_FIELDS: readonly EndorsementChangeField[] = [
  { key: 'status', label: 'Policy status', hint: 'The cover is cancelled from the effective date.' },
]

const SHAPES: Readonly<Record<EndorsementType, Omit<EndorsementFormShape, 'premiumFields'>>> = {
  non_financial: {
    type: 'non_financial',
    heading: 'Correction',
    summary: 'A name, an address, a nominee. Nothing about the cost changes.',
    explanation:
      'A correction to what the schedule says about a person: a name, an address, a nominee. It changes no money, so this form carries no premium field and the record carries neither a delta nor a refund.',
    permittedFields: NON_FINANCIAL_FIELDS.map((field) => field.key),
    changeFields: NON_FINANCIAL_FIELDS,
    runsClaimsCheck: false,
  },
  financial: {
    type: 'financial',
    heading: 'Financial change',
    summary: 'A member added, the sum insured moved, a rider bought.',
    explanation:
      'A change the insurer prices: a member added, the sum insured moved, a rider bought. The premium delta is typed from the insurer endorsement advice — this platform never works one out from the old and new premiums.',
    permittedFields: FINANCIAL_FIELDS.map((field) => field.key),
    changeFields: FINANCIAL_FIELDS,
    runsClaimsCheck: false,
  },
  cancellation: {
    type: 'cancellation',
    heading: 'Cancellation',
    summary: 'The cover ends mid-term, after the claims-in-period check.',
    explanation:
      'The cover ends mid-term. The claims-in-period check runs against this platform’s own claim data before anything else: a claim inside the period means no refund is due, and where the period is clear the insurer’s refund figure is typed on the record afterwards.',
    permittedFields: CANCELLATION_FIELDS.map((field) => field.key),
    changeFields: CANCELLATION_FIELDS,
    runsClaimsCheck: true,
  },
}

/** The form for one type. The only thing a capture screen branches on. */
export function shapeFor(type: EndorsementType): EndorsementFormShape {
  const base = SHAPES[type]
  return {
    ...base,
    // Narrowed from the domain's own answer, never assembled here. For a
    // non-financial endorsement `premiumFieldsFor` returns nothing, and nothing
    // filtered is still nothing.
    premiumFields: premiumFieldsFor(type).filter((name) => CAPTURE_PREMIUM_FIELDS.includes(name)),
  }
}

/**
 * Exactly what the form is showing, as `selectType` wants to be told it.
 *
 * The machine checks this list against `PREMIUM_FIELD_NAMES`, so it has to be
 * the truth about the screen rather than a restatement of the type: a form that
 * showed a premium box and reported an empty list would pass a guard it should
 * have failed. Every field the form offers is listed, ticked or not — a control
 * nobody has filled in is still a control on the screen.
 */
export function renderedFieldsOf(shape: EndorsementFormShape): readonly string[] {
  return [...shape.changeFields.map((field) => field.key), ...shape.premiumFields]
}
