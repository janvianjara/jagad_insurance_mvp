/**
 * One customer's consent, read as a ledger — FR-20.1.
 *
 * The agency-wide ledger lives at `/config/compliance` and counts states across
 * the book. This is the same ledger scoped to one person, which is a different
 * question with the same vocabulary: `readConsent` from `<ConsentBadge>` decides
 * what the state means and `CHANNEL_LABEL` names the channels, so the customer's
 * page and the compliance screen cannot describe one consent two ways.
 *
 * What this module adds is what only makes sense per customer: the acts in order,
 * the channels the consent covers, and what a withdrawal suppresses.
 *
 * Every line it produces is anchored to a timestamp that exists on a record. It
 * reconstructs nothing it was not given — the same discipline `reconstructEvents`
 * keeps in `customer-desk.ts` — because a compliance page that invented a line
 * would be the worst possible place for one.
 *
 * No React, no repository.
 */

import { MESSAGE_CHANNELS } from '../../data/repo'
import type { ConsentRecord, Customer, MessageChannel, MessageLog, MessageTemplate } from '../../data/repo'
import type { Tone } from '../../ui/tone'
import type { ConsentWithdrawal } from './data/customer-desk'

export const CHANNEL_LABEL: Readonly<Record<MessageChannel, string>> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
}

/** DPDP §12 in one sentence, in the words the customer's own page uses. */
export const WITHDRAWAL_RIGHT =
  'A customer may withdraw consent as easily as they gave it. Withdrawal does not undo what was lawful before it, and it does not touch records the agency is required by insurance law to keep.'

/**
 * The honest line about where a withdrawal is written today.
 *
 * §9's consent machine has four states and none of them is `withdrawn`, so there
 * is no transition to make and no repository field to write. The withdrawal is
 * kept on the customer desk instead, and this page says so rather than moving a
 * pill and implying a transition that never happened.
 */
export const WITHDRAWAL_NOT_ON_THE_MACHINE =
  'Recorded on this customer’s file. The consent state machine has no withdrawn state yet, so the pill above still shows where the link itself got to — this platform will not move a status behind the machine’s back to make a screen read more tidily.'

/** What FR-17.3 asks for and this build does not yet do. Said once, on screen. */
export const SKIPS_NOT_LOGGED =
  'FR-17.3 also asks that every message skipped because of a withdrawal is logged. Nothing writes that log yet, so this page can say what is suppressed and cannot yet show you the individual sends it stopped.'

/* ------------------------------------------------------------------ the acts */

export const CONSENT_ACTS = {
  linkIssued: 'link_issued',
  chased: 'chased',
  submitted: 'submitted',
  expired: 'expired',
  withdrawn: 'withdrawn',
} as const

export type ConsentAct = (typeof CONSENT_ACTS)[keyof typeof CONSENT_ACTS]

export type ConsentLedgerEntry = {
  readonly id: string
  readonly act: ConsentAct
  readonly at: string
  readonly label: string
  readonly detail: string
  readonly tone: Tone
}

/**
 * Every consent act against this customer, newest first.
 *
 * Each entry exists because a timestamp exists to put it at: the link's
 * `issuedAt`, the customer's `submittedAt`, the record's `expiresAt` once the
 * state says it lapsed, the chase count the KYC queue writes, and any withdrawal
 * on the desk. Where a timestamp is missing the line is missing, which is the
 * only honest way to draw a ledger from records rather than from an event store.
 *
 * The chase line is the one that cannot be fully drawn: `lastConsentChaseAt` is a
 * single timestamp beside a count, so the record knows a link was re-sent four
 * times and when the last one went. The entry says exactly that and no more.
 */
