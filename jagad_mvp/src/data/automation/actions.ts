/**
 * What a recipe actually does — FR-21, plan §7.
 *
 * `src/domain/automation` decides *whether* a recipe should run. This decides
 * what running means, and it is deliberately the thinnest layer in the feature:
 * every action here calls a repository method a person's button press also calls.
 * The bounce follow-up goes through `TaskRepository.create`, which runs the same
 * validation, writes the same row and emits the same event as a task somebody
 * typed. Automation is a caller of the machines, never a peer of them.
 *
 * ## No defaults, anywhere
 *
 * An action reads its thresholds off `binding.parameters` and refuses when they
 * are absent, exactly as `readLadder` refuses a ladder with no ceiling. A recipe
 * missing `dueInDays` produces a refused run with a sentence naming the
 * parameter — not a task quietly due tomorrow because a developer picked a
 * number. The whole point of "the system is configuration, not code" is that the
 * code holds none of it.
 *
 * ## The recipes that send
 *
 * Six of the twelve seeded recipes end in a message to a customer, and the
 * constitution says every outward mutation passes a person and a `<ConfirmGate>`.
 * Those two facts used to cancel each other out and the recipes did nothing at
 * all. They no longer do: an outbound recipe PREPARES a message in the outbox —
 * recipient, channel, template, subject, all decided — and a person RELEASES it
 * through the gate. The engine never sends. See `outbox.ts` for the full
 * argument; the short version is that raising work and reaching a customer are
 * two different acts and only the second one needs a human.
 *
 * Before it prepares anything it asks `checkOutbound`, which refuses on two
 * grounds and says which: no consent on file, or inside quiet hours. A consent
 * refusal stages nothing. A quiet-hours refusal stages the row with the instant
 * the hold lifts, because a notice dropped at two in the morning is a customer
 * nobody ever tells. Both write a `skipped` run carrying the sentence — FR-17.3
 * asks for the skip to be logged, and a hold nobody can read is the same as no
 * hold at all.
 */

import type { ActionContext, ActionOutcome, ActionRegistry } from '../../domain/automation'
import { RUN_DECISIONS, checkOutbound } from '../../domain/automation'
import { TASK_KINDS } from '../repo/tasks'
import type { TaskKind, TaskRepository } from '../repo/tasks'
import type { Outbox } from './outbox'
import type { RecipientResolver } from './recipients'

const DAY_MS = 86_400_000

function fired(reason: string): ActionOutcome {
  return { decision: RUN_DECISIONS.fired, reason }
}

function skipped(reason: string): ActionOutcome {
  return { decision: RUN_DECISIONS.skipped, reason }
}

function refused(reason: string): ActionOutcome {
  return { decision: RUN_DECISIONS.refused, reason }
}

/**
 * Reads a whole-day count off a recipe. Refuses rather than defaults, and says
 * which parameter it wanted — the sentence lands in the run ledger, where the
 * person who has to fix the recipe will read it.
 */
function readDays(context: ActionContext, key: string): number | string {
  const value = context.binding.parameters[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `The recipe ${context.binding.key} carries no whole-number \`${key}\`, so nothing says when the follow-up is due. Set it on /config/automation; there is no default for it in the code.`
  }
  return value
}

function dueAfter(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString()
}

export type ActionDeps = {
  readonly tasks: TaskRepository
  /** Where a message waits for the person who releases it. */
  readonly outbox: Outbox
  /** Subject to customer, for the consent check. See `recipients.ts`. */
  readonly recipientOf: RecipientResolver
  /** Overridable so a test can sit inside and outside quiet hours deliberately. */
  readonly quietHours?: readonly number[]
}

/**
 * Raises the follow-up a failed payment owes somebody.
 *
 * Shared by the bounce and the mandate failure because the two differ only in
 * their kind and their wording: both are "money did not arrive, and the record
 * will stop being chased unless a person is told".
 */
function followUpAction(options: {
  readonly deps: ActionDeps
  readonly kind: TaskKind
  readonly daysParameter: string
  readonly titleFor: (subjectId: string) => string
}) {
  return async (context: ActionContext): Promise<ActionOutcome> => {
    const subject = context.event.subject
    if (subject === undefined) {
      return refused(
        `${context.event.name} arrived with no subject, so there is no record to raise a follow-up against.`,
      )
    }

    const days = readDays(context, options.daysParameter)
    if (typeof days === 'string') return refused(days)

    // Already chased. Idempotency at the ledger stops a re-run of the SAME
    // trigger; this stops a second trigger on the same record producing a second
    // identical task, which the ledger cannot see because it is a different
    // occurrence.
    const existing = await options.deps.tasks.forSubject(subject.entity, subject.id)
    const openAlready = existing.find(
      (task) =>
        task.kind === options.kind && (task.state === 'open' || task.state === 'in_progress'),
    )
    if (openAlready !== undefined) {
      return skipped(
        `${openAlready.systemNo} is already open against ${subject.id} and is the follow-up this recipe would have raised. Nothing was written.`,
      )
    }

    const result = await options.deps.tasks.create({
      actorId: context.binding.key,
      raisedBy: context.binding.key,
      causedBy: context.cause,
      kind: options.kind,
      title: options.titleFor(subject.id),
      subjectEntity: subject.entity,
      subjectId: subject.id,
      dueAt: dueAfter(context.clockAt, days),
      priority: 'high',
      now: context.clockAt,
    })

    if (!result.ok) return refused(result.reason)

    return fired(
      `Raised ${result.record.systemNo} against ${subject.id}, due in ${days} day${days === 1 ? '' : 's'}.`,
    )
  }
}

