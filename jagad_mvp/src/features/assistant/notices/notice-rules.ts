/**
 * Proactive notices, v0 — FR-22.8.
 *
 * "Threshold-triggered, per role, each carrying the reason it was raised
 * ('raised because both passed the aging threshold overnight, not because anyone
 * asked'). Deduplicated, dismissible, logged."
 *
 * The reason line is the requirement, not decoration. A system that interrupts
 * someone owes them an account of why, and the acceptance criterion — "every
 * proactive notice states why it fired" — is only testable if the reason is
 * generated from the same rule that fired, rather than typed alongside it. So a
 * rule declares its threshold, its measurement and how to say both in a
 * sentence, and `reasonFor` builds the line from the count it actually matched.
 * There is no field a caller could leave blank.
 *
 * Three rules in v0, exactly the ones the playbook names: a turnaround inside
 * three hours, an open claim past thirty days, a failed mandate whose follow-up
 * is still open. Each is a threshold over data the projection already carries.
 *
 * Grouping and dedupe: one notice per rule, carrying every subject that matched,
 * with an id derived from the rule and the sorted subject ids. The same facts
 * therefore produce the same notice on every render — which is what makes a
 * dismissal stick — and a genuinely new subject produces a genuinely new notice
 * rather than silently joining a dismissed one.
 */

import type { Block, BlockRow } from '../blocks/blocks'
import type { Severity } from '../../../ui/signal'
import { THRESHOLDS, THRESHOLD_WORDS, tatAllowanceMs } from '../queue-rules'
import type { QueueSnapshot } from '../briefing/snapshot'

export const NOTICE_RULES = {
  tatWindow: 'tat-window',
  claimAging: 'claim-aging',
  mandateFailed: 'mandate-failed',
} as const

export type NoticeRuleId = (typeof NOTICE_RULES)[keyof typeof NOTICE_RULES]

export type Notice = {
  /** Stable across renders for the same facts. Dedupe and dismissal key off it. */
  readonly id: string
  readonly rule: NoticeRuleId
  readonly severity: Severity
  readonly headline: string
  /** Why it fired. Never empty — `reasonFor` always produces one. */
  readonly reason: string
  /** How many records matched, for the rail's chip. */
  readonly count: number
  /** Where the work is. */
  readonly to: string
  /** The moment the rule was evaluated. */
  readonly raisedAt: string
  /** The feed rendering: the sentence, the records, and the reason as a note. */
  readonly blocks: readonly Block[]
}

/**
 * "it", "both", "all four" — the subject of the reason sentence, with the verb
 * that agrees with it. Written out because "1 records passed" is the kind of
 * sentence that makes a person stop believing the rest of the screen.
 */
function subjectPhrase(count: number): { subject: string; plural: boolean } {
  if (count === 1) return { subject: 'it', plural: false }
  if (count === 2) return { subject: 'both', plural: true }
  return { subject: `all ${count}`, plural: true }
}

/**
 * The reason line, built from the rule and the count that matched.
 *
 * `verb` is given in both numbers because English does not let the caller off:
 * "it falls" and "both fall" are the same fact.
 */
export function reasonFor(
  count: number,
  verbSingular: string,
  verbPlural: string,
  threshold: string,
): string {
  const { subject, plural } = subjectPhrase(count)
  return `Raised because ${subject} ${plural ? verbPlural : verbSingular} ${threshold}, not because anyone asked.`
}

function noticeId(rule: NoticeRuleId, subjectIds: readonly string[]): string {
  return `${rule}:${[...subjectIds].sort().join(',')}`
}

/* ------------------------------------------------------------- the rules */

function tatNotice(snapshot: QueueSnapshot): Notice | null {
  const rows = snapshot.inquiriesTatAtRisk
  if (rows.length === 0) return null

  const reason = reasonFor(
    rows.length,
    'falls inside',
    'fall inside',
    THRESHOLD_WORDS.tatRiskMs,
  )
  const headline =
    rows.length === 1
      ? `${rows[0].systemNo} breaches its turnaround in under three hours.`
      : `${rows.length} inquiries breach their turnaround in under three hours.`

  const blockRows: readonly BlockRow[] = rows.map((row) => ({
    id: row.id,
    severity: 'warm' as const,
    primary: `${row.systemNo} · ${row.contactName}`,
    secondary:
      row.ownerId === null
        ? 'no owner yet, so nobody is working it'
        : 'assigned, and a lapse reassigns it on its own',
    to: `/inquiries?record=${row.id}`,
    ...(row.assignedAt === null
      ? {}
      : {
          right: {
            cell: 'clock' as const,
            mode: 'tat' as const,
            start: row.assignedAt,
            durationMs: tatAllowanceMs(row) ?? 0,
          },
        }),
  }))

  return {
    id: noticeId(NOTICE_RULES.tatWindow, rows.map((row) => row.id)),
    rule: NOTICE_RULES.tatWindow,
    severity: 'attn',
    headline,
    reason,
    count: rows.length,
    to: '/inquiries',
    raisedAt: snapshot.now,
    blocks: [
      {
        kind: 'para',
        text: `${headline} If a turnaround lapses the inquiry reassigns itself and the customer waits longer.`,
        emphasis: [headline],
      },
      { kind: 'rows', rows: blockRows },
      { kind: 'note', text: reason },
    ],
  }
}

