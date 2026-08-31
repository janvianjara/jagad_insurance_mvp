/**
 * The six ops queues, named — plan §5 "Back-office work queue", FR-08.1.
 *
 * FR-08.1 asks for "six ops queues in one view", and the word that matters is
 * *view*. Five of the six are already somebody else's screen, or will be; this
 * module holds what the home needs to gather them — what a row is, how deep the
 * queue is, and where the work is actually done — and nothing about how any of
 * them behaves. Nothing here re-implements a queue.
 *
 * `href` is therefore the whole design of this screen in one field:
 *
 *   - a queue whose screen exists gets a link to it, and the link carries the
 *     filter that makes the linked queue show exactly what the tile counted. A
 *     tile saying 4 that opens a list of 40 is worse than no tile;
 *   - a queue whose screen is a later phase gets `null` and says so, naming the
 *     address §4 reserves for it. The count is still live, because the records
 *     are already there — what is missing is the screen, not the work.
 *
 * The state sets below are the queue definitions, and they are shared with
 * `ops-desk.ts` so the count and the link can never mean different things.
 */

import type { IconName } from '../../ui/Icon'
// The KYC queue's own definition of "still owing something", imported rather
// than restated. A second copy of that list is how a tile ends up reporting a
// depth the queue behind it does not agree with.
import { OUTSTANDING_KYC } from '../kyc/queue-config'

export const OPS_QUEUE_KEYS = {
  entry: 'entry',
  kyc: 'kyc',
  drafts: 'drafts',
  collections: 'collections',
  claims: 'claims',
  intake: 'intake',
} as const

export type OpsQueueKey = (typeof OPS_QUEUE_KEYS)[keyof typeof OPS_QUEUE_KEYS]

/* ------------------------------------------------------- the queue definitions */

/** KYC files still owing something. Taken from the KYC queue, not restated. */
export const KYC_OUTSTANDING_STATES: readonly string[] = OUTSTANDING_KYC

/**
 * A collection the back office has yet to check.
 *
 * §9: an on-field collection cannot close until the back office has verified it,
 * so `recorded` is precisely the waiting set. `reference_recorded` is money that
 * went straight to the company and never touched the agency books — nothing to
 * verify — and `bounced` is a follow-up task, not a verification.
 */
export const COLLECTION_VERIFICATION_STATES: readonly string[] = ['recorded']

/**
 * A claim the agency is waiting on somebody else for.
 *
 * Follow-up is not "every open claim": a freshly raised or picked-up claim is
 * work in hand, and a settled one is done. These five are the states where the
 * next move belongs to the customer or the insurer, which is what makes them a
 * chase list rather than a work list.
 */
export const CLAIM_FOLLOW_UP_STATES: readonly string[] = [
  'upload_link_sent',
  'checklist_raised',
  'filed_with_insurer',
  'query_open',
  'tracked',
]

/**
 * Business a sub-agent has handed in that routing has not yet moved.
 *
 * One status, deliberately. Once an inquiry is routed it belongs to whoever it
 * went to and appears in their queue with their clock running; leaving it here
 * as well would make the same work countable twice.
 */
export const SUB_AGENT_INTAKE_STATES: readonly string[] = ['new']

/** Deals placed against an agency and not yet entered as a policy. */
export const AWAITING_ENTRY_STATES: readonly string[] = ['line_items_set']

/* ------------------------------------------------------------- the descriptors */

export type OpsQueue = {
  readonly key: OpsQueueKey
  readonly title: string
  /** What one row is, in a sentence a new joiner can act on. */
  readonly what: string
  readonly icon: IconName
  /** The built screen that owns this queue, narrowed to what the tile counted. */
  readonly href: string | null
  /** The address §4 reserves for it. Named when nothing is built yet. */
  readonly address: string
  /** Which phase builds the screen. Only shown when `href` is null. */
  readonly phase: string
}

export const OPS_QUEUES: readonly OpsQueue[] = [
  {
    key: OPS_QUEUE_KEYS.entry,
    title: 'Entry',
    what: 'A won deal with its line items placed, waiting to be entered as a policy.',
    icon: 'edit',
    href: `/deals?status=${AWAITING_ENTRY_STATES.join(',')}`,
    address: '/deals',
    phase: 'M0',
  },
  {
    key: OPS_QUEUE_KEYS.kyc,
    title: 'KYC completion',
    what: 'A customer file still owing documents or consent before KYC can complete.',
    icon: 'shield',
    href: '/back-office/kyc',
    address: '/back-office/kyc',
    phase: 'M0',
  },
  {
    key: OPS_QUEUE_KEYS.drafts,
    title: 'Draft completion',
    what: 'A half-finished policy entry, with the fields still missing listed against it.',
    icon: 'doc',
    href: '/back-office/drafts',
    address: '/back-office/drafts',
    phase: 'M0',
  },
  {
    key: OPS_QUEUE_KEYS.collections,
    title: 'Collection verification',
    what: 'Money recorded in the field that the back office has not yet verified.',
    icon: 'coin',
    href: '/back-office/collections',
    address: '/back-office/collections',
    phase: 'P1',
  },
  {
    key: OPS_QUEUE_KEYS.claims,
    title: 'Claim follow-up',
    what: 'A claim where the next move belongs to the customer or the insurer.',
    icon: 'folder',
    // `/claims` is built and routed, and its queue declares a `state` filter over
    // the full claim status set — so this is a narrowing of a screen that exists,
    // exactly like entry and intake. It read `null` with "P2" against it until
    // someone checked, which is the same defect class as a stub naming a step
    // that already shipped: three real claims sat behind a sentence saying the
    // screen had not been built.
    href: `/claims?state=${CLAIM_FOLLOW_UP_STATES.join(',')}`,
    address: '/claims',
    phase: 'M0',
  },
  {
    key: OPS_QUEUE_KEYS.intake,
    title: 'Sub-agent intake',
    what: 'Business handed in by a sub-agent that routing has not moved yet.',
    icon: 'users',
    href: `/inquiries?source=sub_agent&status=${SUB_AGENT_INTAKE_STATES.join(',')}`,
    address: '/inquiries',
    phase: 'M0',
  },
]