export function consentLedger(
  customer: Customer,
  consent: ConsentRecord | null,
  withdrawals: readonly ConsentWithdrawal[],
  now: Date,
): readonly ConsentLedgerEntry[] {
  const entries: ConsentLedgerEntry[] = []

  if (consent) {
    entries.push({
      id: `${consent.id}:issued`,
      act: CONSENT_ACTS.linkIssued,
      at: consent.issuedAt,
      label: 'Consent link issued',
      detail: `A tokenised, expiring, login-free page went out on ${CHANNEL_LABEL[consent.channel]}. It carries no session and grants no portal access.`,
      tone: 'info',
    })

    if (customer.lastConsentChaseAt !== null && customer.consentChaseCount > 0) {
      entries.push({
        id: `${consent.id}:chased`,
        act: CONSENT_ACTS.chased,
        at: customer.lastConsentChaseAt,
        label:
          customer.consentChaseCount === 1
            ? 'Chased once'
            : `Chased ${customer.consentChaseCount} times`,
        detail:
          'The record keeps a count and the date of the most recent chase, not a row for each one. This line is the last of them.',
        tone: 'warn',
      })
    }

    if (consent.submittedAt !== null) {
      entries.push({
        id: `${consent.id}:submitted`,
        act: CONSENT_ACTS.submitted,
        at: consent.submittedAt,
        label: 'Consent given by the customer',
        detail:
          'The customer filled the page themselves, so the audit trail names them as the actor rather than a member of staff.',
        tone: 'ok',
      })
    }

    const lapsed =
      consent.submittedAt === null &&
      (consent.state === 'expired' || new Date(consent.expiresAt).getTime() <= now.getTime())

    if (lapsed) {
      entries.push({
        id: `${consent.id}:expired`,
        act: CONSENT_ACTS.expired,
        at: consent.expiresAt,
        label: 'Link expired unused',
        detail:
          'The window closed before the customer came back. A fresh link is sent from the KYC tab, where the machine that issues one lives.',
        tone: 'idle',
      })
    }
  }

  for (const withdrawal of withdrawals) {
    entries.push({
      id: `withdrawal:${withdrawal.withdrawnAt}`,
      act: CONSENT_ACTS.withdrawn,
      at: withdrawal.withdrawnAt,
      label: `Consent withdrawn on ${withdrawal.channels.map((channel) => CHANNEL_LABEL[channel]).join(', ')}`,
      detail: withdrawal.reason,
      tone: 'bad',
    })
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at))
}

/* --------------------------------------------------------------- the channels */

export type ChannelStanding = {
  readonly channel: MessageChannel
  readonly label: string
  /** True where the consent link itself went out on this channel. */
  readonly consentedOn: boolean
  /** Active templates configured to send on it. What a withdrawal would suppress. */
  readonly templates: readonly string[]
  /** What has actually been sent to this customer on it. */
  readonly sent: number
  readonly suppressed: boolean
}

/** The channels a withdrawal covers, taken from the withdrawals themselves. */
export function suppressedChannels(
  withdrawals: readonly ConsentWithdrawal[],
): readonly MessageChannel[] {
  return [...new Set(withdrawals.flatMap((withdrawal) => withdrawal.channels))]
}

/**
 * Where each channel stands for this customer.
 *
 * `consentedOn` is deliberately narrow: `ConsentRecord` holds ONE channel — the
 * one the link was delivered on — and there is no per-channel consent flag
 * anywhere in §8. So this says the link went out on WhatsApp, which is what the
 * record knows, and does not claim the customer ticked three boxes.
 *
 * `templates` is what an active template on that channel would send, which is
 * the honest answer to "what does a withdrawal actually stop".
 */
export function channelStandings(
  consent: ConsentRecord | null,
  messages: readonly MessageLog[],
  templates: readonly MessageTemplate[],
  withdrawals: readonly ConsentWithdrawal[],
): readonly ChannelStanding[] {
  const stopped = suppressedChannels(withdrawals)

  return Object.values(MESSAGE_CHANNELS).map((channel) => ({
    channel,
    label: CHANNEL_LABEL[channel],
    consentedOn: consent?.channel === channel,
    templates: templates
      .filter((template) => template.active && template.channel === channel)
      .map((template) => template.key),
    sent: messages.filter((message) => message.channel === channel).length,
    suppressed: stopped.includes(channel),
  }))
}
