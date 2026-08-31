/**
 * How an inquiry reads: its colour, its pin rank, and its timeline.
 *
 * Pure, and deliberately outside the screens. Three things this file decides are
 * assertions the plan makes rather than presentation choices, and each is easier
 * to keep honest when it can be tested without a DOM:
 *
 *   - a machine state maps to a tone through `src/ui/tone.ts` and nowhere else,
 *     so no screen invents a colour per status;
 *   - "unassigned and TAT-at-risk pinned" (§5) is a rank over rows, not a second
 *     query, so the pinned rows are the same rows the URL asked for;
 *   - the timeline shows every event. It is built from the record's own
 *     assignment trail plus the domain events the machine emitted, so an event
 *     cannot happen without a line appearing.
 */

import type { DomainEvent } from '../../domain/events'
import type { InquiryState } from '../../domain/workflows'
import type { Agent, Customer, CustomerSource, Inquiry, StaffUser } from '../../data/repo'
import type { Activity, Disposition } from '../../data/repo'
import type { TrailCarry, TrailEntry, TrailKind } from '../../components/AssignmentTrail'
import { readClock } from '../../ui/signal'
import type { Severity, Tone } from '../../ui/tone'
import { nameOf } from './routing'

const MINUTE_MS = 60_000

/** The one place a machine state becomes a colour. U7 wording, U7 tones. */
export const INQUIRY_TONE: Readonly<Record<InquiryState, Tone>> = {
  new: 'attn',
  assigned: 'warn',
  reassigned: 'warn',
  accepted: 'ok',
  unrouted: 'attn',
  escalated: 'bad',
  converted: 'ok',
  lost: 'idle',
}

export const INQUIRY_LABEL: Readonly<Record<InquiryState, string>> = {
  new: 'New',
  assigned: 'Assigned',
  reassigned: 'Reassigned',
  accepted: 'Accepted',
  unrouted: 'Unrouted',
  escalated: 'Escalated',
  converted: 'Converted',
  lost: 'Lost',
}

export const SOURCE_LABEL: Readonly<Record<CustomerSource, string>> = {
  website: 'Website',
  walk_in: 'Walk-in',
  referral: 'Referral',
  sub_agent: 'Sub-agent',
  campaign: 'Campaign',
  renewal: 'Renewal',
}

/**
 * Who referred this lead, in words — null when nobody did.
 *
 * A referrer that no longer resolves prints its own id rather than "Unknown":
 * the attribution was recorded against something, and saying what beats saying
 * nothing when somebody has to go and find out why it does not resolve.
 */
export function referrerLabel(
  inquiry: Inquiry,
  people: {
    readonly customers: readonly Customer[]
    readonly agents: readonly Agent[]
    readonly users: readonly StaffUser[]
  },
): string | null {
  const referral = inquiry.referral
  if (referral === null) return null
  if (referral.kind === 'external') {
    return `${referral.referrerName ?? 'Unnamed'} — not on our books`
  }

  const id = referral.referrerId
  if (referral.kind === 'customer') {
    return people.customers.find((row) => row.id === id)?.fullName ?? (id ?? 'Not recorded')
  }
  if (referral.kind === 'sub_agent') {
    return people.agents.find((row) => row.id === id)?.name ?? (id ?? 'Not recorded')
  }
  return people.users.find((row) => row.id === id)?.name ?? (id ?? 'Not recorded')
}

/** The states whose TAT clock is still running. Everything else has stopped it. */
const CLOCK_RUNNING: readonly InquiryState[] = ['assigned', 'reassigned']

export function isClockRunning(inquiry: Inquiry): boolean {
  return CLOCK_RUNNING.includes(inquiry.status) && inquiry.tatDueAt !== null
}

export type TatReading = {
  readonly running: boolean
  readonly dueAt: Date | null
  readonly remainingMs: number | null
  readonly breached: boolean
  /** Inside the warning fraction of the allowance, or already past it. */
  readonly atRisk: boolean
  readonly text: string
}

