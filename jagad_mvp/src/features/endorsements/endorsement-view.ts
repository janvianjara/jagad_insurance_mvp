/**
 * How an endorsement reads on screen — plan §5 ("Endorsement"), §9, canvas
 * n51–n56.
 *
 * The one thing in this file that is a rule rather than a wording choice is
 * `figureOf`. §9 says a non-financial endorsement renders no premium fields at
 * all, so the function that answers "which money figure does this record show"
 * answers `null` for a non-financial type — there is no branch below that can
 * hand a screen an amount to draw for a correction to a spelling.
 */

import type { EndorsementState, EndorsementType } from '../../domain/workflows'
import type { Endorsement, EndorsementFigure } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

export const ENDORSEMENT_LABEL: Readonly<Record<EndorsementState, string>> = {
  type_selected: 'Type chosen',
  non_financial: 'Correction',
  delta_entry: 'Delta awaited',
  claims_check: 'Claims check',
  refund_not_eligible: 'No refund due',
  refund_typed: 'Refund recorded',
  submitted: 'Submitted',
  approved: 'Approved',
  policy_versioned: 'Policy versioned',
}

/**
 * U7's vocabulary. Lime is the four states that are waiting on a person; green
 * is only the two that are genuinely finished.
 */
export const ENDORSEMENT_TONE: Readonly<Record<EndorsementState, Tone>> = {
  type_selected: 'attn',
  non_financial: 'attn',
  delta_entry: 'attn',
  claims_check: 'attn',
  refund_not_eligible: 'warn',
  refund_typed: 'info',
  submitted: 'warn',
  approved: 'ok',
  policy_versioned: 'ok',
}

export const ENDORSEMENT_TYPE_LABEL: Readonly<Record<EndorsementType, string>> = {
  non_financial: 'Non-financial',
  financial: 'Financial',
  cancellation: 'Cancellation',
}

/** How much trouble a row is in, as the queue stripe expresses it. */
export function endorsementSeverity(row: Endorsement): Severity | undefined {
  if (row.state === 'refund_not_eligible') return 'warm'
  if (row.state === 'submitted' || row.state === 'approved') return 'cool'
  if (row.state === 'policy_versioned') return 'good'
  return 'attn'
}

/** One money figure on an endorsement, named the way the screen names it. */
export type EndorsementReading = {
  readonly label: string
  readonly figure: EndorsementFigure
}

/**
 * The figure this endorsement carries, or `null` where it carries none.
 *
 * §9, made a function: a non-financial endorsement has no money reading, so a
 * screen asking this question for one gets nothing to render rather than a zero,
 * a blank field or a disabled control. A disabled premium field is still a
 * premium field.
 */
export function figureOf(endorsement: Endorsement): EndorsementReading | null {
  if (endorsement.type === 'financial') {
    return { label: 'Premium delta', figure: endorsement.delta }
  }
  if (endorsement.type === 'cancellation') {
    return { label: 'Refund', figure: endorsement.refund }
  }
  return null
}

/** Whether the record has reached the point where its figure has been typed. */
export function figureIsRecorded(endorsement: Endorsement): boolean {
  const reading = figureOf(endorsement)
  return reading !== null && reading.figure.amount !== null
}
