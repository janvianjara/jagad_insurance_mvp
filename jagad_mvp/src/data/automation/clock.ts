/**
 * The clock — FR-21, FR-12.1/.3, plan §7.
 *
 * Every other event in this product is something a person did, so every other
 * subscriber has something to subscribe to. A date arriving is not something
 * anybody did, and that is the whole reason a renewal reaches expiry having sent
 * nothing: `renewal.due` is a seeded, active trigger with a real template behind
 * it, and there has never been anything in the tree that emits it.
 *
 * This emits it. Not from a timer holding the answer — a browser closed for a
 * week would lose every rung that passed while it was shut — but by asking
 * `dueTicks` the re-entrant question it was built for: given these records and
 * this instant, what should have fired by now? Missing a week costs nothing,
 * because there is nothing to replay.
 *
 * ## What a tick emits, and what it does not
 *
 * A tick emits `clock.tick`, and then the four triggers that no transition
 * emits: `renewal.due` at expiry minus the recipe's lead days, `consent.expired`
 * at the consent cadence, `sla.breached` when an inquiry runs past the
 * turnaround allowance already stamped on it, and `task.nudged` when a callback
 * date passes. It does not decide what happens next — the recipes bound
 * to those names do, through the same dispatcher an ordinary save goes through.
 * The clock's job is to make a date look like an event; everything after that is
 * unchanged.
 *
 * ## Once per record, enforced by a key rather than a flag
 *
 * A flag on the record would mean the record has to be written before the effect
 * is safe, and a crash in between sends twice. The rung key from
 * `src/domain/automation/ledger.ts` carries no timestamp, so the same rung
 * computes to the same key on every evaluation — and the ledger's unique index
 * turns the second attempt into a no-op. That is what makes a tick safe to run
 * twice, safe after a three-day gap, and safe in a test that moves the clock.
 *
 * ## Quiet hours
 *
 * Read from `CONSENT_CADENCE`, which is the same constant `chase-rules.ts`
 * exports and the bulk consent chase enforces. A tick inside the window emits
 * `clock.tick` and stops there: the rungs are still passed when the window
 * closes, because a rung is a fact about a date rather than about whether anyone
 * was looking.
 */

import {
  CONSENT_CADENCE,
  acquireLease,
  dueTicks,
  elapsedTicks,
  inQuietHours,
  readLadder,
  releaseLease,
  renewalIntervalMs,
  runKey,
} from '../../domain/automation'
import type {
  DeadlineRecord,
  DueRecord,
  LeaseStorage,
  RecipeRunDraft,
} from '../../domain/automation'
import { RUN_DECISIONS } from '../../domain/automation'
import type { Recipe } from '../repo/config'
import type { EventBus } from '../../domain/events'
import type { RecipeRunRepository } from '../repo/recipes'
import type { CustomerRepository } from '../repo/customers'
import type { InquiryRepository } from '../repo/inquiries'
import type { RenewalRepository, TaskRepository } from '../repo/tasks'

/** How long a clock lease lives before anybody may take it. */
export const CLOCK_LEASE_TTL_MS = 30_000

/** The states a renewal is still worth nudging in. Renewed and lapsed are not. */
const OPEN_RENEWAL_STATES = new Set(['scheduled', 'pooled', 'assigned', 'reminded'])

/**
 * The sweeps the clock owns itself, as against the recipes it evaluates.
 *
 * These three have no row in the recipe library and that is deliberate rather
 * than an oversight. A recipe's job is to hold configuration — a ladder, a
 * threshold, a recipient — and these hold none: the consent cadence is one
 * constant shared with the chase screen, and the other two read a deadline the
 * record already carries. There is nothing for an admin to set, so there is
 * nothing to put on a configuration screen except the fact that they run, which
 * `SCHEDULES` below is for.
 */
export const CONSENT_EXPIRY_KEY = 'consent.expiry'
export const TAT_BREACH_KEY = 'inquiry.tatBreach'
export const CALLBACK_DUE_KEY = 'task.callbackDue'

/** One version for all three: they take no parameters, so nothing can change. */
const SCHEDULE_VERSION = 1

