/**
 * The staged outbox — FR-21, FR-17.3, and the constitution's confirm-gate rule.
 *
 * The contradiction this exists to settle, stated plainly: the constitution says
 * every outward mutation goes through `<ConfirmGate>` and that cancel writes
 * nothing, and FR-21 says the platform sends the renewal reminder by itself. Both
 * cannot be true of the same act. They can be true of two acts, and that is the
 * resolution the engine takes:
 *
 *   The engine PREPARES. A person RELEASES.
 *
 * A time-based recipe that raises work — a task, a flag, a trigger — runs to
 * completion automatically, because nothing it does leaves the building and
 * everything it does is reversible from a queue somebody watches. A recipe whose
 * effect is a message to a customer stages a row here instead, with everything
 * decided: the recipient, the channel, the template, the record it is about, the
 * recipe and the run that produced it. The message is one click from going out
 * and the click belongs to a person, behind the same gate a hand-written message
 * passes. Cancel — `discard` below — writes nothing outward and leaves the
 * refusal on the row.
 *
 * ## Why the row is not `MessageLog`
 *
 * `MessageLog` already carries a `queued` state and looks like the natural home.
 * It is a read-only repository in `src/data/repo/config.ts` with no write path,
 * and giving it one is a change to a shared interface this engine does not own.
 * So the outbox lives here, in the runtime, and the shape below is deliberately
 * the shape a `MessageLog` row would take — `templateKey`, `channel`, `toName`,
 * `subjectEntity`, `subjectId` — so the move is a rename rather than a redesign.
 * The gap is written down in the runtime's report rather than worked around
 * quietly.
 *
 * ## The hold is on the row, not in a timer
 *
 * A message staged inside quiet hours carries `releaseAfter`, and `release`
 * refuses before it. The refusal is the same shape and the same words for a
 * person as for the engine, which is the point: quiet hours that only bind the
 * automation are quiet hours the night shift can walk straight through.
 */

import type { EventBus } from '../../domain/events'
import { committed, rejected } from '../repo/result'
import type { MutationResult } from '../repo/result'

export const OUTBOUND_STATES = {
  /** Prepared by the engine, waiting for a person. Nothing has been sent. */
  staged: 'staged',
  /** A person confirmed it. This is the only state that means it went out. */
  released: 'released',
  /** A person cancelled it. Nothing outward happened; the reason is on the row. */
  discarded: 'discarded',
} as const

export type OutboundState = (typeof OUTBOUND_STATES)[keyof typeof OUTBOUND_STATES]

export type StagedMessage = {
  readonly id: string
  /** The recipe that prepared it, and the version it prepared under. */
  readonly recipeKey: string
  readonly recipeVersion: number
  /** The wording. Read at release from the template repository, never inlined here. */
  readonly templateKey: string
  readonly channel: string
  readonly toName: string
  readonly subjectEntity: string
  readonly subjectId: string
  /** The customer the consent check was made against. */
  readonly customerId: string
  readonly state: OutboundState
  readonly stagedAt: string
  /**
   * The earliest instant a person may release it. Null when nothing holds it.
   * Set when the message was prepared inside the quiet window.
   */
  readonly releaseAfter: string | null
  readonly releasedAt: string | null
  readonly releasedBy: string | null
  /** Why it was discarded, in the words the person gave. */
  readonly discardReason: string | null
  /** The event that caused the run that staged it — FR-21.5's chain. */
  readonly causedBy: string | null
  /** The engine's own sentence about why this row exists. Rendered as written. */
  readonly note: string
}

export type StageMessageCommand = Omit<
  StagedMessage,
  'id' | 'state' | 'releasedAt' | 'releasedBy' | 'discardReason'
>

export type ReleaseCommand = {
  readonly actorId: string
  readonly now: Date
}

export type DiscardCommand = {
  readonly actorId: string
  readonly reason: string
  readonly now: Date
}

export type Outbox = {
  /** Everything staged, newest first. `/config/automation` reads it. */
  list(): readonly StagedMessage[]
  byId(id: string): StagedMessage | null
  /** What is prepared and waiting on a person right now. */
  waiting(): readonly StagedMessage[]
  /** Prepares one. Returns the row that already exists rather than a duplicate. */
  stage(command: StageMessageCommand): StagedMessage
  /** A person confirmed. This is the only path that emits `message.sent`. */
  release(id: string, command: ReleaseCommand): MutationResult<StagedMessage>
  discard(id: string, command: DiscardCommand): MutationResult<StagedMessage>
  /** Notifies on every change, so a screen can re-read without polling. */
  subscribe(listener: () => void): () => void
}

