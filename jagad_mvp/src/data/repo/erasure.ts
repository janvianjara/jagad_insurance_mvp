/**
 * The data principal's right to ask — FR-20.2 (DPDP), plan §20.
 *
 * The acceptance criterion is quoted verbatim in `documents/PRD_GAP_ANALYSIS.md`:
 * "delete request on a live policy returns legal-obligation retention, locks
 * marketing use, logs decision". All three halves of that sentence are this
 * repository's job, and the shape of the record below is the reason it can be
 * done honestly.
 *
 * Note what an erase request is NOT. It is not a delete with a confirmation step,
 * and there is no path here that removes a customer, a policy or a claim. Those
 * carry retention that outlives anybody's preference, so the request is answered
 * with a verdict and, where retention wins, with the obligation named in prose
 * the person who asked can read. A platform that answered "you cannot do that"
 * and stopped would be exactly what the regulation was written against.
 *
 * The suppression is the part that makes the answer worth anything. Where a
 * record is retained, marketing use and automated chasing are switched off
 * against the subject, which is the thing the person actually wanted and the
 * thing the platform is genuinely free to give them.
 */

import type {
  EraseVerdict,
  RetentionObligation,
  Suppression,
} from '../../domain/amend'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/**
 * Who the request is about. Only the retained entities appear: the three
 * discardable ones have `discard`, and a request to erase a lead is answered by
 * discarding it rather than by opening a regulated file.
 */
export const ERASE_SUBJECT_ENTITIES = ['Customer', 'Policy', 'Claim'] as const
export type EraseSubjectEntity = (typeof ERASE_SUBJECT_ENTITIES)[number]

/**
 * Who asked. The distinction matters to the audit: a request the data principal
 * made themselves and one staff raised on their behalf are answered the same way
 * and evidenced differently.
 */
export const ERASE_REQUESTERS = {
  dataPrincipal: 'data_principal',
  guardian: 'guardian',
  staffOnBehalf: 'staff_on_behalf',
} as const

export type EraseRequester = (typeof ERASE_REQUESTERS)[keyof typeof ERASE_REQUESTERS]

export function isEraseRequester(value: string): value is EraseRequester {
  return (Object.values(ERASE_REQUESTERS) as readonly string[]).includes(value)
}

export type EraseRequest = {
  readonly id: string
  readonly systemNo: string
  readonly subjectEntity: EraseSubjectEntity
  readonly subjectId: string
  /** Which kind of person asked. */
  readonly requestedBy: EraseRequester
  /** The staff member who recorded it. Present even when the principal asked. */
  readonly recordedBy: string
  readonly requestedAt: string
  /**
   * Decided at the moment it is recorded, and both are non-null because of it.
   *
   * The verdict is read off what the platform holds rather than off anybody's
   * judgement, so leaving a request undecided would be a queue nobody could
   * work — there is nothing for a person to decide. A later step that adds a
   * review step adds a state, not a null.
   */
  readonly decidedAt: string
  readonly decidedBy: string
  readonly verdict: EraseVerdict
  /** Empty when the verdict is `erased`. */
  readonly obligations: readonly RetentionObligation[]
  /** The obligations as prose, rendered to the person who asked. Empty when erased. */
  readonly obligationNote: string
  /** What was switched off in place of deletion. */
  readonly suppressed: readonly Suppression[]
  /** Anything the staff member recording it added. */
  readonly note: string | null
}

export type RaiseEraseRequestCommand = {
  readonly actorId: string
  readonly subjectEntity: EraseSubjectEntity
  readonly subjectId: string
  readonly requestedBy: EraseRequester
  readonly note?: string
}

/**
 * What suppression the platform is currently holding against a subject, so a
 * screen can say "marketing is already locked" rather than opening a second
 * request that changes nothing.
 */
export type SuppressionState = {
  readonly subjectEntity: EraseSubjectEntity
  readonly subjectId: string
  readonly suppressed: readonly Suppression[]
  /** The request that put it there, newest first. Null when nothing is suppressed. */
  readonly sinceRequestId: string | null
}

export type EraseRequestRepository = ReadRepository<EraseRequest> & {
  bySystemNo(systemNo: string): Promise<EraseRequest | null>
  /** Every request ever raised about one record, oldest first. */
  forSubject(entity: EraseSubjectEntity, id: string): Promise<readonly EraseRequest[]>
  /** The queue an admin watches — every request, newest first. */
  queue(query?: ListQuery): Promise<Page<EraseRequest>>
  /** The suppression currently in force. Union of every decided request's. */
  suppression(entity: EraseSubjectEntity, id: string): Promise<SuppressionState>

  /**
   * Records the request and its decision in one act.
   *
   * One call rather than two because there is nothing between them: the verdict
   * follows from what the platform holds, and a request written without one
   * would be a row asserting that somebody asked and nobody answered. Emits
   * `erasure.requested` and `erasure.decided`, so the log can answer "did anyone
   * ever ask" separately from "what were they told".
   */
  request(command: RaiseEraseRequestCommand): Promise<MutationResult<EraseRequest>>
}