export type ScheduleNote = {
  readonly key: string
  readonly label: string
  /** What it reads to decide something is due. Named so somebody can go and look. */
  readonly reads: string
  readonly emits: string
}

/** What `/config/automation` shows beside the recipe library. */
export const SCHEDULES: readonly ScheduleNote[] = [
  {
    key: TAT_BREACH_KEY,
    label: 'An inquiry has run past its turnaround allowance',
    reads:
      'tatDueAt on the inquiry, which was computed from the routing recipe when it was assigned. No threshold lives in the engine.',
    emits: 'sla.breached',
  },
  {
    key: CALLBACK_DUE_KEY,
    label: 'A task has passed the date somebody committed to',
    reads: 'dueAt on the task, which is the date the person set when they raised it.',
    emits: 'task.nudged',
  },
  {
    key: CONSENT_EXPIRY_KEY,
    label: 'A consent link has gone stale and the customer can be asked again',
    reads: `CONSENT_CADENCE.resendAfterDays, currently ${CONSENT_CADENCE.resendAfterDays} — the same constant the KYC chase screen enforces.`,
    emits: 'consent.expired',
  },
]

export type ClockDeps = {
  readonly bus: EventBus
  readonly renewals: RenewalRepository
  readonly customers: CustomerRepository
  readonly inquiries: InquiryRepository
  readonly tasks: TaskRepository
  readonly recipeRuns: RecipeRunRepository
  /** Read fresh on every tick, so an edited recipe changes the next one. */
  readonly recipes: () => Promise<readonly Recipe[]>
  readonly now: () => Date
}

export type ClockOptions = ClockDeps & {
  readonly storage: LeaseStorage
  /** This tab's identity. Two tabs must never produce the same one. */
  readonly nodeId: string
  readonly ttlMs?: number
  /** Skip the quiet-hours hold. Only a test that is asserting the hold sets this. */
  readonly ignoreQuietHours?: boolean
}

export type TickReport = {
  /** False when another tab holds the lease. Everything below is then empty. */
  readonly emitted: boolean
  readonly heldBy: string
  readonly quiet: boolean
  /** Trigger events this tick synthesised. */
  readonly triggers: readonly string[]
  /** Rungs recorded as passed-unobserved, so they cannot fire later. */
  readonly superseded: number
}

const IDLE: Omit<TickReport, 'heldBy'> = {
  emitted: false,
  quiet: false,
  triggers: [],
  superseded: 0,
}

export type Clock = {
  /** One evaluation. Safe to call twice; safe to call after a week's gap. */
  tick(): Promise<TickReport>
  /** Runs `tick` on the lease's renewal interval until `stop`. */
  start(): void
  stop(): void
}

