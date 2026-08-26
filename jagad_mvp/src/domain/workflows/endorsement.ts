/**
 * Endorsement and cancellation - plan §9, FR-13, canvas n51-n56, P2.
 *
 *   type_selected -+- non_financial -> correction fields only (no premium block)
 *                  +- financial     -> delta entry -> commission delta hook
 *                  +- cancellation  -> claims-in-period check -+- claim found -> refund_not_eligible
 *                                                              +- clear -> refund typed (insurer figure)
 *     -> submitted -> approved -> policy_versioned (immutable, both endorsement nos., new PDF)
 *
 * The claims-in-period check runs against the platform's own claim data, which is
 * why it is a synchronous function taking the claims as an argument rather than
 * something that goes and asks an insurer. §9's other two rules: a non-financial
 * endorsement renders no premium fields at all, and a change too large for an
 * endorsement is refused with a guard that says to issue fresh instead.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const ENDORSEMENT_STATES = {
  typeSelected: 'type_selected',
  nonFinancial: 'non_financial',
  deltaEntry: 'delta_entry',
  claimsCheck: 'claims_check',
  refundNotEligible: 'refund_not_eligible',
  refundTyped: 'refund_typed',
  submitted: 'submitted',
  approved: 'approved',
  policyVersioned: 'policy_versioned',
} as const

export type EndorsementState = (typeof ENDORSEMENT_STATES)[keyof typeof ENDORSEMENT_STATES]

export const ENDORSEMENT_TYPES = {
  nonFinancial: 'non_financial',
  financial: 'financial',
  cancellation: 'cancellation',
} as const

export type EndorsementType = (typeof ENDORSEMENT_TYPES)[keyof typeof ENDORSEMENT_TYPES]

/**
 * Every field name that carries money on an endorsement screen. The
 * non-financial guard asserts none of them is rendered - §9 says "no premium
 * fields at all", and a disabled premium field is still a premium field.
 */
export const PREMIUM_FIELD_NAMES = [
  'premiumDelta',
  'netPremium',
  'gstAmount',
  'finalPremium',
  'refundAmount',
] as const

export type PremiumFieldName = (typeof PREMIUM_FIELD_NAMES)[number]

/** Which money fields a type is entitled to show. Non-financial gets an empty list. */
export function premiumFieldsFor(type: EndorsementType): readonly PremiumFieldName[] {
  if (type === ENDORSEMENT_TYPES.nonFinancial) return []
  if (type === ENDORSEMENT_TYPES.cancellation) return ['refundAmount']
  return ['premiumDelta', 'netPremium', 'gstAmount', 'finalPremium']
}

export const AMOUNT_SOURCES = { typedFromInsurer: 'typed_from_insurer', derived: 'derived' } as const
export type AmountSource = (typeof AMOUNT_SOURCES)[keyof typeof AMOUNT_SOURCES]

export type EndorsementAmount = {
  readonly amount?: Money
  readonly source?: AmountSource
  readonly insurerReference?: string
}

/** A claim the platform already holds against this policy. */
export type ClaimInPeriod = {
  readonly claimId: string
  readonly occurredOn: string
}

/** What an endorsement is allowed to change before it stops being an endorsement. */
export type EndorsementScope = {
  readonly permittedFields: readonly string[]
}

export type EndorsementContext = {
  readonly type?: EndorsementType
  /** The fields the form is actually rendering, as the screen reports them. */
  readonly renderedFields?: readonly string[]
  readonly changedFields?: readonly string[]
  readonly scope?: EndorsementScope
  /** True when the change swaps the insured person, vehicle or property outright. */
  readonly replacesInsuredEntity?: boolean
  readonly delta?: EndorsementAmount
  readonly refund?: EndorsementAmount
  /** Claims the platform holds for this policy inside the cancellation period. */
  readonly claimsInPeriod?: readonly ClaimInPeriod[]
  readonly endorsementNo?: string
  readonly insurerEndorsementNo?: string
  readonly newDocumentVersion?: number
  readonly priorVersionLocked?: boolean
}

