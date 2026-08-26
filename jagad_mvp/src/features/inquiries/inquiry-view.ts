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
import type { CustomerSource, Inquiry, StaffUser } from '../../data/repo'
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

/** §5: "unassigned and TAT-at-risk pinned". Lower rank sorts first. */
export function pinRank(inquiry: Inquiry, now: Date, tatMinutes: number | null): number {
  const tat = readTat(inquiry, now, tatMinutes)
  if (inquiry.status === 'escalated') return 0
  if (tat.breached) return 1
  if (isUnassigned(inquiry) && inquiry.status !== 'converted' && inquiry.status !== 'lost') return 2
  if (tat.atRisk) return 3
  return 4
}

export function isPinned(inquiry: Inquiry, now: Date, tatMinutes: number | null): boolean {
  return pinRank(inquiry, now, tatMinutes) < 4
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
export function buildTrail({ inquiry, users, tatMinutes, events }: TrailInput): readonly TrailEntry[] {
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

  return entries
}
