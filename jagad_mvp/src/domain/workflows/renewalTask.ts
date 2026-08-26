/**
 * Renewal task — plan §9, FR-12, canvas n26-n36, P2.
 *
 *   scheduled (expiry - N) -> in_pool -> assigned (self) -> reminded xN
 *     -> renewed (new term, new PDF version, commission recalc) | lapsed -> win_back_list
 *
 * §9's bullets that land here: reminders carry year-wise amounts and offers
 * enriched by the matched notice, and backdating is permitted but logs the actor,
 * the timestamp, the original date and the reason.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const RENEWAL_STATES = {
  scheduled: 'scheduled',
  inPool: 'in_pool',
  assigned: 'assigned',
  reminded: 'reminded',
  renewed: 'renewed',
  lapsed: 'lapsed',
  winBackList: 'win_back_list',
} as const

export type RenewalState = (typeof RENEWAL_STATES)[keyof typeof RENEWAL_STATES]

/** One year of history on a renewal reminder. Amounts are typed, taken from the record. */
export type YearWiseAmount = {
  readonly year: number
  readonly amount: Money
}

export type RenewalReminder = {
  readonly yearWiseAmounts: readonly YearWiseAmount[]
  readonly offers: readonly string[]
  /** Set when a matched notice row enriched this reminder with the insurer's own figures. */
  readonly enrichedFromNoticeRowId?: string
}

export type RenewedTerm = {
  readonly startDate: string
  readonly endDate: string
  /** A renewal produces a new PDF version, never an edit of last year's document. */
  readonly documentVersion: number
  readonly commissionRecalculated: boolean
}

/**
 * §9: "Backdating is permitted but logs actor, timestamp, original date and
 * reason." All four, or the backdate does not happen.
 */
export type BackdatingRecord = {
  readonly actorId?: string
  readonly loggedAt?: string
  readonly originalDate?: string
  readonly newDate?: string
  readonly reason?: string
}

export type RenewalContext = {
  readonly now: Date
  readonly expiryDate?: string
  /** Days before expiry that the renewal task is raised. A config parameter, not a constant. */
  readonly leadDays?: number
  readonly assigneeId?: string
  /** §9 draws assignment as self-service out of the pool. */
  readonly selfAssigned?: boolean
  readonly reminder?: RenewalReminder
  readonly remindersSent?: number
  readonly renewedTerm?: RenewedTerm
  readonly lapseReason?: string
  readonly backdating?: BackdatingRecord
}

/** When the renewal task is due to appear. Pure, so the queue can sort on it. */
export function renewalTaskDueOn(expiryDate: string, leadDays: number): Date {
  return new Date(new Date(expiryDate).getTime() - leadDays * 86_400_000)
}

export function renewalLeadHasElapsed(ctx: RenewalContext): TransitionResult {
  if (!ctx.expiryDate) {
    return refuse('This policy has no expiry date, so no renewal can be scheduled against it.')
  }
  if (typeof ctx.leadDays !== 'number' || !Number.isFinite(ctx.leadDays) || ctx.leadDays < 0) {
    return refuse(
      'No renewal lead time was supplied. The lead is a configuration parameter and this module holds no default.',
    )
  }
  const dueOn = renewalTaskDueOn(ctx.expiryDate, ctx.leadDays)
  if (ctx.now < dueOn) {
    return refuse(
      `This renewal enters the pool on ${dueOn.toISOString().slice(0, 10)}, ${ctx.leadDays} days before expiry.`,
    )
  }
  return allow()
}

export function renewalAssignedToSomebody(ctx: RenewalContext): TransitionResult {
  if (!ctx.assigneeId) {
    return refuse('Nobody has picked this renewal up from the pool yet.')
  }
  if (ctx.selfAssigned !== true) {
    return refuse('Renewals are taken from the pool by the person who will work them, not pushed onto them.')
  }
  return allow()
}