export type ClaimsInPeriodVerdict = {
  readonly refundEligible: boolean
  readonly claimIds: readonly string[]
}

/**
 * §9: "The claims-in-period check runs against the platform's own claim data and
 * returns instantly." Synchronous by construction - it is handed the claims and
 * counts them.
 */
export function claimsInPeriodCheck(claims: readonly ClaimInPeriod[]): ClaimsInPeriodVerdict {
  return { refundEligible: claims.length === 0, claimIds: claims.map((claim) => claim.claimId) }
}

function wrongType(ctx: EndorsementContext, wanted: EndorsementType): TransitionResult {
  return refuse(
    `This endorsement is typed as ${ctx.type ?? 'nothing yet'}, so the ${wanted} path does not apply to it.`,
  )
}

export function typeIsNonFinancial(ctx: EndorsementContext): TransitionResult {
  return ctx.type === ENDORSEMENT_TYPES.nonFinancial ? allow() : wrongType(ctx, ENDORSEMENT_TYPES.nonFinancial)
}

export function typeIsFinancial(ctx: EndorsementContext): TransitionResult {
  return ctx.type === ENDORSEMENT_TYPES.financial ? allow() : wrongType(ctx, ENDORSEMENT_TYPES.financial)
}

export function typeIsCancellation(ctx: EndorsementContext): TransitionResult {
  return ctx.type === ENDORSEMENT_TYPES.cancellation ? allow() : wrongType(ctx, ENDORSEMENT_TYPES.cancellation)
}

/** §9: "Non-financial types must render no premium fields at all." */
export function nonFinancialRendersNoPremiumFields(ctx: EndorsementContext): TransitionResult {
  if (ctx.type !== ENDORSEMENT_TYPES.nonFinancial) return allow()

  const premiumNames: readonly string[] = PREMIUM_FIELD_NAMES
  const offending = (ctx.renderedFields ?? []).filter((field) => premiumNames.includes(field))
  if (offending.length > 0) {
    return refuse(
      `A non-financial endorsement renders no premium fields, and this form is showing: ${offending.join(', ')}. Correcting a spelling does not touch money.`,
    )
  }
  if (ctx.delta !== undefined || ctx.refund !== undefined) {
    return refuse('A non-financial endorsement carries no premium delta and no refund.')
  }
  return allow()
}

/**
 * §9: "A change too large for endorsement triggers a guard suggesting fresh
 * issue." The refusal names the alternative, because the person in front of it
 * still has a customer waiting.
 */
export function changeFitsEndorsementScope(ctx: EndorsementContext): TransitionResult {
  if (ctx.replacesInsuredEntity === true) {
    return refuse(
      'This change replaces the insured person or asset outright, which is more than an endorsement can carry. Issue a fresh policy instead.',
    )
  }
  if (!ctx.scope) return allow()

  const outside = (ctx.changedFields ?? []).filter((field) => !ctx.scope?.permittedFields.includes(field))
  if (outside.length > 0) {
    return refuse(
      `These changes fall outside what an endorsement can carry: ${outside.join(', ')}. Issue a fresh policy instead.`,
    )
  }
  return allow()
}

/** The delta is typed from the insurer's endorsement advice. Nothing here works it out. */
export function endorsementDeltaIsTyped(ctx: EndorsementContext): TransitionResult {
  const delta = ctx.delta
  if (!delta || !isMoney(delta.amount)) {
    return refuse('Type the premium delta from the insurer endorsement advice.')
  }
  if (delta.source === AMOUNT_SOURCES.derived) {
    return refuse(
      'The premium delta is marked as derived. An endorsement delta is typed from the insurer figure, never calculated from the old and new premiums.',
    )
  }
  return allow()
}

/** §9: cancellation with a claim inside the period is not refund-eligible. */
export function claimFoundInPeriod(ctx: EndorsementContext): TransitionResult {
  const verdict = claimsInPeriodCheck(ctx.claimsInPeriod ?? [])
  if (verdict.refundEligible) {
    return refuse('No claim was made in this period, so the cancellation is refund-eligible and the refund is typed.')
  }
  return allow()
}