/**
 * Prepares the message this recipe exists to send, and does not send it.
 *
 * The whole of the engine's answer to the confirm-gate rule is in the order of
 * the four steps below, and each one refuses out loud rather than falling back:
 *
 *   1. the recipe must name a template and a channel — no default, ever, for the
 *      same reason `readLadder` holds no default ceiling;
 *   2. the subject must resolve to a customer, or there is nobody to write to;
 *   3. consent must be on file, or nothing is prepared at all — FR-17.3;
 *   4. quiet hours hold the row rather than drop it, with the release instant on
 *      it, because a deferred notice is a notice and a dropped one is a silence.
 *
 * A prepared message is a `fired` run: the recipe did its whole job, which was
 * never "send" — it was "have this ready, correctly, for the person who sends".
 */
function stageOutbound(options: {
  readonly deps: ActionDeps
  /** What the message is for, in the words the outbox row shows a person. */
  readonly purpose: string
}) {
  return async (context: ActionContext): Promise<ActionOutcome> => {
    const { binding, event } = context
    const subject = event.subject

    if (subject === undefined) {
      return refused(
        `${event.name} arrived with no subject, so there is no record for a message to be about.`,
      )
    }

    const templateKey = binding.parameters.templateKey
    const channel = binding.parameters.channel
    if (typeof templateKey !== 'string' || templateKey.trim() === '') {
      return refused(
        `The recipe ${binding.key} names no \`templateKey\`, so there is no wording to prepare. Set it on /config/automation; the platform holds no default message.`,
      )
    }
    if (typeof channel !== 'string' || channel.trim() === '') {
      return refused(
        `The recipe ${binding.key} names no \`channel\`, so nothing says how this would reach the customer.`,
      )
    }

    const recipient = await options.deps.recipientOf(subject)
    if (!recipient.ok) return refused(recipient.reason)
    const customer = recipient.customer

    const check = checkOutbound({
      consentState: customer.consentState,
      at: context.clockAt,
      recipeKey: binding.key,
      ...(options.deps.quietHours === undefined ? {} : { quietHours: options.deps.quietHours }),
    })

    // A consent refusal prepares nothing. There is no row, no button and no
    // decision for anybody to make — which is what "honour the withdrawal"
    // means, as against "show it to somebody and hope they notice".
    if (!check.ok && !check.stage) {
      return { decision: RUN_DECISIONS.skipped, reason: check.reason }
    }

    const staged = options.deps.outbox.stage({
      recipeKey: binding.key,
      recipeVersion: binding.version,
      templateKey,
      channel,
      toName: customer.fullName,
      subjectEntity: subject.entity,
      subjectId: subject.id,
      customerId: customer.id,
      stagedAt: context.clockAt.toISOString(),
      releaseAfter: check.ok ? null : check.releaseAfter,
      causedBy: context.cause,
      note: `${options.purpose} Nothing has been sent: a person releases this through the confirm gate, exactly as they would a message they wrote themselves.`,
    })

    // Held rather than ready is a skip, because nothing was made releasable now.
    // The row exists and says when it can go, so the ledger sentence and the
    // outbox row tell one story rather than two.
    if (!check.ok) {
      return { decision: RUN_DECISIONS.skipped, reason: `${check.reason} It is ${staged.id}.` }
    }

    return fired(
      `Prepared ${staged.id} for ${customer.fullName} on ${channel}, from template ${templateKey}. Nothing has been sent — it is waiting on a person in Ready to send.`,
    )
  }
}

export function createActions(deps: ActionDeps): ActionRegistry {
  return {
    'collection.bounceFollowUp': followUpAction({
      deps,
      kind: TASK_KINDS.chequeBounce,
      daysParameter: 'dueInDays',
      titleFor: (subjectId) => `Chase the bounced cheque on ${subjectId}`,
    }),

    'mandate.failureFollowUp': followUpAction({
      deps,
      kind: TASK_KINDS.mandateFailure,
      // The seeded recipe carries `sameDay: true` rather than a day count, and
      // that is the parameter it means: same day is nought days from the tick.
      daysParameter: 'dueInDays',
      titleFor: (subjectId) => `Call about the failed mandate debit on ${subjectId}`,
    }),

    'quotation.autoShare': stageOutbound({
      deps,
      purpose: 'The quotation is ready to go to the customer.',
    }),
    'kyc.credentials': stageOutbound({
      deps,
      purpose: 'KYC completed, so the portal credentials are ready to go out.',
    }),
    'policy.issuedNotice': stageOutbound({
      deps,
      purpose: 'The policy has been issued and the customer has not been told yet.',
    }),
    'claim.statusUpdate': stageOutbound({
      deps,
      purpose: 'The claim moved and the customer is waiting to hear about it.',
    }),
    'renewal.reminder': stageOutbound({
      deps,
      purpose: 'A rung on the renewal ladder has come due for this policy.',
    }),
  }
}
