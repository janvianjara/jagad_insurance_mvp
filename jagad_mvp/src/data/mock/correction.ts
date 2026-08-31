/**
 * Correcting and discarding a record, in the mock adapter — FR-20.2, FR-20.4.
 *
 * The fourth sibling of `move`, `create` and `append` in `move.ts`, and it exists
 * for the same reason they do: a rule written once in one place is a rule six
 * repositories cannot each get slightly wrong. `amendRecord` is the only path in
 * this layer that writes a field a person typed, and every call to it runs the
 * same allow-list, the same D3 money check, the same refusal sentences and emits
 * the same event.
 *
 * Two things here are worth reading rather than skimming.
 *
 * The "before" values are read off the stored row, never taken from the caller.
 * A screen that could describe what a field currently holds could describe a
 * no-op into a change, or an unset `insurerNo` into a set one, and both of those
 * are guards this module would then be running against fiction.
 *
 * A `Money` field crosses the boundary as its integer paise and is rebuilt with
 * `fromPaise` on the way in. That is the same shape it is stored and transported
 * in, so nothing here parses a rupee string and no float ever becomes an amount.
 * Nothing here adds, scales or defaults one either: a correction records the
 * number a person typed, which is all D3 permits.
 */

import {
  amendDetail,
  amendVerdict,
  discardDetail,
  discardMarkOf,
  discardVerdict,
  isDiscarded,
  isMoneyField,
  restoreVerdict,
} from '../../domain/amend'
import type {
  AmendableEntity,
  AmendCommand,
  AmendValue,
  DiscardableEntity,
  DiscardCommand,
  DiscardMark,
  RestoreCommand,
} from '../../domain/amend'
import { fromPaise, isMoney } from '../../domain/money'
import { notFound, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'
import { record } from './move'
import type { MockStore } from './store'

/**
 * One stored value, in the scalar shape a correction speaks. `null` covers both
 * "absent" and "unset", which is honest: neither is a value a correction has to
 * tell apart.
 */
function readCell(row: object, field: string): AmendValue {
  const value = (row as Record<string, unknown>)[field]
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (isMoney(value)) return value.paise
  return null
}

/** True for a stored value a correction cannot express, and so cannot compare. */
function isUnrepresentable(row: object, field: string): boolean {
  const value = (row as Record<string, unknown>)[field]
  if (value === undefined || value === null) return false
  if (typeof value === 'string' || typeof value === 'number') return false
  return !isMoney(value)
}

export type AmendOptions<T extends object> = {
  readonly store: MockStore
  readonly table: Map<string, T>
  readonly entity: AmendableEntity
  readonly id: string
  readonly command: AmendCommand
  /**
   * Whether the insurer has already issued this record. Omitted where the
   * question does not arise — an inquiry is never issued — and read off the
   * record's own state where it does.
   */
  readonly issuedOf?: (row: T) => boolean
  /** The triggering event, when a recipe caused this write. See `MoveOptions`. */
  readonly causedBy?: string
}

export function amendRecord<T extends object>(options: AmendOptions<T>): MutationResult<T> {
  const { store, table, entity, id, command, issuedOf, causedBy } = options

  const existing = table.get(id)
  if (!existing) return notFound(entity, id)

  const fields = Object.keys(command.changes)

  const opaque = fields.find((field) => isUnrepresentable(existing, field))
  if (opaque !== undefined) {
    return rejected(
      `${opaque} does not hold a value a correction can express. Only text, whole numbers, dates and typed amounts are correctable.`,
    )
  }

  const before: Record<string, AmendValue> = {}
  for (const field of fields) before[field] = readCell(existing, field)

  const ctx = {
    entity,
    reason: command.reason,
    changes: command.changes,
    before,
    issued: issuedOf?.(existing) ?? false,
  }

  const verdict = amendVerdict(ctx)
  if (!verdict.ok) return rejected(verdict.reason, verdict.code, verdict.guard)

  // Amounts last, so a bad paise figure refuses before anything is written or
  // emitted rather than throwing out of `apply` with a row half-changed.
  const patch: Record<string, unknown> = {}
  for (const field of fields) {
    const value = command.changes[field]
    if (!isMoneyField(entity, field)) {
      patch[field] = value
      continue
    }
    if (value === null) {
      patch[field] = null
      continue
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      return rejected(
        `${field} is an amount and is recorded in whole paise. "${String(value)}" is not a whole number of paise, which means it lost precision before it arrived.`,
      )
    }
    patch[field] = fromPaise(value)
  }

  return record<T>({
    store,
    table,
    entity,
    id,
    event: 'record.amended',
    actorId: command.actorId,
    detail: amendDetail(ctx),
    causedBy,
    apply: (row) => ({ ...row, ...patch }),
  })
}

export type DiscardOptions<T extends object> = {
  readonly store: MockStore
  readonly table: Map<string, T>
  readonly entity: DiscardableEntity
  readonly id: string
  readonly command: DiscardCommand
  /**
   * What this record produced, named for the refusal sentence, or null when it
   * produced nothing. A converted inquiry, an awarded quotation and a consumed
   * deal each have something pointing at them, and discarding one would leave
   * the audit spine with a hole in it.
   */
  readonly downstreamOf: (row: T) => string | null
  readonly causedBy?: string
}

export function discardRecord<T extends object>(options: DiscardOptions<T>): MutationResult<T> {
  const { store, table, entity, id, command, downstreamOf, causedBy } = options

  const existing = table.get(id)
  if (!existing) return notFound(entity, id)

  const note = command.note?.trim() ?? ''
  const verdict = discardVerdict({
    entity,
    reason: command.reason,
    note: note === '' ? null : note,
    alreadyDiscarded: isDiscarded(existing),
    downstream: downstreamOf(existing),
  })
  if (!verdict.ok) return rejected(verdict.reason, verdict.code, verdict.guard)

  return record<T>({
    store,
    table,
    entity,
    id,
    event: 'record.discarded',
    actorId: command.actorId,
    detail: discardDetail(command.reason, note === '' ? null : note),
    causedBy,
    apply: (row, events) => {
      const mark: DiscardMark = {
        reason: command.reason,
        note: note === '' ? null : note,
        discardedBy: command.actorId,
        // The bus's own stamp, so the mark and its event agree exactly.
        discardedAt: events[0].at,
      }
      return { ...row, discard: mark }
    },
  })
}

export type RestoreOptions<T extends object> = {
  readonly store: MockStore
  readonly table: Map<string, T>
  readonly entity: DiscardableEntity
  readonly id: string
  readonly command: RestoreCommand
  readonly causedBy?: string
}

export function restoreRecord<T extends object>(options: RestoreOptions<T>): MutationResult<T> {
  const { store, table, entity, id, command, causedBy } = options

  const existing = table.get(id)
  if (!existing) return notFound(entity, id)

  const mark = discardMarkOf(existing)
  const verdict = restoreVerdict({ entity, reason: command.reason, discarded: mark !== null })
  if (!verdict.ok) return rejected(verdict.reason, verdict.code, verdict.guard)

  return record<T>({
    store,
    table,
    entity,
    id,
    event: 'record.restored',
    actorId: command.actorId,
    detail: {
      reason: command.reason.trim(),
      // What it was discarded for, so the timeline reads as one story rather
      // than as two unconnected entries.
      discardedFor: mark?.reason ?? null,
      discardedAt: mark?.discardedAt ?? null,
    },
    causedBy,
    apply: (row) => ({ ...row, discard: null }),
  })
}
