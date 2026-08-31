/**
 * Engagement — what actually happened. Plan §9 inquiry engagement, FR-06.13.
 *
 * The PRD has Task and no Activity: §8.15 is titled "Task & Activity Engine" and
 * FR-15's entity line reads `Owns: Task, WorkQueue`. A task is a future
 * intention — *ring this person on Tuesday* — and nothing in the model recorded
 * the past fact underneath it: *I rang, and this is what he said*. Without that
 * object there is no call log, no interaction history and no honest answer to
 * "when did somebody last speak to this customer".
 *
 * So the two live side by side and neither substitutes for the other:
 *
 *              Task                     Activity
 *   tense      future                   past
 *   asks       what must be done        what happened
 *   mutable    yes, until complete      no, ever
 *   raised by  recipes and people       people and inbound channels
 *
 * `ActivityRepository` is deliberately `forSubject` / `list` / `log` and nothing
 * else. There is no `update` and no `remove`, because append-only is the whole
 * value: a call log somebody can quietly edit afterwards is not evidence of
 * anything. That is enforced by the type rather than by a convention, so adding
 * an edit path means changing this file on purpose.
 *
 * The subject is polymorphic through `subjectEntity` + `subjectId`, exactly as
 * `Task` is, so the same log serves an inquiry, a customer and a deal without
 * three nullable foreign keys.
 */

import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export const ACTIVITY_CHANNELS = {
  call: 'call',
  whatsapp: 'whatsapp',
  email: 'email',
  meeting: 'meeting',
  visit: 'visit',
} as const

export type ActivityChannel = (typeof ACTIVITY_CHANNELS)[keyof typeof ACTIVITY_CHANNELS]

/**
 * Who moved first. FR-06.18's inbound capture is this field and not a second
 * entity: a customer's reply is the same kind of fact as a staff member's call,
 * and putting them on one timeline is the point.
 */
export const ACTIVITY_DIRECTIONS = {
  outbound: 'outbound',
  inbound: 'inbound',
} as const

export type ActivityDirection =
  (typeof ACTIVITY_DIRECTIONS)[keyof typeof ACTIVITY_DIRECTIONS]

export type Activity = {
  readonly id: string
  readonly systemNo: string
  readonly subjectEntity: string
  readonly subjectId: string
  readonly channel: ActivityChannel
  readonly direction: ActivityDirection
  /** When the contact happened, which is not always when it was typed up. */
  readonly occurredAt: string
  readonly actorId: string
  /** The `Disposition` row's key. The vocabulary is config, never a union here. */
  readonly dispositionKey: string
  /**
   * What was said, in the staff member's own words.
   *
   * Classified `document-content` in `classification.ts`, which puts it outside
   * the Assistant's allow-list for good: a note on a health inquiry routinely
   * carries a diagnosis, and the constitution keeps health text out of Assistant
   * code entirely. Everything else on this record is operational, so the
   * Assistant can still say that contact happened, when, through which channel
   * and with what outcome — it simply never learns what was said.
   */
  readonly notes: string | null
  /** The task this activity raised, when the disposition demanded a next action. */
  readonly nextTaskId: string | null
  /** Which attempt this was, for the dispositions that count them. */
  readonly attemptNo: number
  /** Set when the activity records a reply to something the platform sent. */
  readonly messageLogId: string | null
  readonly createdAt: string
}

/**
 * What a screen hands over to log one contact.
 *
 * There is no `systemNo` and no `attemptNo`: the repository numbers the record
 * and counts the attempt, because a counter a caller can supply is a counter
 * that disagrees with itself by the second week.
 */
export type LogActivityCommand = {
  readonly actorId: string
  readonly subjectEntity: string
  readonly subjectId: string
  readonly channel: ActivityChannel
  readonly direction: ActivityDirection
  readonly dispositionKey: string
  readonly occurredAt?: string
  readonly notes?: string | null
  readonly nextTaskId?: string | null
  readonly messageLogId?: string | null
  readonly now?: Date
}

/**
 * Read and append. The absence of an update method is the design, not an
 * omission — see the note at the top of this file.
 */
export type ActivityRepository = ReadRepository<Activity> & {
  /** Every contact on one record, oldest first, for the timeline. */
  forSubject(subjectEntity: string, subjectId: string): Promise<readonly Activity[]>
  /** The most recent contact, or null when nobody has spoken to them yet. */
  latestFor(subjectEntity: string, subjectId: string): Promise<Activity | null>
  forActor(actorId: string, query?: ListQuery): Promise<Page<Activity>>
  log(command: LogActivityCommand): Promise<MutationResult<Activity>>
}