/** §9: "Reminders carry year-wise amounts and offers, enriched by the matched notice." */
export function reminderCarriesYearWiseAmountsAndOffers(ctx: RenewalContext): TransitionResult {
  const reminder = ctx.reminder
  if (!reminder) {
    return refuse('Build the reminder before sending it.')
  }
  if (reminder.yearWiseAmounts.length === 0) {
    return refuse(
      'A renewal reminder carries the year-wise amounts. A bare "your policy expires" message is what customers ignore.',
    )
  }
  const untyped = reminder.yearWiseAmounts.filter((entry) => !isMoney(entry.amount))
  if (untyped.length > 0) {
    return refuse(
      `Year-wise amounts are missing a recorded figure for: ${untyped.map((entry) => entry.year).join(', ')}.`,
    )
  }
  if (reminder.offers.length === 0) {
    return refuse('A renewal reminder carries the current offers alongside the amounts.')
  }
  return allow()
}

/** §9: renewed means a new term, a new PDF version and a commission recalculation. */
export function renewalProducesNewTermVersionAndCommission(ctx: RenewalContext): TransitionResult {
  const term = ctx.renewedTerm
  if (!term) {
    return refuse('Record the new term dates before marking this renewal complete.')
  }
  if (!term.startDate || !term.endDate) {
    return refuse('A renewal needs both the new start date and the new end date.')
  }
  if (term.documentVersion < 2) {
    return refuse(
      'A renewal produces a new document version. Version 1 is last year\'s PDF and it stays exactly as it was sent.',
    )
  }
  if (!term.commissionRecalculated) {
    return refuse('Commission is recalculated on renewal. Run the recalculation before completing.')
  }
  return allow()
}

/**
 * §9: backdating is permitted. It is the logging that is mandatory, so this
 * guard passes when no backdate was attempted and refuses only a partial log.
 */
export function backdatingIsFullyLogged(ctx: RenewalContext): TransitionResult {
  const record = ctx.backdating
  if (!record) return allow()

  const missing: string[] = []
  if (!record.actorId) missing.push('the actor')
  if (!record.loggedAt) missing.push('the timestamp')
  if (!record.originalDate) missing.push('the original date')
  if (!record.reason || record.reason.trim().length === 0) missing.push('the reason')

  if (missing.length > 0) {
    return refuse(
      `Backdating is allowed, and it is logged in full. This backdate is missing ${missing.join(', ')}.`,
    )
  }
  return allow()
}

export function lapseRequiresReason(ctx: RenewalContext): TransitionResult {
  if (!ctx.lapseReason || ctx.lapseReason.trim().length === 0) {
    return refuse('Record why this renewal lapsed. It is what the win-back list is worked from.')
  }
  return allow()
}

export const RENEWAL_TRANSITIONS = {
  scheduled: {
    in_pool: { event: 'renewal.due', guards: [renewalLeadHasElapsed] },
  },
  in_pool: {
    assigned: { event: 'renewal.assigned', guards: [renewalAssignedToSomebody] },
  },
  assigned: {
    reminded: {
      event: 'renewal.reminded',
      alsoEmits: ['message.sent'],
      guards: [reminderCarriesYearWiseAmountsAndOffers],
    },
    renewed: {
      event: 'renewal.completed',
      alsoEmits: ['policy.versioned', 'commission.booked'],
      guards: [renewalProducesNewTermVersionAndCommission, backdatingIsFullyLogged],
    },
    lapsed: { event: 'renewal.lapsed', guards: [lapseRequiresReason] },
  },
  reminded: {
    reminded: {
      event: 'renewal.reminded',
      alsoEmits: ['message.sent'],
      guards: [reminderCarriesYearWiseAmountsAndOffers],
      note: '§9 draws this as "reminded xN" - the same state, sent again.',
    },
    renewed: {
      event: 'renewal.completed',
      alsoEmits: ['policy.versioned', 'commission.booked'],
      guards: [renewalProducesNewTermVersionAndCommission, backdatingIsFullyLogged],
    },
    lapsed: { event: 'renewal.lapsed', guards: [lapseRequiresReason] },
  },
  lapsed: {
    win_back_list: { event: 'renewal.win_back_listed' },
  },
} as const satisfies TransitionTable<RenewalState, RenewalContext>

export const renewalTaskMachine = createMachine<RenewalState, RenewalContext>({
  name: 'renewalTask',
  states: Object.values(RENEWAL_STATES),
  initial: RENEWAL_STATES.scheduled,
  transitions: RENEWAL_TRANSITIONS,
})