export function createClock(options: ClockOptions): Clock {
  const { bus, renewals, customers, inquiries, tasks, recipeRuns, recipes, now, storage, nodeId } =
    options
  const ttlMs = options.ttlMs ?? CLOCK_LEASE_TTL_MS

  let timer: ReturnType<typeof setInterval> | null = null

  /**
   * Writes the run and says whether this is the first time. The ledger's unique
   * index is the idempotency, so "did it already fire?" and "record that it
   * fired" are one call rather than a read followed by a racing write.
   */
  async function claim(draft: RecipeRunDraft): Promise<boolean> {
    const before = await recipeRuns.byKey(draft.idempotencyKey)
    if (before !== null) return false

    await recipeRuns.record({
      idempotencyKey: draft.idempotencyKey,
      recipeKey: draft.recipeKey,
      recipeVersion: draft.recipeVersion,
      trigger: draft.trigger,
      subjectEntity: draft.subject?.entity ?? null,
      subjectId: draft.subject?.id ?? null,
      phase: draft.phase,
      decision: draft.decision,
      reason: draft.reason,
      emitted: draft.emitted,
      evaluatedAt: draft.evaluatedAt,
      clockAt: draft.clockAt,
      causedBy: draft.causedBy,
      chain: draft.chain,
    })
    return true
  }

  /**
   * The renewal ladder. `renewal.due` is emitted once per rung per policy, and
   * the rungs that passed unobserved are recorded rather than sent — which is
   * what stops a policy imported ten days before expiry sending the 45, 30 and
   * 15-day reminders in the same second.
   */
  async function renewalTriggers(
    recipe: Recipe,
    at: Date,
    tickId: string,
  ): Promise<{ readonly triggers: string[]; readonly superseded: number }> {
    const ladder = readLadder(recipe.parameters)
    if (!ladder.ok) {
      await claim({
        idempotencyKey: runKey({
          recipeKey: recipe.key,
          recipeVersion: recipe.version,
          subjectId: 'ladder',
          phase: null,
          occurrence: `v${recipe.version}`,
        }),
        recipeKey: recipe.key,
        recipeVersion: recipe.version,
        trigger: 'clock.tick',
        subject: null,
        phase: null,
        decision: RUN_DECISIONS.refused,
        reason: ladder.reason,
        emitted: [],
        evaluatedAt: at.toISOString(),
        clockAt: at.toISOString(),
        causedBy: tickId,
        chain: [recipe.key],
      })
      return { triggers: [], superseded: 0 }
    }

    const page = await renewals.list({ pageSize: 500 })
    const records: DueRecord[] = page.rows.map((row) => ({
      id: row.id,
      anchorDate: row.expiryDate,
      sentCount: row.remindersSent,
      open: OPEN_RENEWAL_STATES.has(row.state),
    }))

    const ticks = dueTicks({
      records,
      ladder: ladder.ladder,
      recipeKey: recipe.key,
      recipeVersion: recipe.version,
      now: at,
      // Empty rather than pre-read: `claim` below is the real check, and it is
      // the one with the unique index behind it. A set read here would only be a
      // faster path to the same answer, and a stale one.
      fired: new Set<string>(),
    })

    const triggers: string[] = []
    let superseded = 0

    for (const due of ticks) {
      const first = await claim({
        idempotencyKey: due.firedFor,
        recipeKey: recipe.key,
        recipeVersion: recipe.version,
        trigger: 'clock.tick',
        subject: { entity: 'RenewalTask', id: due.recordId },
        phase: `d${due.offsetDays}`,
        decision: RUN_DECISIONS.fired,
        reason:
          `Rung ${due.offsetDays} days from expiry has passed for ${due.recordId}.` +
          (due.supersedes.length > 0
            ? ` ${due.supersedes.length} earlier rung${due.supersedes.length === 1 ? '' : 's'} passed unobserved and ${due.supersedes.length === 1 ? 'was' : 'were'} recorded rather than sent, so this is one reminder and not ${due.supersedes.length + 1}.`
            : ''),
        emitted: ['renewal.due'],
        evaluatedAt: at.toISOString(),
        clockAt: at.toISOString(),
        causedBy: tickId,
        chain: [recipe.key],
      })

      if (!first) continue

      // The superseded rungs are written BEFORE the emit, so a failure between
      // the two cannot leave them free to fire on the next evaluation.
      for (const rung of due.supersedes) {
        const recorded = await claim({
          idempotencyKey: rung.firedFor,
          recipeKey: recipe.key,
          recipeVersion: recipe.version,
          trigger: 'clock.tick',
          subject: { entity: 'RenewalTask', id: due.recordId },
          phase: `d${rung.offsetDays}`,
          decision: RUN_DECISIONS.skipped,
          reason: `Rung ${rung.offsetDays} passed unobserved and was collapsed into the ${due.offsetDays}-day reminder. Recorded so it cannot fire later and walk the ladder backwards.`,
          emitted: [],
          evaluatedAt: at.toISOString(),
          clockAt: at.toISOString(),
          causedBy: tickId,
          chain: [recipe.key],
        })
        if (recorded) superseded += 1
      }

      bus.emit('renewal.due', {
        actorId: recipe.key,
        subject: { entity: 'RenewalTask', id: due.recordId },
        causedBy: tickId,
        detail: { recipe: recipe.key, offsetDays: due.offsetDays },
      })
      triggers.push('renewal.due')
    }

    return { triggers, superseded }
  }

  /**
   * `consent.expired` — an event name that has existed since P-02 with nothing
   * emitting it. A link is dead `resendAfterDays` after it was issued, and until
   * something says so the customer sits in `link_issued` forever and the chase
   * screen keeps excluding them for having a live link.
   */
  async function consentTriggers(at: Date, tickId: string): Promise<readonly string[]> {
    const cutoff = at.getTime() - CONSENT_CADENCE.resendAfterDays * 86_400_000
    const page = await customers.list({ pageSize: 1000 })
    const triggers: string[] = []

    for (const customer of page.rows) {
      if (customer.consentState !== 'link_issued') continue

      const issued = customer.lastConsentChaseAt
      if (issued === null) continue
      const issuedAt = new Date(issued).getTime()
      if (Number.isNaN(issuedAt) || issuedAt > cutoff) continue

      const key = runKey({
        recipeKey: CONSENT_EXPIRY_KEY,
        recipeVersion: 1,
        subjectId: customer.id,
        phase: 'expired',
        occurrence: issued,
      })

      const first = await claim({
        idempotencyKey: key,
        recipeKey: CONSENT_EXPIRY_KEY,
        recipeVersion: 1,
        trigger: 'clock.tick',
        subject: { entity: 'Customer', id: customer.id },
        phase: 'expired',
        decision: RUN_DECISIONS.fired,
        reason: `The consent link sent at ${issued} is more than ${CONSENT_CADENCE.resendAfterDays} days old, so it is expired and this customer can be chased again.`,
        emitted: ['consent.expired'],
        evaluatedAt: at.toISOString(),
        clockAt: at.toISOString(),
        causedBy: tickId,
        chain: [CONSENT_EXPIRY_KEY],
      })
      if (!first) continue

      bus.emit('consent.expired', {
        actorId: CONSENT_EXPIRY_KEY,
        subject: { entity: 'Customer', id: customer.id },
        causedBy: tickId,
        detail: { issuedAt: issued },
      })
      triggers.push('consent.expired')
    }

    return triggers
  }

  /**
   * The escalation sweep D9 promises and nothing has ever run.
   *
   * `InquiryRepository.breachingTat` was written for this and had no caller: the
   * inquiry screens render a TAT clock, colour it red when it runs out, and
   * nothing anywhere notices when it does. The allowance is not read here and
   * there is no threshold in this file — `tatDueAt` was computed from the routing
   * recipe's `tatMinutes` when the inquiry was assigned, so the deadline is
   * already on the record and this only asks whether it has passed.
   */
  async function tatTriggers(at: Date, tickId: string): Promise<readonly string[]> {
    const page = await inquiries.breachingTat(at, { pageSize: 500 })
    const records: DeadlineRecord[] = page.rows.map((row) => ({
      id: row.id,
      dueAt: row.tatDueAt,
      open: true,
    }))

    const ticks = elapsedTicks({
      records,
      recipeKey: TAT_BREACH_KEY,
      recipeVersion: SCHEDULE_VERSION,
      now: at,
    })

    const triggers: string[] = []
    for (const breach of ticks) {
      const first = await claim({
        idempotencyKey: breach.firedFor,
        recipeKey: TAT_BREACH_KEY,
        recipeVersion: SCHEDULE_VERSION,
        trigger: 'clock.tick',
        subject: { entity: 'Inquiry', id: breach.recordId },
        phase: 'breach',
        decision: RUN_DECISIONS.fired,
        reason: `${breach.recordId} passed its turnaround allowance at ${breach.dueAt} and is ${breach.lateByMinutes} minutes late. The allowance came from the routing recipe when the inquiry was assigned; nothing here invented one.`,
        emitted: ['sla.breached'],
        evaluatedAt: at.toISOString(),
        clockAt: at.toISOString(),
        causedBy: tickId,
        chain: [TAT_BREACH_KEY],
      })
      if (!first) continue

      bus.emit('sla.breached', {
        actorId: TAT_BREACH_KEY,
        subject: { entity: 'Inquiry', id: breach.recordId },
        causedBy: tickId,
        detail: { dueAt: breach.dueAt, lateByMinutes: breach.lateByMinutes },
      })
      triggers.push('sla.breached')
    }

    return triggers
  }

  /**
   * The callback nobody made — FR-06.15's other half.
   *
   * A task carries the date somebody committed to, and until now the only thing
   * that noticed a passed one was a person opening the queue and reading a red
   * row. `dueAt` is the deadline the person set, so again there is nothing here
   * to configure and nothing to default.
   */
  async function callbackTriggers(at: Date, tickId: string): Promise<readonly string[]> {
    const page = await tasks.open({ pageSize: 500 })
    const records: DeadlineRecord[] = page.rows.map((row) => ({
      id: row.id,
      dueAt: row.dueAt,
      open: row.state === 'open' || row.state === 'in_progress',
    }))

    const ticks = elapsedTicks({
      records,
      recipeKey: CALLBACK_DUE_KEY,
      recipeVersion: SCHEDULE_VERSION,
      now: at,
    })

    const triggers: string[] = []
    for (const late of ticks) {
      const first = await claim({
        idempotencyKey: late.firedFor,
        recipeKey: CALLBACK_DUE_KEY,
        recipeVersion: SCHEDULE_VERSION,
        trigger: 'clock.tick',
        subject: { entity: 'Task', id: late.recordId },
        phase: 'due',
        decision: RUN_DECISIONS.fired,
        reason: `${late.recordId} was due at ${late.dueAt} and is ${late.lateByMinutes} minutes past it. The owner is nudged; nothing was reassigned and nothing was sent to a customer.`,
        emitted: ['task.nudged'],
        evaluatedAt: at.toISOString(),
        clockAt: at.toISOString(),
        causedBy: tickId,
        chain: [CALLBACK_DUE_KEY],
      })
      if (!first) continue

      bus.emit('task.nudged', {
        actorId: CALLBACK_DUE_KEY,
        subject: { entity: 'Task', id: late.recordId },
        causedBy: tickId,
        detail: { dueAt: late.dueAt, lateByMinutes: late.lateByMinutes },
      })
      triggers.push('task.nudged')
    }

    return triggers
  }

  const clock: Clock = {
    async tick() {
      // The election first, and nothing before it: a tab that does not hold the
      // lease must not read, must not write and must not emit.
      if (!acquireLease({ storage, nodeId, ttlMs, now })) {
        return { ...IDLE, heldBy: 'another tab' }
      }

      const at = now()
      const tick = bus.emit('clock.tick', { actorId: nodeId, detail: { node: nodeId } })

      if (!options.ignoreQuietHours && inQuietHours(at)) {
        return { ...IDLE, emitted: true, quiet: true, heldBy: nodeId }
      }

      const active = (await recipes()).filter((recipe) => recipe.active)
      const triggers: string[] = []
      let superseded = 0

      for (const recipe of active) {
        if (recipe.trigger !== 'renewal.due') continue
        // The reminder ladder is the one seeded recipe whose own trigger is the
        // thing nothing emits, so the clock synthesises what it waits for.
        const result = await renewalTriggers(recipe, at, tick.id)
        triggers.push(...result.triggers)
        superseded += result.superseded
      }

      triggers.push(...(await consentTriggers(at, tick.id)))
      triggers.push(...(await tatTriggers(at, tick.id)))
      triggers.push(...(await callbackTriggers(at, tick.id)))

      return { emitted: true, heldBy: nodeId, quiet: false, triggers, superseded }
    },

    start() {
      if (timer !== null) return
      timer = setInterval(() => {
        void clock.tick()
      }, renewalIntervalMs(ttlMs))
    },

    stop() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      // Handed back rather than left to lapse, so the next tab does not wait out
      // the TTL for a clock that closed politely.
      releaseLease({ storage, nodeId })
    },
  }

  return clock
}

/**
 * The browser's shared slot. Wrapped rather than used directly so the whole
 * mechanism stays testable against a `Map`, and so a private window — where
 * `localStorage` throws rather than returning null — degrades to one tab acting
 * alone instead of to a clock that never starts.
 */
export function localStorageLease(key: string): LeaseStorage {
  return {
    read() {
      try {
        return globalThis.localStorage?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write(value) {
      try {
        globalThis.localStorage?.setItem(key, value)
      } catch {
        /* No shared storage means no sharing to coordinate. One tab, one clock. */
      }
    },
    clear() {
      try {
        globalThis.localStorage?.removeItem(key)
      } catch {
        /* As above. */
      }
    },
  }
}
