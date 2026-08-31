/**
 * Reading an issuance row — its words, its colour, and what is still awaited.
 *
 * Pure: no DOM, no repository, no React, and — this is the one that matters on a
 * screen about a policy premium — no arithmetic. Nothing in this file produces a
 * `Money`, adds two amounts or defaults one to zero. An amount reaches a column
 * as the `Money` somebody typed and is formatted at the render edge (D3).
 *
 * The vocabulary a policy already has is imported rather than restated:
 * `POLICY_LABEL` and `POLICY_TONE` live in the policies feature and this queue
 * says the same words about the same states. A second wording here is how a
 * policy comes to read as "Sent to insurer" on one screen and "With insurer" on
 * the next.
 */

import { POLICY_STATES } from '../../domain/workflows'
import type { PolicyState } from '../../domain/workflows'
import type { DocumentRecord, PaymentState, Policy, PolicyEntryDraft } from '../../data/repo'
import type { Severity } from '../../ui/tone'

/**
 * The span this desk owns — plan §9's policy machine, read as a job rather than
 * as a state list.
 *
 * It starts where the entry stops mattering and the insurer starts: a proposal
 * has been raised, so the next thing that happens to this record is somebody
 * outside the agency answering. It ends when the customer has the document,
 * which is `documents_collected` — so that state and everything after it are
 * deliberately outside.
 *
 * `draft` is not here either, and that is the boundary with `/back-office/drafts`:
 * a draft is an entry somebody has yet to finish, and finishing it is a different
 * job done on a different screen. A policy that is both half-entered and with the
 * insurer appears on both queues because both jobs are genuinely outstanding —
 * that is two jobs on one record, not one job counted twice.
 */
export const ISSUANCE_STATES: readonly PolicyState[] = [
  POLICY_STATES.proposal,
  POLICY_STATES.sent,
  POLICY_STATES.issued,
  POLICY_STATES.dispatched,
]

/** Whether a policy is inside the issuance desk's span at all. */
export function inIssuanceSpan(status: PolicyState): boolean {
  return ISSUANCE_STATES.includes(status)
}

/**
 * The states in which the insurer has already answered.
 *
 * Used to decide whether an absent `insurerNo` is ordinary or is a hole: a
 * proposal that has no insurer number has not been given one yet, while an
 * issued policy that has none is a live contract whose own number nobody wrote
 * down.
 */
export function insurerHasAnswered(status: PolicyState): boolean {
  return status === POLICY_STATES.issued || status === POLICY_STATES.dispatched
}

/* --------------------------------------------------------- the insurer's number */

/**
 * §8's dual numbering, as the one thing this queue is actually about.
 *
 * `systemNo` is always there. `insurerNo` arrives with the insurer's document
 * and, on this queue more than anywhere else in the product, has not arrived
 * yet. So "awaited" is a state a person filters on rather than a blank cell they
 * have to notice.
 */
export const INSURER_NUMBER_STATES = {
  awaited: 'awaited',
  received: 'received',
} as const

export type InsurerNumberState =
  (typeof INSURER_NUMBER_STATES)[keyof typeof INSURER_NUMBER_STATES]

export const INSURER_NUMBER_LABEL: Readonly<Record<InsurerNumberState, string>> = {
  awaited: 'Insurer number awaited',
  received: 'Insurer number received',
}

export function insurerNumberStateOf(policy: Policy): InsurerNumberState {
  const value = policy.insurerNo
  return typeof value === 'string' && value.trim() !== ''
    ? INSURER_NUMBER_STATES.received
    : INSURER_NUMBER_STATES.awaited
}

/* --------------------------------------------------------------- the paperwork */

/**
 * Whether the insurer's own policy document is on file for this policy.
 *
 * Presence, never content (§14.1). This reads `isPresent` off the document
 * record and nothing else — not the file name, not the extracted text, not a
 * single OCR value.
 */
export function policyDocumentPresent(documents: readonly DocumentRecord[]): boolean {
  return documents.some((document) => document.docType === 'policy_pdf' && document.isPresent)
}

/** Documents on this policy that a person has yet to look at. */
export function documentsAwaitingReview(documents: readonly DocumentRecord[]): number {
  return documents.filter(
    (document) => document.reviewState === 'awaiting' || document.reviewState === 'submitted',
  ).length
}

/* -------------------------------------------------------------------- the money */

/**
 * Whether the premium has actually been collected and checked.
 *
 * A read of the recorded `paymentState` and nothing more. This function does not
 * know what the premium is, cannot compare it to anything and never produces a
 * figure — the only money on this queue is the `Money` a person typed, rendered
 * read-only by `<Money>`.
 */
export function premiumSettled(paymentState: PaymentState): boolean {
  return paymentState === 'verified'
}

/* ------------------------------------------------------------------- the clock */

const DAY_MS = 86_400_000

