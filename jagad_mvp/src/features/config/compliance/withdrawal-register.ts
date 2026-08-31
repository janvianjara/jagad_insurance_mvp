/**
 * Consent withdrawal, agency-wide, and the skips it is supposed to cause —
 * FR-17.3: "consent withdrawal honoured, skips logged".
 *
 * Two halves, and they are held in two different places for a reason worth
 * stating rather than hiding.
 *
 * ## The withdrawal
 *
 * `ConsentState` has four members and none of them is `withdrawn`. There is no
 * transition to make, no repository field to write, and this register will not
 * move a status behind the machine's back to make a screen read tidily. So a
 * withdrawal is held as a record of its own, in the shape the customer's own
 * consent tab uses — `customerId`, `withdrawnAt`, `actorId`, `channels`,
 * `reason` — deliberately identical, so that the day a `ConsentWithdrawal` table
 * exists both surfaces read the same rows and neither has to be rewritten.
 *
 * Until then the two surfaces hold their own: the customer's tab records a
 * withdrawal against that customer's file, this register records one for the
 * agency, and neither can see the other's. That is a gap, it is named in the
 * report, and it is a smaller lie than a shared store nobody wrote.
 *
 * ## The skip
 *
 * The skip log is NOT held here. `RecipeRun` already records every evaluation the
 * automation dispatcher makes, including the ones that declined to send and the
 * machine's own sentence for why — that is the log FR-17.3 asks for, and it is
 * written by the runtime rather than by a screen. This module is the register's
 * read model over it: the runs that declined, with the ones that declined for a
 * consent reason picked out.
 *
 * If the ledger is empty, the honest reading is that no automated run has been
 * evaluated yet — not that nothing was suppressed. The screen says that in those
 * words rather than rendering an empty table as an all-clear.
 */

import type { MessageChannel, RecipeRun } from '../../../data/repo'

/**
 * One withdrawal. The same shape the customer desk holds, on purpose.
 *
 * `channels` is what the person asked the agency to stop using and `reason` is
 * in the words of whoever took the call. Neither is inferred, and a withdrawal
 * with no channels is not recordable.
 */
export type ConsentWithdrawal = {
  readonly customerId: string
  readonly withdrawnAt: string
  /** Who recorded it. A member of staff — the customer has no session here. */
  readonly actorId: string
  readonly channels: readonly MessageChannel[]
  readonly reason: string
}

export const WITHDRAWAL_RIGHT =
  'A person may withdraw consent as easily as they gave it. Withdrawal does not undo what was lawful before it, and it does not reach records the agency is required by insurance law to keep.'

export const WITHDRAWAL_NOT_ON_THE_MACHINE =
  'Held as a record of its own. The consent state machine has no withdrawn state, so the consent pill still shows where the link itself got to — this platform does not move a status behind the machine to make a screen read more tidily.'

/** Every channel any withdrawal has stopped, for one customer or across the book. */
export function suppressedChannels(
  withdrawals: readonly ConsentWithdrawal[],
): readonly MessageChannel[] {
  return [...new Set(withdrawals.flatMap((withdrawal) => withdrawal.channels))]
}

export function withdrawalsFor(
  withdrawals: readonly ConsentWithdrawal[],
  customerId: string,
): readonly ConsentWithdrawal[] {
  return withdrawals.filter((withdrawal) => withdrawal.customerId === customerId)
}

/** Customers with at least one withdrawal against them. */
export function withdrawnCustomerIds(
  withdrawals: readonly ConsentWithdrawal[],
): readonly string[] {
  return [...new Set(withdrawals.map((withdrawal) => withdrawal.customerId))]
}

/* ------------------------------------------------------------- the skip log */

export type SkippedSend = {
  readonly id: string
  readonly at: string
  readonly recipeKey: string
  readonly trigger: string
  readonly subjectEntity: string | null
  readonly subjectId: string | null
  /** The machine's own sentence. Rendered unedited. */
  readonly reason: string
  /** True where the reason names consent, a withdrawal or a suppression. */
  readonly consentRelated: boolean
}

const CONSENT_WORDS = ['consent', 'withdraw', 'suppress', 'opted out', 'opt-out']

export function isConsentReason(reason: string): boolean {
  const lowered = reason.toLowerCase()
  return CONSENT_WORDS.some((word) => lowered.includes(word))
}

/**
 * The declined runs, newest first. Reads `decision`, `reason` and the subject
 * pointer — never the message body, which is not on a run in the first place.
 */
export function skippedSends(runs: readonly RecipeRun[]): readonly SkippedSend[] {
  return runs
    .filter((run) => run.decision === 'skipped')
    .map((run) => ({
      id: run.id,
      at: run.evaluatedAt,
      recipeKey: run.recipeKey,
      trigger: run.trigger,
      subjectEntity: run.subjectEntity,
      subjectId: run.subjectId,
      reason: run.reason,
      consentRelated: isConsentReason(run.reason),
    }))
    .toSorted((a, b) => b.at.localeCompare(a.at))
}

/** Said on screen when the run ledger is empty, so nobody reads it as an all-clear. */
export const NO_SKIPS_YET =
  'The run ledger has no declined runs in it. That means no automated run has been evaluated yet, not that nothing was suppressed: the log is written by the automation dispatcher when a recipe fires, and until one does there is nothing here to show.'

/** The half of FR-17.3 this build does not yet close, said once and out loud. */
export const WITHDRAWAL_SKIPS_NOT_LINKED =
  'A withdrawal recorded here does not yet stop a send by itself. The dispatcher writes a skip when its own guards decline, and no guard reads this register — so a withdrawal is honoured by the people who read it, and the automated half is wiring this build still owes.'