export function noClaimInPeriod(ctx: EndorsementContext): TransitionResult {
  const verdict = claimsInPeriodCheck(ctx.claimsInPeriod ?? [])
  if (!verdict.refundEligible) {
    return refuse(
      `A claim was made inside this policy period (${verdict.claimIds.join(', ')}), so no refund is due on cancellation.`,
    )
  }
  return allow()
}

export function refundIsTypedInsurerFigure(ctx: EndorsementContext): TransitionResult {
  const refund = ctx.refund
  if (!refund || !isMoney(refund.amount)) {
    return refuse('Type the refund amount from the insurer. The platform records the figure; it does not pro-rate one.')
  }
  if (refund.source === AMOUNT_SOURCES.derived) {
    return refuse(
      'The refund is marked as derived. Refunds come from the insurer figure, never from a short-period calculation done here.',
    )
  }
  if (!refund.insurerReference || refund.insurerReference.trim().length === 0) {
    return refuse('Record the insurer reference the refund figure came from.')
  }
  return allow()
}

/** §9: the new policy version is immutable and carries both endorsement numbers. */
export function versionCarriesBothEndorsementNumbers(ctx: EndorsementContext): TransitionResult {
  if (!ctx.endorsementNo) {
    return refuse('The policy version records this platform\'s endorsement number.')
  }
  if (!ctx.insurerEndorsementNo) {
    return refuse('The policy version records the insurer\'s endorsement number as well as our own. Both are read aloud on the phone.')
  }
  if (typeof ctx.newDocumentVersion !== 'number' || ctx.newDocumentVersion < 2) {
    return refuse('An approved endorsement produces a new document version; it never edits the version already issued.')
  }
  if (ctx.priorVersionLocked !== true) {
    return refuse('Lock the prior policy version before writing the new one. Earlier versions stay exactly as they were issued.')
  }
  return allow()
}

export const ENDORSEMENT_TRANSITIONS = {
  type_selected: {
    non_financial: {
      event: 'endorsement.type_selected',
      guards: [typeIsNonFinancial, nonFinancialRendersNoPremiumFields, changeFitsEndorsementScope],
    },
    delta_entry: {
      event: 'endorsement.type_selected',
      guards: [typeIsFinancial, changeFitsEndorsementScope],
    },
    claims_check: {
      event: 'endorsement.type_selected',
      guards: [typeIsCancellation],
    },
  },
  non_financial: {
    submitted: { event: 'endorsement.submitted', guards: [nonFinancialRendersNoPremiumFields] },
  },
  delta_entry: {
    submitted: {
      event: 'endorsement.delta_recorded',
      alsoEmits: ['endorsement.submitted'],
      guards: [endorsementDeltaIsTyped],
    },
  },
  claims_check: {
    refund_not_eligible: { event: 'endorsement.refund_blocked', guards: [claimFoundInPeriod] },
    refund_typed: {
      event: 'endorsement.refund_recorded',
      guards: [noClaimInPeriod, refundIsTypedInsurerFigure],
    },
  },
  refund_not_eligible: {
    submitted: { event: 'endorsement.submitted', note: 'The cancellation still goes through; the refund does not.' },
  },
  refund_typed: {
    submitted: { event: 'endorsement.submitted' },
  },
  submitted: {
    approved: {
      event: 'endorsement.approved',
      alsoEmits: ['commission.booked'],
      note: 'The commission delta hook fires here for a financial endorsement.',
    },
  },
  approved: {
    policy_versioned: {
      event: 'policy.versioned',
      guards: [versionCarriesBothEndorsementNumbers],
    },
  },
} as const satisfies TransitionTable<EndorsementState, EndorsementContext>

export const endorsementMachine = createMachine<EndorsementState, EndorsementContext>({
  name: 'endorsement',
  states: Object.values(ENDORSEMENT_STATES),
  initial: ENDORSEMENT_STATES.typeSelected,
  transitions: ENDORSEMENT_TRANSITIONS,
})
