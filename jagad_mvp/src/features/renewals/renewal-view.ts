/**
 * How the renewals desk reads: two kinds of due item, their wording, their
 * colour, and the grace window an instalment sits inside.
 *
 * The module's whole reason for existing is one §9 sentence: "An instalment due
 * date is not a renewal date. A policy with a due instalment is in force and not
 * expiring, and the renewals queue must show the two as visibly different kinds
 * of item." So the row type below is a discriminated union with `kind` on it
 * rather than a bag of nullable fields, and every label, colour and href is
 * chosen from that discriminator. A renewals member cannot mistake one for the
 * other because the queue never renders them the same way.
 *
 * The other three §9 lines that land here are all about not calculating:
 *
 *   - the grace window comes from `schedule.graceDays`, which is set per mode.
 *     Monthly is commonly 15 days against 30 on annual and motor is commonly
 *     zero, so a constant in this file would be wrong for two of the three;
 *   - the instalment amount is `instalment.amount`, copied from the schedule the
 *     insurer typed. Nothing here divides an annual premium by anything;
 *   - what is at risk on a missed instalment is continuity — sum insured, No
 *     Claim Bonus, waiting periods already served — and that belongs in the
 *     message, not just the amount.
 */

import type { InstalmentState, PremiumMode, RenewalState } from '../../domain/workflows'
import type { InstalmentDue, PremiumSchedule, RenewalTask } from '../../data/repo'
import type { Money } from '../../domain/money'
import type { Severity, Tone } from '../../ui/tone'

export const POOL_KINDS = {
  /** The policy term ends. This is a renewal. */
  renewal: 'renewal',
  /** A payment falls due inside a term that has not ended. This is not a renewal. */
  instalment: 'instalment',
} as const

export type PoolKind = (typeof POOL_KINDS)[keyof typeof POOL_KINDS]

export const POOL_KIND_LABEL: Readonly<Record<PoolKind, string>> = {
  renewal: 'Renewal',
  instalment: 'Instalment due',
}

/** The sentence that keeps the two apart wherever a row is rendered. */
export const POOL_KIND_MEANING: Readonly<Record<PoolKind, string>> = {
  renewal: 'The policy term ends on this date. Nothing after it is covered unless it is renewed.',
  instalment:
    'A payment falls due inside a term that is still running. The policy is in force and it is not expiring.',
}

export const POOL_KIND_TONE: Readonly<Record<PoolKind, Tone>> = {
  renewal: 'warn',
  instalment: 'info',
}

export const RENEWAL_LABEL: Readonly<Record<RenewalState, string>> = {
  scheduled: 'Scheduled',
  in_pool: 'In the pool',
  assigned: 'Assigned',
  reminded: 'Reminded',
  renewed: 'Renewed',
  lapsed: 'Lapsed',
  win_back_list: 'Win-back list',
}

export const RENEWAL_TONE: Readonly<Record<RenewalState, Tone>> = {
  scheduled: 'idle',
  in_pool: 'attn',
  assigned: 'info',
  reminded: 'warn',
  renewed: 'ok',
  lapsed: 'bad',
  win_back_list: 'attn',
}

export const INSTALMENT_LABEL: Readonly<Record<InstalmentState, string>> = {
  scheduled: 'Scheduled',
  due: 'Due',
  paid: 'Paid',
  missed: 'Missed',
  in_grace: 'In grace',
  paid_in_grace: 'Paid in grace',
  grace_expired: 'Grace expired',
  lapsed: 'Lapsed',
}

export const INSTALMENT_TONE: Readonly<Record<InstalmentState, Tone>> = {
  scheduled: 'idle',
  due: 'warn',
  paid: 'ok',
  missed: 'bad',
  in_grace: 'attn',
  paid_in_grace: 'ok',
  grace_expired: 'bad',
  lapsed: 'bad',
}

export const MODE_LABEL: Readonly<Record<PremiumMode, string>> = {
  single: 'Single',
  annual: 'Annual',
  half_yearly: 'Half-yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
}

/** Instalment states that are work: somebody has to do something about them. */
export const OPEN_INSTALMENT_STATES: readonly InstalmentState[] = [
  'due',
  'missed',
  'in_grace',
  'grace_expired',
]

/* ---------------------------------------------------------------- pool rows */

/**
 * One row of the renewals desk. `kind` is the discriminator §9 asks for, and it
 * is the only thing a screen switches on.
 */
