/**
 * Reading a policy — the words, the tones and the urgency this feature agrees on.
 *
 * Three surfaces render policy records in P-15: the queue, the entry screen and
 * the completion queue. Left to themselves they would each invent a wording for
 * `documents_collected` and each pick a colour for a half-finished entry, and by
 * the second release the same record would read differently depending on which
 * screen somebody happened to open. So the vocabulary is stated once, here.
 *
 * Everything below is a pure read over records a repository already returned.
 * Two rules hold it in place:
 *
 *   No function in this file produces an amount. There is no `netOf`, no
 *   `totalFor`, no formatter that quietly adds. Money reaches a screen as the
 *   `Money` a person typed and is formatted at the render edge by `<Money>` (D3).
 *
 *   Tone and severity are different languages and are kept apart. `POLICY_TONE`
 *   says which state a record is in — that is what the pill carries. Severity
 *   says how much of a person's attention the row wants, which is what the queue
 *   stripe carries, and U7 is explicit that lime means "needs a person" rather
 *   than "something is wrong". A draft missing four fields is not an error; it is
 *   work, and it is coloured as work.
 */

import type { PaymentState, Policy, PolicyEntryDraft, StaffUser } from '../../data/repo'
import type { PolicyEntryPath, PolicyState, PremiumMode } from '../../domain/workflows'
import type { Severity, Tone } from '../../ui/tone'

/* ------------------------------------------------------------------- states */

export const POLICY_LABEL: Readonly<Record<PolicyState, string>> = {
  draft: 'Draft',
  proposal: 'Proposal raised',
  sent: 'Sent to insurer',
  issued: 'Issued',
  declined: 'Declined',
  dispatched: 'Dispatched',
  documents_collected: 'Documents collected',
  closed: 'Closed',
  locked: 'Locked',
  lapsed: 'Lapsed',
}

/**
 * U7, applied: green only where the record is genuinely in good standing, lime
 * where the next move is somebody's to make, grey where the file is shut.
 *
 * `sent` is amber rather than lime on purpose — the platform is waiting on the
 * insurer, so nobody here can act, and colouring it "needs a person" would put
 * attention on a row that cannot move.
 */
export const POLICY_TONE: Readonly<Record<PolicyState, Tone>> = {
  draft: 'attn',
  proposal: 'attn',
  sent: 'warn',
  issued: 'ok',
  declined: 'bad',
  dispatched: 'ok',
  documents_collected: 'ok',
  closed: 'idle',
  locked: 'idle',
  lapsed: 'bad',
}

/* ------------------------------------------------------------------ payment */

export const PAYMENT_LABEL: Readonly<Record<PaymentState, string>> = {
  unpaid: 'Unpaid',
  reference_recorded: 'Reference recorded',
  collected: 'Collected',
  verified: 'Verified',
  part_paid: 'Part paid',
}

/**
 * Only `verified` is green. A collection that has been taken but not checked by
 * the back office is genuinely in progress, and painting it positive is how a
 * cheque that never cleared comes to look settled on a queue.
 */
export const PAYMENT_TONE: Readonly<Record<PaymentState, Tone>> = {
  unpaid: 'warn',
  reference_recorded: 'info',
  collected: 'info',
  verified: 'ok',
  part_paid: 'attn',
}

/* ------------------------------------------------------- entry and schedule */

export const ENTRY_PATH_LABEL: Readonly<Record<PolicyEntryPath, string>> = {
  proposal: 'Proposal',
  direct: 'Direct entry',
}

/** §8's two number series, said in words. The entry screen prints both. */
export const ENTRY_PATH_SERIES: Readonly<Record<PolicyEntryPath, string>> = {
  proposal: 'POL-DRAFT',
  direct: 'POL',
}

export const PREMIUM_MODE_LABEL: Readonly<Record<PremiumMode, string>> = {
  single: 'Single premium',
  annual: 'Annual',
  half_yearly: 'Half yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
}

/* ---------------------------------------------------------------- severity */

/**
 * How much attention a policy row wants.
 *
 * The order of the tests is the argument. A declined or lapsed policy is the
 * only genuinely bad row; after that comes the record nobody has finished, then
 * the one waiting on an insurer, then an issued policy whose premium has not
 * been collected — which is a live contract the agency is carrying money on.
 */
export function policySeverity(policy: Policy): Severity {
  if (policy.status === 'declined' || policy.status === 'lapsed') return 'hot'
  if (policy.status === 'closed' || policy.status === 'locked') return 'cool'
  if (policy.status === 'draft' || policy.status === 'proposal') return 'attn'
  if (policy.status === 'sent') return 'warm'
  if (policy.paymentState === 'unpaid' || policy.paymentState === 'part_paid') return 'warm'
  return 'good'
}

/** The counts at which an entry stops being nearly done. See `draftSeverity`. */
export const DRAFT_NEARLY_DONE = 2
export const DRAFT_BARELY_STARTED = 4

/**
 * How much attention a half-finished entry wants, read off how much is missing.
 *
 * Nothing here is red. An incomplete entry is not a fault — it is the ordinary
 * state of a form somebody had to leave, which is exactly what canvas 3.7's
 * queue exists to hold. Four or more missing fields is a form barely started and
 * is coloured "needs a person"; one or two is close enough to finish now.
 */
export function draftSeverity(draft: PolicyEntryDraft): Severity {
  const missing = draft.missingFields.length
  if (missing >= DRAFT_BARELY_STARTED) return 'attn'
  if (missing > DRAFT_NEARLY_DONE) return 'warm'
  return 'cool'
}

/* -------------------------------------------------------------------- people */

export function nameOf(users: readonly StaffUser[], userId: string | null): string {
  if (!userId) return 'Nobody'
  return users.find((user) => user.id === userId)?.name ?? userId
}
