/**
 * How one domain event reads on a record's timeline.
 *
 * Charter U14 asks every record to be able to say who did what, when. The event
 * log already holds that — `src/domain/events.ts` stamps a name, an instant, an
 * actor and a subject on every transition — so the timeline is a rendering of the
 * log rather than a second history somebody has to remember to append to.
 *
 * Two properties make this generic rather than customer-specific:
 *
 *   - the reading table is a partial map. An event with an entry gets the
 *     sentence a person would write; an event without one still gets a line,
 *     derived from its own name, because a silent event is exactly the drop §9
 *     spends its length preventing. A timeline that renders only the events
 *     somebody remembered to add a case for is a timeline that lies by omission.
 *   - nothing here reads a repository or a fixture. The caller resolves actor
 *     ids to names, so the same component serves a customer, a policy and a
 *     claim without knowing what any of them are.
 */

import type { DomainEvent, DomainEventName } from '../../domain/events'
import type { IconName } from '../../ui/Icon'
import type { Tone } from '../../ui/tone'

export type EventReading = {
  /** The sentence the line leads with, written to be read. */
  readonly title: string
  readonly tone: Tone
  readonly icon: IconName
}

export type TimelineEntry = EventReading & {
  readonly id: string
  readonly at: string
  /** Resolved by the caller. "System" when a recipe did it rather than a person. */
  readonly actorName: string
  readonly eventName: DomainEventName
  /** The event's own workflow detail, already turned into prose by the caller. */
  readonly detail?: string
}

/**
 * The events a customer record accumulates, in the words the back office uses.
 * Other modules add their own entries here as they land; nothing is renamed,
 * because these names are the contract §7 describes.
 */
export const EVENT_READING: Readonly<Partial<Record<DomainEventName, EventReading>>> = {
  'inquiry.created': { title: 'Inquiry captured', tone: 'info', icon: 'plus' },
  'inquiry.converted': { title: 'Inquiry converted to a quotation', tone: 'ok', icon: 'doc' },
  'quotation.shared': { title: 'Quotation shared with the customer', tone: 'info', icon: 'msg' },
  'quotation.won': { title: 'Quotation won', tone: 'ok', icon: 'check' },
  'deal.created': { title: 'Deal opened', tone: 'ok', icon: 'doc' },

  'kyc.started': { title: 'KYC opened', tone: 'attn', icon: 'folder' },
  'kyc.partial': { title: 'KYC part-filled', tone: 'attn', icon: 'folder' },
  'kyc.completed': { title: 'KYC complete', tone: 'ok', icon: 'check' },
  'consent.link_issued': { title: 'Consent link sent', tone: 'attn', icon: 'msg' },
  'consent.submitted': { title: 'Consent given by the customer', tone: 'ok', icon: 'check' },
  'consent.expired': { title: 'Consent link expired unused', tone: 'idle', icon: 'clock' },
  'credentials.generated': { title: 'Portal credentials issued', tone: 'ok', icon: 'lock' },

  'document.uploaded': { title: 'Document received', tone: 'info', icon: 'doc' },
  'document.verified': { title: 'Document verified', tone: 'ok', icon: 'check' },
  'message.sent': { title: 'Message sent', tone: 'info', icon: 'msg' },

  'policy.drafted': { title: 'Policy entry started', tone: 'info', icon: 'doc' },
  'policy.proposal_sent': { title: 'Proposal sent to the insurer', tone: 'warn', icon: 'upload' },
  'policy.issued': { title: 'Policy issued', tone: 'ok', icon: 'shield' },
  'policy.versioned': { title: 'Policy version recorded', tone: 'info', icon: 'doc' },
  'policy.lapsed': { title: 'Policy lapsed', tone: 'bad', icon: 'alert' },

  'collection.recorded': { title: 'Payment recorded', tone: 'info', icon: 'coin' },
  'collection.verified': { title: 'Payment verified by the back office', tone: 'ok', icon: 'check' },
  'payment.reference_recorded': { title: 'Payment reference recorded', tone: 'info', icon: 'coin' },
  'cheque.bounced': { title: 'Cheque bounced', tone: 'bad', icon: 'alert' },

  'task.created': { title: 'Task raised', tone: 'attn', icon: 'inbox' },
  'task.completed': { title: 'Task completed', tone: 'ok', icon: 'check' },

  'renewal.scheduled': { title: 'Renewal scheduled', tone: 'info', icon: 'clock' },
  'renewal.reminded': { title: 'Renewal reminder sent', tone: 'info', icon: 'msg' },
}

/**
 * A sentence for an event nobody has written a reading for yet.
 *
 * `policy.documents_collected` becomes "Policy — documents collected". Plain,
 * but present, which is the whole requirement: the line appears, dated, with the
 * actor on it, and somebody can improve the wording later without the history
 * having been missing in the meantime.
 */
export function fallbackReading(name: DomainEventName): EventReading {
  const [subject = name, action = ''] = name.split('.')
  const head = subject.charAt(0).toUpperCase() + subject.slice(1)
  const tail = action.replace(/_/g, ' ')
  return { title: tail === '' ? head : `${head} — ${tail}`, tone: 'info', icon: 'clock' }
}

export function readingFor(name: DomainEventName): EventReading {
  return EVENT_READING[name] ?? fallbackReading(name)
}

export type TimelineOptions = {
  /** Turns an actor id into a name. Unknown ids are the caller's problem to word. */
  readonly actorName?: (actorId: string | undefined) => string
  /** Extra prose for one line — a reason, a channel, a destination. */
  readonly detailOf?: (event: DomainEvent) => string | undefined
  /** Newest first by default: a record's timeline is read from the top. */
  readonly order?: 'newest' | 'oldest'
}

const DEFAULT_ACTOR = 'System'

/**
 * The event log, as lines somebody can read.
 *
 * Stable: two events stamped at the same instant keep the order they arrived in,
 * which matters because a transition emits its follow-on events (the credentials
 * recipe, the message) with the same timestamp as the transition itself, and
 * "KYC complete" has to sit above "credentials issued" rather than below it.
 */
export function buildTimeline(
  events: readonly DomainEvent[],
  options: TimelineOptions = {},
): readonly TimelineEntry[] {
  const { actorName, detailOf, order = 'newest' } = options

  const entries = events.map((event, index): TimelineEntry => {
    const reading = readingFor(event.name)
    const detail = detailOf?.(event)
    return {
      ...reading,
      id: `${index}-${event.name}-${event.at}`,
      at: event.at,
      actorName: actorName?.(event.actorId) ?? event.actorId ?? DEFAULT_ACTOR,
      eventName: event.name,
      ...(detail === undefined || detail === '' ? {} : { detail }),
    }
  })

  const oldestFirst = [...entries].sort((a, b) => a.at.localeCompare(b.at))
  return order === 'oldest' ? oldestFirst : oldestFirst.reverse()
}
