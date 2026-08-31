/**
 * How a collection reads — its wording, its colour, and how long it has been
 * waiting for somebody to look at it.
 *
 * Pure, and outside the screens, for the reason the claims and inquiry modules
 * keep their own view modules: what is decided here is testable without a DOM,
 * and two of these are §9 assertions wearing presentation clothes.
 *
 * Nothing here computes an amount, and nothing here decides whether a collection
 * may move. `collectionMachine` owns every transition and every refusal sentence;
 * this module supplies words for states the machine already named.
 */

import { COLLECTION_STATES } from '../../domain/workflows'
import type {
  CollectionInstrument,
  CollectionMode,
  CollectionRoute,
  CollectionState,
} from '../../domain/workflows'
import type { CollectionRecord } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

/** The one place a collection state becomes a colour. U7 wording, U7 tones. */
export const COLLECTION_TONE: Readonly<Record<CollectionState, Tone>> = {
  pending: 'idle',
  reference_recorded: 'info',
  recorded: 'attn',
  verified: 'ok',
  bounced: 'bad',
  closed: 'idle',
}

export const COLLECTION_LABEL: Readonly<Record<CollectionState, string>> = {
  pending: 'Not yet collected',
  reference_recorded: 'Reference recorded',
  recorded: 'Awaiting verification',
  verified: 'Verified',
  bounced: 'Bounced',
  closed: 'Closed',
}

export const INSTRUMENT_LABEL: Readonly<Record<CollectionInstrument, string>> = {
  cash: 'Cash',
  cheque: 'Cheque',
  online: 'Online',
  mandate: 'Mandate',
}

export const MODE_LABEL: Readonly<Record<CollectionMode, string>> = {
  back_office: 'Back office',
  on_field: 'On field',
}

export const ROUTE_LABEL: Readonly<Record<CollectionRoute, string>> = {
  direct_to_company: 'Direct to company',
  via_agency: 'Via agency',
}

/**
 * How long a collection may sit unverified before the row is shouting.
 *
 * Two days rather than a week: this is money the agency is holding, and §9 makes
 * verification the thing standing between it and a closed item. The number is a
 * constant here and configuration in P1 (FR-22), the same move `THRESHOLDS` in
 * the Assistant's queue rules is waiting to make.
 */
export const VERIFICATION_AGE_LIMIT_DAYS = 2

const DAY_MS = 86_400_000

/** Whole days since the money was taken. Null when nobody has recorded that yet. */
export function daysWaiting(row: CollectionRecord, now: Date): number | null {
  if (row.collectedAt === null) return null
  const taken = new Date(row.collectedAt).getTime()
  if (Number.isNaN(taken)) return null
  return Math.floor((now.getTime() - taken) / DAY_MS)
}

/**
 * How much trouble a row is in.
 *
 * A cheque is the hottest thing in this queue whatever its age: it is the one
 * instrument that can bounce, so the longer it goes unverified the longer a
 * bounce goes unnoticed. After that it is simply age — this queue is a chase
 * list, and the stripe should say which end of it to start at.
 */
export function collectionSeverity(row: CollectionRecord, now: Date): Severity {
  const waited = daysWaiting(row, now)
  if (waited !== null && waited >= VERIFICATION_AGE_LIMIT_DAYS) {
    return row.instrument === 'cheque' ? 'hot' : 'warm'
  }
  if (row.instrument === 'cheque') return 'warm'
  return 'attn'
}

/**
 * §9: an on-field collection cannot close without back-office verification.
 *
 * The queue says this on the row rather than only in the drawer, because it is
 * the difference between "somebody should check this" and "nothing closes until
 * somebody checks this", and a person working the list is entitled to know which
 * rows are actually blocking.
 */
export function blocksClosure(row: CollectionRecord): boolean {
  return row.mode === 'on_field' && row.state === COLLECTION_STATES.recorded
}

/**
 * Whether this collection could ever bounce. Only a cheque can, and the machine
 * refuses the move for anything else — so the control is not offered.
 */
export function canBounce(row: CollectionRecord): boolean {
  return row.instrument === 'cheque' && row.state === COLLECTION_STATES.recorded
}
