/**
 * Who a consent link may be sent to, and why the rest were left out — FR-08.4,
 * FR-20, FR-21, plan §9.
 *
 * Pure, and outside the queue configuration, because the interesting half of a
 * bulk send is the exclusions. A batch that quietly dropped rows would look
 * identical to one that sent to everybody, and the person who ticked forty boxes
 * would have no way to tell which happened — so the reason each row was left out
 * is a value this module returns rather than a filter it applies silently.
 *
 * Nothing here sends anything, and nothing here decides whether the machine will
 * accept the move. `consentMachine` owns that; this decides who is worth asking
 * about, which is a different question and a cheaper one.
 */

import { CONSENT_CADENCE } from '../../domain/automation'
import type { Customer } from '../../data/repo'

/**
 * The cadence FR-21 runs on.
 *
 * It used to be defined here with a note saying nothing read it, because there
 * was no scheduler. There is one now, and it lives in `src/domain/automation`,
 * which cannot import a feature — so the definition moved down and this is a
 * re-export. Every caller that already read it from here still does; there is
 * still exactly one copy of these numbers in the tree, which is the property
 * that matters. `maxAttempts` is enforced below, as it always was: a cap that
 * only exists in the automation is not a cap on the person clicking Send.
 */
export { CONSENT_CADENCE }

/** Why a selected row is not getting a link. Each one is shown to the person. */
export const CHASE_EXCLUSIONS = {
  linkLive: 'a link is already out and unanswered',
  alreadyGiven: 'consent has already been recorded',
  capReached: `already chased ${CONSENT_CADENCE.maxAttempts} times`,
} as const

export type ChaseExclusion = (typeof CHASE_EXCLUSIONS)[keyof typeof CHASE_EXCLUSIONS]

/**
 * Why this customer cannot be chased right now, or null if they can be.
 *
 * The order matters and is the order a person would reason in: whether they
 * already answered, then whether something is already out, then whether we have
 * asked enough times.
 */
export function chaseExclusionFor(customer: Customer): ChaseExclusion | null {
  if (customer.consentState === 'submitted') return CHASE_EXCLUSIONS.alreadyGiven
  if (customer.consentState === 'link_issued') return CHASE_EXCLUSIONS.linkLive
  if (customer.consentChaseCount >= CONSENT_CADENCE.maxAttempts) {
    return CHASE_EXCLUSIONS.capReached
  }
  return null
}

export function canBeChased(customer: Customer): boolean {
  return chaseExclusionFor(customer) === null
}

export type ChaseSplit = {
  readonly sending: readonly Customer[]
  /** Each excluded row with the sentence saying why, for the gate's preview. */
  readonly excluded: readonly { readonly customer: Customer; readonly why: ChaseExclusion }[]
}

/** Splits a selection into who gets a link and who does not, with reasons. */
export function splitForChase(rows: readonly Customer[]): ChaseSplit {
  const sending: Customer[] = []
  const excluded: { customer: Customer; why: ChaseExclusion }[] = []

  for (const customer of rows) {
    const why = chaseExclusionFor(customer)
    if (why === null) sending.push(customer)
    else excluded.push({ customer, why })
  }

  return { sending, excluded }
}

/** "3 already chased 3 times, 1 a link is already out" — the gate's own line. */
export function excludedSummary(excluded: ChaseSplit['excluded']): string {
  const counts = new Map<ChaseExclusion, number>()
  for (const row of excluded) counts.set(row.why, (counts.get(row.why) ?? 0) + 1)
  return [...counts.entries()].map(([why, count]) => `${count} ${why}`).join(', ')
}