export type OutboxDeps = {
  /** Release emits `message.sent`, so the audit timeline carries the send. */
  readonly bus: EventBus
}

const ID_WIDTH = 4

/**
 * One staged row per recipe, version, subject and template. Two triggers on the
 * same record must not put two identical messages in front of a person, and the
 * run ledger cannot see that on its own — it keys on the occurrence, and two
 * occurrences are two runs whatever they produced.
 */
function stagingKey(command: StageMessageCommand): string {
  return `${command.recipeKey}:v${command.recipeVersion}:${command.subjectEntity}:${command.subjectId}:${command.templateKey}`
}

export function createOutbox(deps: OutboxDeps): Outbox {
  const rows = new Map<string, StagedMessage>()
  const byStagingKey = new Map<string, string>()
  const listeners = new Set<() => void>()
  let issued = 0

  function nextId(): string {
    issued += 1
    return `out-${String(issued).padStart(ID_WIDTH, '0')}`
  }

  /*
   * Cached rather than rebuilt per call, and that is a correctness requirement
   * rather than a saving: a screen subscribes through `useSyncExternalStore`,
   * which compares snapshots by identity and loops forever if a new array comes
   * back every time it looks.
   */
  let snapshot: readonly StagedMessage[] = []

  function announce(): void {
    snapshot = [...rows.values()].toSorted((left, right) =>
      right.stagedAt.localeCompare(left.stagedAt),
    )
    for (const listener of listeners) listener()
  }

  return {
    list() {
      return snapshot
    },

    byId(id) {
      return rows.get(id) ?? null
    },

    waiting() {
      return snapshot.filter((row) => row.state === OUTBOUND_STATES.staged)
    },

    stage(command) {
      const key = stagingKey(command)
      const existingId = byStagingKey.get(key)
      const existing = existingId === undefined ? undefined : rows.get(existingId)
      // A released row is history and does not block a later reminder; a row
      // still waiting is the same message, and a second copy of it would be two
      // decisions for a person who only has one to make.
      if (existing !== undefined && existing.state === OUTBOUND_STATES.staged) return existing

      const row: StagedMessage = {
        ...command,
        id: nextId(),
        state: OUTBOUND_STATES.staged,
        releasedAt: null,
        releasedBy: null,
        discardReason: null,
      }
      rows.set(row.id, row)
      byStagingKey.set(key, row.id)
      announce()
      return row
    },

    release(id, command) {
      const row = rows.get(id)
      if (row === undefined) return rejected(`There is no staged message ${id}.`)
      if (row.state !== OUTBOUND_STATES.staged) {
        return rejected(
          `${id} is ${row.state}, not staged. A message is released once; what happened to it is on the row.`,
        )
      }
      if (row.releaseAfter !== null && command.now.getTime() < new Date(row.releaseAfter).getTime()) {
        return rejected(
          `${id} is held until ${row.releaseAfter} because it was prepared inside quiet hours. The hold binds a person exactly as it binds the engine — quiet hours that only stop the automation are not quiet hours.`,
        )
      }

      const released: StagedMessage = {
        ...row,
        state: OUTBOUND_STATES.released,
        releasedAt: command.now.toISOString(),
        releasedBy: command.actorId,
      }
      rows.set(id, released)

      // The audit trail carries the send, and it carries it as caused by the run
      // that prepared it — so "who sent this?" answers with a person and "why was
      // it prepared?" answers with a recipe, which is the whole of FR-21.5.
      const sent = deps.bus.emit('message.sent', {
        actorId: command.actorId,
        subject: { entity: released.subjectEntity, id: released.subjectId },
        ...(released.causedBy === null ? {} : { causedBy: released.causedBy }),
        detail: {
          recipe: released.recipeKey,
          template: released.templateKey,
          channel: released.channel,
          staged: released.stagedAt,
        },
      })

      announce()
      return committed(released, [sent])
    },

    discard(id, command) {
      const row = rows.get(id)
      if (row === undefined) return rejected(`There is no staged message ${id}.`)
      if (row.state !== OUTBOUND_STATES.staged) {
        return rejected(`${id} is ${row.state}, not staged, so there is nothing to cancel.`)
      }
      if (command.reason.trim() === '') {
        return rejected(
          'A discarded message needs a reason. The customer was going to be told something and now will not be, and that is a decision somebody has to be able to read later.',
        )
      }

      const discarded: StagedMessage = {
        ...row,
        state: OUTBOUND_STATES.discarded,
        discardReason: command.reason.trim(),
      }
      rows.set(id, discarded)
      announce()
      return committed(discarded, [])
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
