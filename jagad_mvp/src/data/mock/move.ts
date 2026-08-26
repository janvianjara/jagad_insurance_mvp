/**
 * Every write in the mock adapter goes through here — plan §9.
 *
 * The rule this file exists to make unbreakable: a repository never assigns a
 * status. It hands the machine the record's current state, the target, and the
 * facts the guards need; the machine either allows the move and emits, or refuses
 * with a sentence. Only after an allow does the row change, and the row that gets
 * written is produced by `apply`, which receives the events so a record can store
 * the timestamp the bus stamped rather than one of its own.
 *
 * A refusal is not a silent no-op. It comes back as a `Rejected` carrying the
 * machine's `reason` and the guard's name, because "the button did nothing" is
 * the failure mode §9 spends most of its length trying to prevent.
 */

import type { DomainEvent } from '../../domain/events'
import type { Machine } from '../../domain/workflows'
import { committed, notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import type { MockStore } from './store'

export type MoveOptions<S extends string, Ctx, T> = {
  readonly store: MockStore
  readonly table: Map<string, T>
  /** Entity name for the event subject and for the not-found sentence. */
  readonly entity: string
  readonly id: string
  readonly machine: Machine<S, Ctx>
  /** Reads the record's current state. The caller never passes `from` by hand. */
  readonly stateOf: (record: T) => S
  readonly to: S
  readonly ctx: Ctx
  readonly actorId: string
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  /** Produces the row to write. Called only after the machine has allowed the move. */
  readonly apply: (record: T, events: readonly DomainEvent[]) => T
}

export function move<S extends string, Ctx, T>(
  options: MoveOptions<S, Ctx, T>,
): MutationResult<T> {
  const { store, table, entity, id, machine, stateOf, to, ctx, actorId, detail, apply } = options

  const record = table.get(id)
  if (!record) return notFound(entity, id)

  const outcome = machine.transition(stateOf(record), to, ctx, {
    bus: store.bus,
    actorId,
    subject: { entity, id },
    detail,
  })

  if (!outcome.ok) {
    return rejected(outcome.reason, outcome.code, outcome.guard)
  }

  const updated = apply(record, outcome.events)
  table.set(id, updated)
  return committed(updated, outcome.events)
}

/**
 * A write with no state change behind it — recording a value on a record that is
 * already in the right state. It still emits, because a change nobody can observe
 * is the silent drop §9 keeps warning about.
 */
export function record<T>(options: {
  readonly store: MockStore
  readonly table: Map<string, T>
  readonly entity: string
  readonly id: string
  readonly event: Parameters<MockStore['bus']['emit']>[0]
  readonly actorId: string
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  readonly apply: (record: T, events: readonly DomainEvent[]) => T
}): MutationResult<T> {
  const { store, table, entity, id, event, actorId, detail, apply } = options

  const existing = table.get(id)
  if (!existing) return notFound(entity, id)

  const emitted = store.bus.emit(event, { actorId, subject: { entity, id }, detail })
  const updated = apply(existing, [emitted])
  table.set(id, updated)
  return committed(updated, [emitted])
}