/**
 * The countdown, from the record's own due time.
 *
 * `tatMinutes` is the allowance the routing recipe set. Without it there is a
 * deadline but no sense of how much of the allowance is left, so the reading
 * says breached or not and claims nothing about "at risk".
 */
export function readTat(
  inquiry: Inquiry,
  now: Date,
  tatMinutes: number | null,
): TatReading {
  if (!isClockRunning(inquiry) || inquiry.tatDueAt === null || inquiry.assignedAt === null) {
    return { running: false, dueAt: null, remainingMs: null, breached: false, atRisk: false, text: 'clock stopped' }
  }

  const dueAt = new Date(inquiry.tatDueAt)
  const remainingMs = dueAt.getTime() - now.getTime()

  if (tatMinutes === null) {
    return {
      running: true,
      dueAt,
      remainingMs,
      breached: remainingMs <= 0,
      atRisk: remainingMs <= 0,
      text: remainingMs <= 0 ? 'breached' : 'running',
    }
  }

  const reading = readClock({
    mode: 'tat',
    start: new Date(inquiry.assignedAt),
    now,
    durationMs: tatMinutes * MINUTE_MS,
  })

  return {
    running: true,
    dueAt,
    remainingMs: reading.remainingMs,
    breached: reading.breached,
    atRisk: reading.tone !== 'ok',
    text: reading.text,
  }
}

export function isUnassigned(inquiry: Inquiry): boolean {
  return inquiry.ownerId === null
}

/**
 * Whether this lead has quietly stopped being worked — FR-06.15, FR-06.17.
 *
 * Two shapes, and the second is the one nothing in the product could see before.
 * An overdue next action is a promise the agency made to itself and missed. A
 * *missing* one on an accepted inquiry is worse: nobody ever made the promise,
 * and the TAT clock has already stopped, so until now the record sat there
 * looking exactly like one being worked.
 */
export function engagementLapse(
  inquiry: Inquiry,
  now: Date,
): 'overdue' | 'unplanned' | null {
  if (inquiry.status !== 'accepted') return null
  if (inquiry.nextActionAt === null) return 'unplanned'
  const due = new Date(inquiry.nextActionAt)
  if (Number.isNaN(due.getTime())) return null
  return due.getTime() < now.getTime() ? 'overdue' : null
}

/**
 * §5: "unassigned and TAT-at-risk pinned". Lower rank sorts first.
 *
 * The two engagement ranks sit below the TAT ones deliberately. A breached
 * turnaround is somebody waiting on a first response; a missed follow-up is
 * somebody waiting on a second. Both belong above the calm rows, and in that
 * order.
 */
export function pinRank(inquiry: Inquiry, now: Date, tatMinutes: number | null): number {
  const tat = readTat(inquiry, now, tatMinutes)
  const lapse = engagementLapse(inquiry, now)
  if (inquiry.status === 'escalated') return 0
  if (tat.breached) return 1
  if (isUnassigned(inquiry) && inquiry.status !== 'converted' && inquiry.status !== 'lost') return 2
  if (tat.atRisk) return 3
  if (lapse === 'overdue') return 4
  if (lapse === 'unplanned') return 5
  return 6
}

export function isPinned(inquiry: Inquiry, now: Date, tatMinutes: number | null): boolean {
  return pinRank(inquiry, now, tatMinutes) < 6
}

/** Queue stripe severity. How much trouble the row is in, not which state it holds. */
export function inquirySeverity(
  inquiry: Inquiry,
  now: Date,
  tatMinutes: number | null,
): Severity | undefined {
  const tat = readTat(inquiry, now, tatMinutes)
  if (inquiry.status === 'escalated' || tat.breached) return 'hot'
  if (inquiry.status === 'unrouted' || inquiry.status === 'new') return 'attn'
  if (tat.atRisk) return 'warm'
  // An accepted inquiry that has gone quiet is not a calm row. Reading it as
  // "good" because its clock stopped is exactly the false comfort the engagement
  // layer exists to remove.
  if (engagementLapse(inquiry, now) !== null) return 'attn'
  if (inquiry.status === 'accepted' || inquiry.status === 'converted') return 'good'
  return 'cool'
}

