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

import type { DomainEvent, DomainEventName } from '../../domain/events'
import { nextSystemNo } from '../../domain/ids'
import type { RecordKind, SystemNo } from '../../domain/ids'
import type { Guard, Machine } from '../../domain/workflows'
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
  /**
   * The event that caused this write, when a recipe caused it — FR-21.5.
   *
   * A recipe's real work is a repository call, not a bare emit, so without this
   * the task an automation raised is indistinguishable in the log from one a
   * person raised. It is also what the dispatcher's depth guard counts: an event
   * with no parent is a root, and a root restarts the chain at zero.
   */
  readonly causedBy?: string
  /** Produces the row to write. Called only after the machine has allowed the move. */
  readonly apply: (record: T, events: readonly DomainEvent[]) => T
}

export function move<S extends string, Ctx, T>(
  options: MoveOptions<S, Ctx, T>,
): MutationResult<T> {
  const { store, table, entity, id, machine, stateOf, to, ctx, actorId, detail, causedBy, apply } =
    options

  const record = table.get(id)
  if (!record) return notFound(entity, id)

  const outcome = machine.transition(stateOf(record), to, ctx, {
    bus: store.bus,
    actorId,
    subject: { entity, id },
    detail,
    causedBy,
  })

  if (!outcome.ok) {
    return rejected(outcome.reason, outcome.code, outcome.guard)
  }

  const updated = apply(record, outcome.events)
  table.set(id, updated)
  return committed(updated, outcome.events)
}

/**
 * The first write a record ever receives — the third sibling of `move` and
 * `record`.
 *
 * A creation has no edge to travel along: the record is born in its machine's
 * initial state, so there is no `from` and no transition to run. Three things
 * still have to hold, and this function is where they hold:
 *
 *   - the status is `machine.initial` and nothing else. A caller supplies facts,
 *     never a state, so there is no path here that assigns a status string;
 *   - `systemNo` comes off the store's counter. It is not in the command shape
 *     and cannot be — dual numbering (§8) is the platform's job, and a caller
 *     that could choose a number could collide with one already read aloud;
 *   - a §9 rule that applies at birth is named as an entry guard and runs before
 *     anything is written, numbered or emitted, refusing with the machine's own
 *     sentence exactly as `move` does. The deal's zero-line-item block is the
 *     one the MVP has.
 *
 * `insurerNo` is deliberately absent from the shape below: it arrives from the
 * company later, on a record that already exists, and often never arrives at all.
 */
export type CreateEntry<Ctx> = {
  /** Guards from the machine's own module, so the sentence is the machine's. */
  readonly guards: readonly Guard<Ctx>[]
  readonly ctx: Ctx
}

/** What the platform, rather than the caller, decides about a new record. */
export type Born<S extends string> = {
  readonly id: string
  readonly systemNo: SystemNo
  /** The machine's initial state. The only status a creation may write. */
  readonly status: S
}

export type CreateOptions<S extends string, Ctx, T> = {
  readonly store: MockStore
  readonly table: Map<string, T>
  /** Entity name for the event subject and for the duplicate sentence. */
  readonly entity: string
  /** Which sequence the number comes from. §8 owns the prefixes. */
  readonly kind: RecordKind
  /** Only `initial` is read — this is how a create stays unable to pick a state. */
  readonly machine: { readonly initial: S }
  /** Omitted where the machine has nothing to say about birth. */
  readonly entry?: CreateEntry<Ctx>
  /** The P-02 event a creation emits. No edge carries it, so it is named here. */
  readonly event: DomainEventName
  readonly actorId: string
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  /** The triggering event, when a recipe caused this creation. See `MoveOptions`. */
  readonly causedBy?: string
  /** Builds the row. Receives the events, so a record can store the bus's stamp. */
  readonly build: (born: Born<S>, events: readonly DomainEvent[]) => T
}

export function create<S extends string, Ctx, T>(
  options: CreateOptions<S, Ctx, T>,
): MutationResult<T> {
  const { store, table, entity, kind, machine, entry, event, actorId, detail, causedBy, build } =
    options

  // Guards first. A refusal writes nothing, emits nothing, and — the part a
  // creation adds to the posture — consumes no number.
  for (const guard of entry?.guards ?? []) {
    const verdict = guard(entry?.ctx as Ctx)
    if (!verdict.ok) return rejected(verdict.reason, verdict.code, verdict.guard ?? guard.name)
  }

  const systemNo = nextSystemNo(kind, store.ids)
  const id = systemNo.toLowerCase()
  if (table.has(id)) {
    return rejected(
      `A ${entity} already holds the number ${systemNo}. The sequence has fallen behind what is on the books.`,
    )
  }

  const emitted = store.bus.emit(event, { actorId, subject: { entity, id }, detail, causedBy })
  const row = build({ id, systemNo, status: machine.initial }, [emitted])
  table.set(id, row)
  return committed(row, [emitted])
}

/**
 * A new row that has no machine behind it — plan §9 inquiry engagement, FR-06.13.
 *
 * `create` above needs a machine because it asks the machine what state a record
 * is born in. Two things in this model are born in no state at all: a `Task`,
 * which §9 gives no machine of its own, and an `Activity`, which is a fact that
 * happened rather than a thing with a lifecycle. Handing either a pretend machine
 * so it could use `create` would put a state on a record that has none, so they
 * get this instead: the same numbering, the same emit, the same audit trail, and
 * no state.
 *
 * Note what it does not offer. There is no update path and no delete path here,
 * because the two callers are append-only by design — a call log somebody can
 * quietly revise afterwards is not evidence of anything.
 */
export function append<T>(options: {
  readonly store: MockStore
  readonly table: Map<string, T>
  readonly entity: string
  readonly kind: RecordKind
  readonly event: Parameters<MockStore['bus']['emit']>[0]
  readonly actorId: string
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  /** The triggering event, when a recipe caused this append. See `MoveOptions`. */
  readonly causedBy?: string
  readonly build: (born: { id: string; systemNo: SystemNo }, events: readonly DomainEvent[]) => T
}): MutationResult<T> {
  const { store, table, entity, kind, event, actorId, detail, causedBy, build } = options

  const systemNo = nextSystemNo(kind, store.ids)
  const id = systemNo.toLowerCase()
  if (table.has(id)) {
    return rejected(
      `A ${entity} already holds the number ${systemNo}. The sequence has fallen behind what is on the books.`,
    )
  }

  const emitted = store.bus.emit(event, { actorId, subject: { entity, id }, detail, causedBy })
  const row = build({ id, systemNo }, [emitted])
  table.set(id, row)
  return committed(row, [emitted])
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
  /** The triggering event, when a recipe caused this write. See `MoveOptions`. */
  readonly causedBy?: string
  readonly apply: (record: T, events: readonly DomainEvent[]) => T
}): MutationResult<T> {
  const { store, table, entity, id, event, actorId, detail, causedBy, apply } = options

  const existing = table.get(id)
  if (!existing) return notFound(entity, id)

  const emitted = store.bus.emit(event, { actorId, subject: { entity, id }, detail, causedBy })
  const updated = apply(existing, [emitted])
  table.set(id, updated)
  return committed(updated, [emitted])
}
