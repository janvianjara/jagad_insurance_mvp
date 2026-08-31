/**
 * Which screen reads which parameter — written down, because a configuration
 * value nobody can trace is a value nobody dares change.
 *
 * Every sentence here names a real reader in this codebase and was checked
 * against it. Where nothing reads a parameter yet, that is what it says: a
 * recipe configured ahead of the step that will use it is honest, and a screen
 * claiming otherwise would be the kind of confident wrongness this platform is
 * built to avoid.
 *
 * The two the inquiry desk depends on are the reason this file exists at all.
 * `/inquiries` will not escalate without a recipient named on `inquiry.escalation`
 * — it renders the refusal instead — and the TAT clock on every inquiry row is
 * measured against the allowance `inquiry.routing` carries.
 */

import type { MessageChannel, RecipeParameters } from '../../../data/repo'

/** How a parameter is edited. Derived from its key and its recorded type. */
export const PARAMETER_KINDS = {
  minutes: 'minutes',
  days: 'days',
  count: 'count',
  user: 'user',
  channel: 'channel',
  template: 'template',
  flag: 'flag',
  text: 'text',
} as const

export type ParameterKind = (typeof PARAMETER_KINDS)[keyof typeof PARAMETER_KINDS]

export function parameterKind(key: string, value: RecipeParameters[string]): ParameterKind {
  if (key.endsWith('UserId')) return PARAMETER_KINDS.user
  if (key === 'channel') return PARAMETER_KINDS.channel
  if (key === 'templateKey') return PARAMETER_KINDS.template
  if (typeof value === 'boolean') return PARAMETER_KINDS.flag
  if (typeof value === 'number') {
    if (key.toLowerCase().includes('minutes')) return PARAMETER_KINDS.minutes
    if (key.toLowerCase().includes('days')) return PARAMETER_KINDS.days
    return PARAMETER_KINDS.count
  }
  return PARAMETER_KINDS.text
}

export const PARAMETER_UNITS: Partial<Record<ParameterKind, string>> = {
  minutes: 'minutes',
  days: 'days',
}

/** `escalateToUserId` reads as "Escalate to user id" in a label. */
export function parameterLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function channelLabel(channel: MessageChannel | string): string {
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'sms') return 'SMS'
  if (channel === 'email') return 'Email'
  return channel
}

/* --------------------------------------------------------------- the readers */

export type ParameterReader = {
  /** The parameter this sentence is about. */
  readonly parameter: string
  /** The screen or module that reads it, named so somebody can go and look. */
  readonly where: string
  readonly sentence: string
}

export type RecipeNotes = {
  /** What this recipe does, in the words an admin would use. */
  readonly effect: string
  readonly readers: readonly ParameterReader[]
}

export const RECIPE_NOTES: Readonly<Record<string, RecipeNotes>> = {
  'inquiry.routing': {
    effect:
      'A new inquiry is routed to somebody in its category group, and the turnaround clock starts.',
    readers: [
      {
        parameter: 'tatMinutes',
        where: '/inquiries',
        sentence:
          'This is the allowance the inquiry queue and inquiry detail measure every TAT clock against. It is held per routing category, listed below as it stands, and §9 is explicit that it is a recipe parameter rather than a constant — there is nothing in code for it to fall back to, so an inquiry whose category has no allowance shows no clock at all.',
      },
      {
        parameter: 'escalateToUserId',
        where: 'inquiry.escalation',
        sentence:
          'Routing does not read this one. Escalation does, and it reads it off the escalation recipe below rather than off this one.',
      },
      {
        parameter: 'notifyAssignee',
        where: 'Message log',
        sentence:
          'Whether the person an inquiry lands on is told. The wording comes from the message template, not from here.',
      },
    ],
  },

  'inquiry.escalation': {
    effect: 'A twice-lapsed inquiry leaves the category group and goes to a named manager.',
    readers: [
      {
        parameter: 'escalateToUserId',
        where: '/inquiries',
        sentence:
          'planEscalation in src/features/inquiries/routing.ts reads this and nothing else. There is no list of people in that file: with nobody named here, the inquiry screen refuses to escalate and prints the reason rather than picking somebody.',
      },
      {
        parameter: 'tatMinutes',
        where: 'Not read yet',
        sentence:
          'The escalation recipe carries its own allowance for the step after handover. Nothing reads it yet.',
      },
      {
        parameter: 'carryHistory',
        where: '/inquiries',
        sentence:
          'The assignment trail is kept whole across an escalation, so the manager can see who held it and for how long.',
      },
    ],
  },

  'quotation.autoShare': {
    effect: 'A quotation is shared with the customer as soon as it exists.',
    readers: [
      {
        parameter: 'autoShare',
        where: '/quotations/:id',
        sentence:
          'composer-data.ts in src/features/quotations reads this to decide whether the composer offers to share on generation. The send itself still goes through a confirm gate.',
      },
      {
        parameter: 'channel',
        where: '/quotations/:id',
        sentence: 'Which channel the share goes out on, read alongside autoShare.',
      },
    ],
  },

  'renewal.reminder': {
    effect:
      'A renewal that has entered the pool is nudged on a ladder of days, up to a ceiling, with the year-wise amounts and the current offers.',
    readers: [
      {
        parameter: 'offsetsDays',
        where: 'src/domain/automation',
        sentence:
          'readLadder in src/domain/automation/ladder.ts parses this into the rungs dueTicks fires on: 45, 30, 15 and so on before expiry. It is a day list rather than a number because a recipe parameter holds one scalar, and it is parsed strictly — a rung that will not read stops the whole ladder, because a ladder silently missing its 7-day rung looks exactly like one that never had it. Nothing dispatches from these rungs yet: the tick is built and tested, the runtime that binds it to the bus and the desks is not.',
      },
      {
        parameter: 'graceOffsetsDays',
        where: 'src/domain/automation',
        sentence:
          'The rungs AFTER expiry, while win-back is still worth working. They fold onto the same number line as negative offsets, so the tick can pick the most recent rung without caring which side of expiry it fell on.',
      },
      {
        parameter: 'maxReminders',
        where: '/renewals/:id',
        sentence:
          'The ceiling on sends, and it is authoritative over the ladder: a five-rung ladder with a ceiling of three sends three. The renewal detail screen reads it through maxReminders in lead-days.ts, and readLadder refuses a ladder that carries no ceiling at all rather than treating absent as unlimited.',
      },
      {
        parameter: 'channel',
        where: 'Not read yet',
        sentence:
          'Which channel the reminder goes out on. The send is still a person pressing the button on the renewal detail screen, which uses the template rather than this.',
      },
      {
        parameter: 'templateKey',
        where: 'Not read yet',
        sentence: 'The template the reminder is built from, once something dispatches automatically.',
      },
    ],
  },

  'kyc.credentials': {
    effect: 'Portal credentials are issued the moment KYC completes.',
    readers: [
      {
        parameter: 'channel',
        where: 'Customer 360',
        sentence:
          'customer-desk.ts in src/features/customers reads the channel and the template when credentials are issued. Completion fires this as part of the same transition, so there is no path to complete KYC that skips it.',
      },
      {
        parameter: 'templateKey',
        where: 'Customer 360',
        sentence: 'The template the credentials message is built from.',
      },
    ],
  },
}

/** The default note for a recipe configured ahead of the step that will read it. */
export const UNREAD_NOTE =
  'No screen reads this parameter yet. The recipe is configured ahead of the step that will, which is what lets the agency answer the question before the feature arrives.'