/* ------------------------------------------------------------------ timeline */

/** Domain events this module turns into their own timeline line. */
const EVENT_KIND: Readonly<Record<string, { kind: TrailKind; title: string }>> = {
  'inquiry.created': { kind: 'created', title: 'Inquiry captured' },
  'inquiry.confirmed': { kind: 'accepted', title: 'Assignee confirmed' },
  'inquiry.accepted': { kind: 'accepted', title: 'Accepted — the assignee owns it and the clock stopped' },
  'inquiry.escalated': { kind: 'escalated', title: 'Escalated with the full assignment history' },
  'inquiry.unrouted': { kind: 'unrouted', title: 'Unrouted — no category matched' },
  'inquiry.converted': { kind: 'converted', title: 'Converted to a quotation' },
  'inquiry.lost': { kind: 'lost', title: 'Marked lost' },
}

/** The two the record's own assignment trail already accounts for. */
const HOLD_EVENTS: readonly string[] = ['inquiry.assigned', 'inquiry.reassigned']

export type TrailInput = {
  readonly inquiry: Inquiry
  readonly users: readonly StaffUser[]
  /** The allowance the routing recipe set, so an open hold can show its countdown. */
  readonly tatMinutes: number | null
  /** Everything the machine emitted for this inquiry, oldest first. */
  readonly events: readonly DomainEvent[]
  /** Contacts logged against this inquiry — FR-06.13. */
  readonly activities?: readonly Activity[]
  /** The configured outcomes, so a line reads the label rather than the key. */
  readonly dispositions?: readonly Disposition[]
  /** Only to name a referrer on the capture line — FR-06.2. */
  readonly customers?: readonly Customer[]
  readonly agents?: readonly Agent[]
}

/** How each channel reads on a timeline line. */
const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Meeting',
  visit: 'Visit',
}

/**
 * One logged contact as a timeline line — FR-06.13.
 *
 * The note is deliberately not rendered here. It is on the record for the person
 * who needs it, but a timeline is read at a glance and skimming somebody's
 * account of a phone call is not what the line is for: the line answers who,
 * when, through what, and what came of it. That is also the shape the Assistant
 * is allowed to see, which is not a coincidence — both are reading the operational
 * facts and leaving the words where they were typed.
 */
export function activityEntries(
  activities: readonly Activity[],
  dispositions: readonly Disposition[],
  users: readonly StaffUser[],
): readonly TrailEntry[] {
  return activities.map((activity) => {
    const outcome =
      dispositions.find((row) => row.key === activity.dispositionKey)?.label ??
      activity.dispositionKey
    const channel = CHANNEL_LABEL[activity.channel] ?? activity.channel
    const inbound = activity.direction === 'inbound'

    return {
      id: `activity-${activity.id}`,
      kind: inbound ? 'replied' : 'contacted',
      title: inbound ? `${channel} received — ${outcome}` : `${channel} — ${outcome}`,
      at: activity.occurredAt,
      until: activity.occurredAt,
      actorName: nameOf(users, activity.actorId),
      ...(activity.attemptNo > 0
        ? { detail: `Attempt ${activity.attemptNo}.` }
        : {}),
    }
  })
}

export function carriedHistory(inquiry: Inquiry, users: readonly StaffUser[]): readonly TrailCarry[] {
  return inquiry.assignmentHistory.map((entry, index) => ({
    id: `carry-${index}`,
    label: nameOf(users, entry.assigneeId),
    from: entry.assignedAt,
    to: entry.releasedAt ?? null,
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  }))
}

/**
 * The record's history as lines somebody can read.
 *
 * Assignment holds come from the record, because they predate this session and
 * carry the release times escalation needs. Everything else comes from the event
 * log, one line per event, which is what makes "the timeline shows every event"
 * a property of the construction rather than of somebody remembering to add a
 * case. A state the record is already in when the screen opens, with no event to
 * account for it, still gets a line — a silent state is the thing §9 is against.
 */