function claimAgingNotice(snapshot: QueueSnapshot): Notice | null {
  const rows = snapshot.claimsAged
  if (rows.length === 0) return null

  const reason = reasonFor(rows.length, 'passed', 'passed', THRESHOLD_WORDS.claimAgingMs)
  const headline =
    rows.length === 1
      ? `${rows[0].systemNo} has been open longer than thirty days.`
      : `${rows.length} open claims have been running longer than thirty days.`

  const blockRows: readonly BlockRow[] = rows.map((row) => ({
    id: row.id,
    severity: 'hot' as const,
    primary: row.systemNo,
    secondary: `${row.claimType} claim · ${row.state.replace(/_/g, ' ')}`,
    to: `/claims?record=${row.id}`,
    right: {
      cell: 'clock' as const,
      mode: 'aging' as const,
      start: row.raisedAt,
      durationMs: THRESHOLDS.claimAgingMs,
    },
  }))

  return {
    id: noticeId(NOTICE_RULES.claimAging, rows.map((row) => row.id)),
    rule: NOTICE_RULES.claimAging,
    severity: 'attn',
    headline,
    reason,
    count: rows.length,
    to: '/claims',
    raisedAt: snapshot.now,
    blocks: [
      {
        kind: 'para',
        // The reduced claim view §14.1 leaves in scope: state and dates, never
        // the insurer's remark and never a document. No outcome is predicted.
        text: `${headline} The insurer decides the outcome; the chasing is ours.`,
        emphasis: [headline],
      },
      { kind: 'rows', rows: blockRows },
      { kind: 'note', text: reason },
    ],
  }
}

function mandateNotice(snapshot: QueueSnapshot): Notice | null {
  const rows = snapshot.tasksMandateFailure
  if (rows.length === 0) return null

  const reason = reasonFor(
    rows.length,
    'was reported failed by the bank',
    'were reported failed by the bank',
    'and the follow-up task is still open',
  )
  const headline =
    rows.length === 1
      ? 'A bank mandate failed and the follow-up is still open.'
      : `${rows.length} bank mandates failed and their follow-ups are still open.`

  const blockRows: readonly BlockRow[] = rows.map((row) => ({
    id: row.id,
    severity: 'hot' as const,
    primary: row.title,
    secondary: `${row.systemNo} · raised by the mandate recipe`,
    to: `/tasks?record=${row.id}`,
    right: { cell: 'date' as const, value: row.dueAt, mode: 'short' as const },
  }))

  return {
    id: noticeId(NOTICE_RULES.mandateFailed, rows.map((row) => row.id)),
    rule: NOTICE_RULES.mandateFailed,
    severity: 'attn',
    headline,
    reason,
    count: rows.length,
    to: '/tasks',
    raisedAt: snapshot.now,
    blocks: [
      {
        kind: 'para',
        // Record-only: the platform never presents a debit and never proposes an
        // amount to re-present (D3, FR-22.5).
        text: `${headline} The platform records what the bank reported; it never re-presents a debit.`,
        emphasis: [headline],
      },
      { kind: 'rows', rows: blockRows },
      { kind: 'note', text: reason },
    ],
  }
}

const RULES: readonly ((snapshot: QueueSnapshot) => Notice | null)[] = [
  tatNotice,
  claimAgingNotice,
  mandateNotice,
]

/**
 * Every notice the thresholds raise for this snapshot, deduplicated by id.
 *
 * There is no role parameter and there must not be one: a notice is raised over
 * what the person can already see, and the snapshot was built by the facade as
 * them. Filtering by role on top of that would be a second scope rule to keep in
 * step with `can()`, and the wrong one would win.
 */
export function evaluateNotices(snapshot: QueueSnapshot): readonly Notice[] {
  if (!snapshot.enabled) return []

  const seen = new Set<string>()
  const notices: Notice[] = []

  for (const rule of RULES) {
    const notice = rule(snapshot)
    if (!notice || seen.has(notice.id)) continue
    seen.add(notice.id)
    notices.push(notice)
  }

  return notices
}
