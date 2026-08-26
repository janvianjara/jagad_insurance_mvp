/**
 * What a mutation gives back — plan §7 and §9.
 *
 * Every write in this layer goes through a P-03 machine, and a machine refuses
 * with prose written for the person looking at the screen. That prose has to
 * survive the trip out of the repository, so a mutation returns a result object
 * rather than throwing: a refusal is an ordinary answer the UI renders, not an
 * exception the UI has to catch and translate.
 *
 * A rejection writes nothing and emits nothing. That is the same posture
 * `<ConfirmGate>` takes in the UI, and it is why the mock store applies its
 * change only after the machine has already said yes.
 */

import type { DomainEvent } from '../../domain/events'
import type { RefusalCode } from '../../domain/workflows'

/**
 * Refusals that are not a machine's doing. A machine answers "this move is not
 * allowed"; these answer "there is nothing here to move".
 */
export const REPO_REFUSAL_CODES = {
  notFound: 'not_found',
  invalidCommand: 'invalid_command',
} as const

export type RepoRefusalCode = (typeof REPO_REFUSAL_CODES)[keyof typeof REPO_REFUSAL_CODES]

export type MutationCode = RefusalCode | RepoRefusalCode

export type Committed<T> = {
  readonly ok: true
  readonly record: T
  /** Everything the machine emitted, in order. The audit timeline reads these. */
  readonly events: readonly DomainEvent[]
}

export type Rejected = {
  readonly ok: false
  readonly code: MutationCode
  /** The machine's own sentence, unedited. Render it. */
  readonly reason: string
  /** The guard that refused, when a guard was the cause. */
  readonly guard?: string
}

export type MutationResult<T> = Committed<T> | Rejected

export function committed<T>(record: T, events: readonly DomainEvent[]): Committed<T> {
  return { ok: true, record, events }
}

export function rejected(
  reason: string,
  code: MutationCode = REPO_REFUSAL_CODES.invalidCommand,
  guard?: string,
): Rejected {
  return guard === undefined ? { ok: false, code, reason } : { ok: false, code, reason, guard }
}

export function notFound(entity: string, id: string): Rejected {
  return rejected(`No ${entity} exists with id ${id}.`, REPO_REFUSAL_CODES.notFound)
}

/** Convenience for a screen that only wants the sentence. */
export function reasonOfMutation<T>(result: MutationResult<T>): string {
  return result.ok ? '' : result.reason
}