export function buildTrail({
  inquiry,
  users,
  tatMinutes,
  events,
  activities = [],
  dispositions = [],
  customers = [],
  agents = [],
}: TrailInput): readonly TrailEntry[] {
  const entries: TrailEntry[] = []
  const holds = inquiry.assignmentHistory

  entries.push({
    id: 'created',
    kind: 'created',
    title: 'Inquiry captured',
    at: inquiry.createdAt,
    until: holds[0]?.assignedAt ?? null,
    detail: [
      `Source: ${SOURCE_LABEL[inquiry.source]}`,
      // Who sent this lead, on the line that says where it came from — the
      // history is where somebody goes to ask, and "Referral" on its own does
      // not answer it.
      referrerLabel(inquiry, { customers, agents, users }) === null
        ? null
        : `Referred by ${referrerLabel(inquiry, { customers, agents, users })}`,
      inquiry.subAgentId === null ? null : 'Linked to the sub-agent who captured it',
    ]
      .filter((part): part is string => part !== null)
      .join(' · '),
  })

  holds.forEach((hold, index) => {
    const first = index === 0
    const open = hold.releasedAt === undefined || hold.releasedAt === null
    const holder = nameOf(users, hold.assigneeId)
    const previous = index === 0 ? null : nameOf(users, holds[index - 1].assigneeId)

    entries.push({
      id: `hold-${index}`,
      kind: first ? 'assigned' : 'reassigned',
      title: first ? 'Assigned by routing' : 'Auto-reassigned to the next person in the category',
      at: hold.assignedAt,
      until: hold.releasedAt ?? null,
      actorName: holder,
      detail: [
        hold.reason,
        previous === null ? `${holder} notified.` : `${previous} and ${holder} notified.`,
      ]
        .filter((part): part is string => part !== undefined && part !== '')
        .join(' '),
      ...(open && isClockRunning(inquiry) && tatMinutes !== null ? { tatMinutes } : {}),
    })
  })

  const seen = new Set<string>()
  for (const event of events) {
    if (HOLD_EVENTS.includes(event.name)) continue
    const mapped = EVENT_KIND[event.name]
    if (!mapped) continue
    seen.add(mapped.kind)
    entries.push({
      id: `event-${entries.length}-${event.name}`,
      kind: mapped.kind,
      title: mapped.title,
      at: event.at,
      until: event.at,
      ...(mapped.kind === 'escalated'
        ? {
            carries: carriedHistory(inquiry, users),
            detail: `Escalated to ${nameOf(users, inquiry.ownerId)} with the full assignment history — ${holds.length} ${holds.length === 1 ? 'holder' : 'holders'}.`,
          }
        : {}),
    })
  }

  // A state the record already carried when this screen opened still gets a line.
  const settled = EVENT_KIND[`inquiry.${inquiry.status}`]
  if (settled && !seen.has(settled.kind)) {
    const last = holds[holds.length - 1]
    entries.push({
      id: `state-${inquiry.status}`,
      kind: settled.kind,
      title: settled.title,
      at: last?.releasedAt ?? last?.assignedAt ?? inquiry.createdAt,
      until: last?.releasedAt ?? last?.assignedAt ?? inquiry.createdAt,
      ...(settled.kind === 'escalated'
        ? {
            carries: carriedHistory(inquiry, users),
            detail: `Escalated to ${nameOf(users, inquiry.ownerId)} with the full assignment history — ${holds.length} ${holds.length === 1 ? 'holder' : 'holders'}.`,
          }
        : {}),
      ...(settled.kind === 'unrouted'
        ? { detail: 'Routing could not resolve a category. The admin alert was raised with it.' }
        : {}),
    })
  }

  // Contacts join the same list rather than living in a panel of their own. A
  // handover and a phone call are both things that happened to this inquiry, and
  // reading them apart is how somebody concludes a lead was being worked when in
  // fact it changed hands three times and nobody rang.
  const merged = [...entries, ...activityEntries(activities, dispositions, users)]
  return merged.sort((a, b) => a.at.localeCompare(b.at))
}