/**
 * When this record last moved through somebody's hands, as far as the book can
 * say.
 *
 * `Policy` carries no `updatedAt` and no "entered this state at", so there is no
 * honest answer for a policy with no entry beside it — and this returns null
 * rather than inventing one from `startDate`, which is a fact about the cover
 * and not about the desk. The queue prints "not recorded" for those rows and the
 * screen says why. Making one up would put an age on a row that nobody could
 * check.
 */
export function inDeskSince(draft: PolicyEntryDraft | null): string | null {
  return draft?.savedAt ?? null
}

/** Whole days since the entry was last saved. Null when nothing recorded it. */
export function daysInDesk(draft: PolicyEntryDraft | null, now: Date): number | null {
  const at = inDeskSince(draft)
  if (at === null) return null
  const saved = new Date(at).getTime()
  if (Number.isNaN(saved)) return null
  return Math.floor((now.getTime() - saved) / DAY_MS)
}

/**
 * How long a policy may sit with the insurer before the row is shouting.
 *
 * Seven days rather than two: unlike a collection, the agency is not holding
 * anything here — it is waiting on somebody else, and a chase before a week is
 * noise. The number is a constant here and configuration in P1 (FR-22), the same
 * move the collections and Assistant thresholds are waiting to make.
 */
export const ISSUANCE_AGE_LIMIT_DAYS = 7

/* ----------------------------------------------------------------- the severity */

export type IssuanceSeverityInput = {
  readonly policy: Policy
  readonly draft: PolicyEntryDraft | null
  readonly documents: readonly DocumentRecord[]
  readonly now: Date
}

/**
 * How much trouble a row is in, in the queue stripe's shorter language.
 *
 * The order of the tests is the argument, and each one is a different person's
 * problem:
 *
 *   `hot`  — the contract is live and its own insurer number was never written
 *            down. Cover is running against a record the insurer cannot look up,
 *            which is the one genuine breach this desk can produce;
 *   `warm` — waiting on the insurer, and either long enough to chase or with the
 *            premium still uncollected. Nobody here can move it;
 *   `attn` — lime, "needs a person": the move is ours to make. A raised proposal
 *            nobody has sent, or an issued policy whose paperwork is still
 *            sitting in the review queue;
 *   `good` — issued, numbered, paid and papered.
 *
 * Lime never means an error (U7), and nothing on this queue goes red for age.
 */
export function issuanceSeverity(input: IssuanceSeverityInput): Severity {
  const { policy, draft, documents, now } = input

  if (insurerHasAnswered(policy.status) && insurerNumberStateOf(policy) === 'awaited') {
    return 'hot'
  }

  if (policy.status === POLICY_STATES.proposal) return 'attn'

  if (policy.status === POLICY_STATES.sent) {
    // Amber once it has been out long enough to chase; in-progress before that.
    // Never lime: lime means somebody here can act, and while a proposal is with
    // the insurer nobody here can.
    const waited = daysInDesk(draft, now)
    return waited !== null && waited >= ISSUANCE_AGE_LIMIT_DAYS ? 'warm' : 'cool'
  }

  if (!premiumSettled(policy.paymentState)) return 'warm'
  if (documentsAwaitingReview(documents) > 0) return 'attn'
  if (!policyDocumentPresent(documents)) return 'attn'

  return 'good'
}

/**
 * What is standing between this row and a customer holding their document.
 *
 * Sentences rather than flags, because the queue's whole job is to say which of
 * six hundred policies wants a person today and why. Nothing here decides
 * anything: every move is still the machine's, and the machine's own refusal is
 * what the drawer prints when one is attempted.
 */
export function issuanceOutstanding(input: IssuanceSeverityInput): readonly string[] {
  const { policy, documents } = input
  const outstanding: string[] = []

  if (policy.status === POLICY_STATES.proposal) {
    outstanding.push('The proposal is raised and has not been sent to the insurer.')
  }

  if (policy.status === POLICY_STATES.sent) {
    outstanding.push('With the insurer. Nobody here can move it until they answer.')
  }

  if (insurerHasAnswered(policy.status) && insurerNumberStateOf(policy) === 'awaited') {
    outstanding.push(
      'The policy is live and the insurer’s own number is not on the record. Until it is, nobody outside this platform can look this contract up.',
    )
  }

  if (!premiumSettled(policy.paymentState)) {
    outstanding.push('The premium is not recorded as verified against this policy.')
  }

  if (insurerHasAnswered(policy.status) && !policyDocumentPresent(documents)) {
    outstanding.push('No insurer policy document is on file.')
  }

  const waiting = documentsAwaitingReview(documents)
  if (waiting > 0) {
    outstanding.push(
      waiting === 1
        ? 'One document on this policy is still waiting on a reviewer.'
        : `${waiting} documents on this policy are still waiting on a reviewer.`,
    )
  }

  return outstanding
}
