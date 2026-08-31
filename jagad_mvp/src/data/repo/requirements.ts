/**
 * What the customer said they need — FR-06.16.
 *
 * §9.2 step 4 opens with "Assignee selects the customer + candidate policies",
 * which assumes the agent already knows the household size, the ages, the budget
 * and the existing cover. Somebody found all of that out on a phone call. Until
 * this record existed it lived in a notebook, and the quotation composer was
 * filled in from memory.
 *
 * The values are a `FormValues` bag rather than columns, because the questions
 * are a schema an admin edits — see `src/domain/forms/seeds/requirement-*.ts`.
 * `schemaVersion` is pinned at capture for the same reason every other captured
 * record pins one: a requirement taken last March has to keep rendering under
 * the questions that were actually asked, not under today's.
 *
 * One value is revised rather than appended: unlike an `Activity`, a requirement
 * is a current statement of what somebody wants, and wants change on the second
 * call. So there is a `revise`, and the event log carries the history.
 */

import type { FormValues } from '../../domain/forms'
import type { ReadRepository } from './query'
import type { MutationResult } from './result'

export type RequirementRecord = {
  readonly id: string
  readonly inquiryId: string
  /** The schema these answers were given against. */
  readonly formSchemaId: string
  readonly objectKey: string
  readonly schemaVersion: number
  readonly values: FormValues
  readonly capturedBy: string
  readonly capturedAt: string
  readonly revisedAt: string | null
}

export type CaptureRequirementCommand = {
  readonly actorId: string
  readonly inquiryId: string
  readonly formSchemaId: string
  readonly objectKey: string
  readonly schemaVersion: number
  readonly values: FormValues
  readonly now?: Date
}

export type RequirementRepository = ReadRepository<RequirementRecord> & {
  forInquiry(inquiryId: string): Promise<RequirementRecord | null>
  /** Captures the first statement, or replaces a previous one on the same inquiry. */
  capture(command: CaptureRequirementCommand): Promise<MutationResult<RequirementRecord>>
}
