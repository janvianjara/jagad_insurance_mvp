/**
 * Whether the platform may speak to this person, right now — FR-21, FR-17.3,
 * FR-08.4.
 *
 * The constitution says every outward mutation goes through `<ConfirmGate>` and
 * that cancel writes nothing. An automation that sends a message with no cancel
 * path breaks that, and "the engine simply never sends" breaks FR-21 instead. So
 * the engine splits the two halves of a send that were never really one:
 *
 *   raising work    creating a task, flagging a row, emitting a trigger.
 *                   Internal, reversible, and done automatically.
 *   leaving the     a message to a customer. STAGED by the engine, released by a
 *   building        person through the gate. The engine never sends.
 *
 * This module is the gate in front of staging. It answers one question — may
 * this message be prepared for release at this instant? — and answers it in the
 * allow/refuse-with-a-sentence shape every machine in `src/domain/workflows`
 * uses, because the sentence is what the run ledger renders when somebody asks
 * why nobody was told.
 *
 * ## Two holds, and they are not the same kind of thing
 *
 * Consent is a fact about the person: absent consent, nothing is staged at all,
 * because a message nobody agreed to receive should not be sitting one click
 * from going out. FR-17.3 requires the withdrawal to be honoured and the skip to
 * be logged; a hold with no record is indistinguishable from a recipe nobody
 * switched on.
 *
 * Quiet hours are a fact about the clock, and a clock moves on. So a quiet-hours
 * hold still stages the message and stamps the instant it may be released — the
 * run is `skipped`, because nothing was prepared for sending *now*, and nothing
 * is lost, because the row is sitting in the outbox with its release time on it.
 * Dropping it instead would mean a policy issued at two in the morning is a
 * customer nobody ever tells.
 *
 * Everything here is pure and takes its instant as an argument. There is no
 * `new Date()` in this file, which is what lets a test sit at 02:00 and at 10:00
 * and assert two different sentences.
 */

import { CONSENT_CADENCE, afterQuietHours, inQuietHours } from './cadence'

/** Why an outbound message was not prepared for release now. */
export const OUTBOUND_HOLDS = {
  /** No consent on file, or it lapsed. Nothing is staged. */
  consent: 'consent',
  /** Inside the quiet window. Staged, with the release time stamped on it. */
  quietHours: 'quiet_hours',
} as const

export type OutboundHold = (typeof OUTBOUND_HOLDS)[keyof typeof OUTBOUND_HOLDS]

/**
 * The one consent state an automated message may be prepared under.
 *
 * `submitted` is the state `consentMachine` lands on when the customer answered
 * the link. `not_sent`, `link_issued` and `expired` are all "we have not been
 * told yes", and the engine treats them alike: a person may still send by hand
 * from the customer file, where a human is looking at the whole record.
 */
export const CONSENTED_STATE = 'submitted'

export type OutboundDecision =
  | { readonly ok: true; readonly reason: string }
  | {
      readonly ok: false
      readonly hold: OutboundHold
      readonly reason: string
      /** Stage anyway and hold it, or refuse to stage at all. */
      readonly stage: boolean
      /** ISO instant the hold lifts, when it lifts on its own. */
      readonly releaseAfter: string | null
    }

export type OutboundInput = {
  /** The recipient's consent state, as the customer record carries it. */
  readonly consentState: string
  /** The instant the run claims as now. Never read from a wall clock here. */
  readonly at: Date
  /** Named so the sentence can say which rule declined. */
  readonly recipeKey: string
  /** Overridable so a test can sit inside and outside the window deliberately. */
  readonly quietHours?: readonly number[]
}

/**
 * May this message be staged for release now?
 *
 * Consent is checked before the clock, because a customer who has not consented
 * is not owed a message at nine in the morning either, and reporting the later
 * hold first would send somebody to fix the wrong thing.
 */
export function checkOutbound(input: OutboundInput): OutboundDecision {
  const window = input.quietHours ?? CONSENT_CADENCE.quietHours

  if (input.consentState !== CONSENTED_STATE) {
    return {
      ok: false,
      hold: OUTBOUND_HOLDS.consent,
      stage: false,
      releaseAfter: null,
      reason:
        `${input.recipeKey} did not stage a message: this customer's consent is "${input.consentState}" rather than "${CONSENTED_STATE}". ` +
        'Nothing was prepared and nothing was sent. A person can still write to them from the customer file, where the whole record is on screen.',
    }
  }

  if (inQuietHours(input.at, window)) {
    const releaseAfter = afterQuietHours(input.at, window)
    return {
      ok: false,
      hold: OUTBOUND_HOLDS.quietHours,
      stage: true,
      releaseAfter: releaseAfter.toISOString(),
      reason:
        `${input.recipeKey} prepared this message but held it: quiet hours run from ${window[0]}:00 to ${window[1]}:00 and it is ${input.at.getHours()}:00. ` +
        `It is waiting in the outbox and can be released from ${releaseAfter.toISOString()}. Nothing has been sent.`,
    }
  }

  return {
    ok: true,
    reason: `${input.recipeKey} prepared a message for release. Consent is on file and it is outside quiet hours.`,
  }
}