export type PoolRow = {
  readonly id: string
  readonly kind: PoolKind
  readonly policyId: string
  readonly policyNo: string
  readonly customerId: string
  readonly customerName: string
  /** Renewal: the pool date. Instalment: the date the payment falls due. */
  readonly dueOn: string
  /** Always the policy's own end date, so a row can say what it is NOT. */
  readonly policyEndsOn: string | null
  /** `RenewalState` on a renewal row, `InstalmentState` on an instalment row. */
  readonly state: string
  readonly stateLabel: string
  readonly stateTone: Tone
  readonly assigneeId: string | null
  /** Instalment only. Typed from the insurer's schedule, never derived. */
  readonly amount: Money | null
  /** Instalment only. From the schedule's mode, never a constant. */
  readonly graceDays: number | null
  readonly graceEndsOn: string | null
  readonly mode: PremiumMode | null
  readonly remindersSent: number | null
  readonly href: string
}

const DAY_MS = 86_400_000

/** The last day a missed instalment can still be paid, per the schedule's mode. */
export function graceEndsOn(dueDate: string, graceDays: number): string {
  const end = new Date(new Date(`${dueDate}T00:00:00.000Z`).getTime() + graceDays * DAY_MS)
  return end.toISOString().slice(0, 10)
}

export type RenewalRowInput = {
  readonly task: RenewalTask
  readonly policyNo: string
  readonly customerName: string
  readonly policyEndsOn: string | null
}

export function renewalRow(input: RenewalRowInput): PoolRow {
  const { task, policyNo, customerName, policyEndsOn } = input
  return {
    id: task.id,
    kind: POOL_KINDS.renewal,
    policyId: task.policyId,
    policyNo,
    customerId: task.customerId,
    customerName,
    dueOn: task.dueOn,
    policyEndsOn: policyEndsOn ?? task.expiryDate,
    state: task.state,
    stateLabel: RENEWAL_LABEL[task.state],
    stateTone: RENEWAL_TONE[task.state],
    assigneeId: task.assigneeId,
    amount: null,
    graceDays: null,
    graceEndsOn: null,
    mode: null,
    remindersSent: task.remindersSent,
    href: `/renewals/${task.id}`,
  }
}

export type InstalmentRowInput = {
  readonly instalment: InstalmentDue
  readonly schedule: PremiumSchedule
  readonly policyNo: string
  readonly customerId: string
  readonly customerName: string
  readonly policyEndsOn: string | null
}

export function instalmentRow(input: InstalmentRowInput): PoolRow {
  const { instalment, schedule, policyNo, customerId, customerName, policyEndsOn } = input
  return {
    id: instalment.id,
    kind: POOL_KINDS.instalment,
    policyId: instalment.policyId,
    policyNo,
    customerId,
    customerName,
    dueOn: instalment.dueDate,
    policyEndsOn,
    state: instalment.state,
    stateLabel: INSTALMENT_LABEL[instalment.state],
    stateTone: INSTALMENT_TONE[instalment.state],
    assigneeId: null,
    // Straight off the row, which took it from the schedule the insurer typed.
    amount: instalment.amount,
    // From the schedule's mode. Monthly commonly 15 against 30 on annual.
    graceDays: schedule.graceDays,
    graceEndsOn: graceEndsOn(instalment.dueDate, schedule.graceDays),
    mode: schedule.mode,
    remindersSent: null,
    href: `/renewals/instalments?policy=${instalment.policyId}`,
  }
}

/**
 * Queue stripe severity. An instalment inside grace is lime — it needs a person
 * and nothing has gone wrong yet; a grace window that has closed is red, because
 * what is at risk by then is continuity rather than a payment.
 */
export function poolSeverity(row: PoolRow, now: Date): Severity {
  const today = now.toISOString().slice(0, 10)

  if (row.kind === POOL_KINDS.instalment) {
    if (row.state === 'grace_expired' || row.state === 'lapsed') return 'hot'
    if (row.state === 'in_grace' || row.state === 'missed') return 'attn'
    if (row.state === 'paid' || row.state === 'paid_in_grace') return 'good'
    return row.dueOn <= today ? 'warm' : 'cool'
  }

  if (row.state === 'lapsed') return 'hot'
  if (row.state === 'in_pool') return 'attn'
  if (row.state === 'renewed') return 'good'
  if (row.policyEndsOn !== null && row.policyEndsOn <= today) return 'hot'
  if (row.state === 'assigned' || row.state === 'reminded') return 'warm'
  return 'cool'
}

/**
 * What a missed instalment actually costs, in the customer's terms.
 *
 * §9 is explicit that the amount is the least of it: sum insured, No Claim Bonus
 * and waiting periods already served are what a lapse throws away, and that is
 * what belongs in the message.
 */
export const CONTINUITY_AT_RISK =
  'What is at risk is continuity — the sum insured, the No Claim Bonus and the waiting periods already served. The amount is the smallest part of it.'
