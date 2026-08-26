/**
 * The opening turn — FR-22.1, plan §3 (D-G).
 *
 * "Landing view per role: opens with a generated briefing of that user's own
 * queue from live counts — never a blank prompt." The plan's worked example is
 * the sales manager's:
 *
 *   "18 open inquiries across the team. Four are still unassigned and two are
 *    close to their TAT — if those lapse they reassign on their own and the
 *    customer waits longer."
 *
 * Three properties make that sentence honest rather than decorative, and each is
 * enforced by the shape of this module rather than by care:
 *
 *   1. Every number in a briefing is a `count` carried on the clause that prints
 *      it, and every clause's `lead` begins with that count. `briefing.test.ts`
 *      asserts exactly that across every role, so a hand-written figure cannot
 *      survive review.
 *
 *   2. A clause whose count is zero is dropped, never printed as "0" and never
 *      softened into "a few". A role whose whole queue is clear gets the empty
 *      briefing below, which says so — it is still not a greeting.
 *
 *   3. No clause performs arithmetic on money, and none may. The briefing counts
 *      records; it never totals, averages or estimates an amount (FR-22.5).
 */

import type { Block, BlockRow } from '../blocks/blocks'
import { THRESHOLDS, tatAllowanceMs } from '../queue-rules'
import type { QueueSnapshot } from './snapshot'

/** One counted fact. `lead` always starts with `count`; the test enforces it. */
export type BriefingClause = {
  readonly key: string
  readonly count: number
  /** The counted phrase, emphasised on screen: "18 open inquiries". */
  readonly lead: string
  /** What follows it in the same sentence, including the full stop. */
  readonly rest: string
}

export const ROW_SOURCES = {
  tatAtRisk: 'tatAtRisk',
  tatLapsed: 'tatLapsed',
  unassigned: 'unassigned',
  agedClaims: 'agedClaims',
  insurerQueries: 'insurerQueries',
  overdueTasks: 'overdueTasks',
  mandateFailures: 'mandateFailures',
  renewalsDueThisWeek: 'renewalsDueThisWeek',
  quotationsAwaitingReply: 'quotationsAwaitingReply',
} as const

export type RowSource = (typeof ROW_SOURCES)[keyof typeof ROW_SOURCES]

export type BriefingTemplate = {
  readonly key: string
  /** What this role's queue is called, for the empty briefing. */
  readonly queueName: string
  readonly clauses: (snapshot: QueueSnapshot) => readonly BriefingClause[]
  /** Tried in order; the first source with rows supplies the list under the text. */
  readonly rowSources: readonly RowSource[]
}

/** How many records the opening turn names. Beyond this it is a queue, not a briefing. */
const MAX_ROWS = 4

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`
}

function clause(key: string, value: number, lead: string, rest: string): BriefingClause {
  return { key, count: value, lead, rest }
}

/* -------------------------------------------------------------- templates */

const SALES_MANAGER: BriefingTemplate = {
  key: 'salesManager',
  queueName: 'the team pipeline',
  rowSources: [ROW_SOURCES.tatLapsed, ROW_SOURCES.tatAtRisk, ROW_SOURCES.unassigned],
  clauses: (s) => [
    clause(
      'open',
      s.inquiriesOpen.length,
      count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
      ' across the team.',
    ),
    clause(
      'unassigned',
      s.inquiriesUnassigned.length,
      `${s.inquiriesUnassigned.length} still unassigned`,
      '.',
    ),
    clause(
      'tat',
      s.inquiriesTatAtRisk.length,
      `${s.inquiriesTatAtRisk.length} close to ${s.inquiriesTatAtRisk.length === 1 ? 'its' : 'their'} TAT`,
      ' — if those lapse they reassign on their own and the customer waits longer.',
    ),
    clause(
      'lapsed',
      s.inquiriesTatLapsed.length,
      `${s.inquiriesTatLapsed.length} past ${s.inquiriesTatLapsed.length === 1 ? 'its' : 'their'} turnaround`,
      ' already.',
    ),
    clause(
      'quotes',
      s.quotationsAwaitingReply.length,
      count(s.quotationsAwaitingReply.length, 'quotation', 'quotations'),
      ' shared and still unanswered.',
    ),
  ],
}

const ADMIN: BriefingTemplate = {
  key: 'admin',
  queueName: 'the business',
  rowSources: [
    ROW_SOURCES.agedClaims,
    ROW_SOURCES.tatLapsed,
    ROW_SOURCES.tatAtRisk,
    ROW_SOURCES.unassigned,
  ],
  clauses: (s) => [
    clause(
      'open',
      s.inquiriesOpen.length,
      count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
      ' across the business.',
    ),
    clause(
      'unassigned',
      s.inquiriesUnassigned.length,
      `${s.inquiriesUnassigned.length} of them unassigned`,
      '.',
    ),
    clause(
      'claims',
      s.claimsOpen.length,
      count(s.claimsOpen.length, 'claim', 'claims'),
      ' still open.',
    ),
    clause(
      'aged',
      s.claimsAged.length,
      `${s.claimsAged.length} past thirty days`,
      ' and still with the insurer or with us.',
    ),
    clause(
      'renewals',
      s.renewalsDueThisWeek.length,
      count(s.renewalsDueThisWeek.length, 'renewal', 'renewals'),
      ' due this week.',
    ),
  ],
}

const AGENT: BriefingTemplate = {
  key: 'agent',
  queueName: 'your book',
  rowSources: [
    ROW_SOURCES.tatLapsed,
    ROW_SOURCES.tatAtRisk,
    ROW_SOURCES.quotationsAwaitingReply,
    ROW_SOURCES.overdueTasks,
  ],
  clauses: (s) => [
    clause(
      'open',
      s.inquiriesOpen.length,
      count(s.inquiriesOpen.length, 'open lead', 'open leads'),
      ' in your book.',
    ),
    clause(
      'quotes',
      s.quotationsAwaitingReply.length,
      count(s.quotationsAwaitingReply.length, 'quotation', 'quotations'),
      ' shared and still unanswered.',
    ),
    clause(
      'drafts',
      s.quotationsDraft.length,
      count(s.quotationsDraft.length, 'draft', 'drafts'),
      ' you have not sent yet.',
    ),
    clause(
      'due',
      s.tasksDueThisWeek.length,
      count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      ' due this week.',
    ),
    clause('overdue', s.tasksOverdue.length, `${s.tasksOverdue.length} already past due`, '.'),
  ],
}

const BACK_OFFICE: BriefingTemplate = {
  key: 'backOffice',
  queueName: 'the work queue',
  rowSources: [ROW_SOURCES.mandateFailures, ROW_SOURCES.overdueTasks],
  clauses: (s) => [
    clause(
      'open',
      s.tasksOpen.length,
      count(s.tasksOpen.length, 'open item', 'open items'),
      ' in your queue.',
    ),
    clause('overdue', s.tasksOverdue.length, `${s.tasksOverdue.length} past due`, '.'),
    clause(
      'entry',
      s.tasksPolicyEntry.length,
      count(s.tasksPolicyEntry.length, 'policy entry', 'policy entries'),
      ' waiting to be completed.',
    ),
    clause(
      'mandates',
      s.tasksMandateFailure.length,
      count(s.tasksMandateFailure.length, 'failed mandate', 'failed mandates'),
      ' waiting on a call.',
    ),
  ],
}

const CLAIMS: BriefingTemplate = {
  key: 'claims',
  queueName: 'the claim queue',
  rowSources: [ROW_SOURCES.agedClaims, ROW_SOURCES.insurerQueries, ROW_SOURCES.overdueTasks],
  clauses: (s) => [
    clause('open', s.claimsOpen.length, count(s.claimsOpen.length, 'open claim', 'open claims'), '.'),
    clause(
      'query',
      s.claimsInsurerQuery.length,
      `${s.claimsInsurerQuery.length} waiting on an insurer query`,
      '.',
    ),
    clause(
      'aged',
      s.claimsAged.length,
      `${s.claimsAged.length} past thirty days`,
      ' — the insurer decides, but the chasing is ours.',
    ),
    clause(
      'due',
      s.tasksDueThisWeek.length,
      count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      ' due this week.',
    ),
  ],
}

const RENEWALS: BriefingTemplate = {
  key: 'renewals',
  queueName: 'the renewal pool',
  rowSources: [
    ROW_SOURCES.renewalsDueThisWeek,
    ROW_SOURCES.mandateFailures,
    ROW_SOURCES.overdueTasks,
  ],
  clauses: (s) => [
    clause(
      'due',
      s.renewalsDueThisWeek.length,
      count(s.renewalsDueThisWeek.length, 'renewal', 'renewals'),
      ' due this week.',
    ),
    clause('lapsed', s.renewalsLapsed.length, `${s.renewalsLapsed.length} already lapsed`, '.'),
    clause(
      'mandates',
      s.tasksMandateFailure.length,
      count(s.tasksMandateFailure.length, 'failed mandate', 'failed mandates'),
      ' waiting on a call.',
    ),
    clause(
      'tasks',
      s.tasksDueThisWeek.length,
      count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      ' due this week.',
    ),
  ],
}

/**
 * For an account whose template this file has not heard of. It counts the three
 * queues every template can hold rather than guessing at a role, because a
 * briefing that invents a queue is worse than one that is short.
 */
const GENERIC: BriefingTemplate = {
  key: 'generic',
  queueName: 'your queue',
  rowSources: [ROW_SOURCES.tatAtRisk, ROW_SOURCES.overdueTasks, ROW_SOURCES.agedClaims],
  clauses: (s) => [
    clause(
      'inquiries',
      s.inquiriesOpen.length,
      count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
      ' you can see.',
    ),
    clause(
      'tasks',
      s.tasksOpen.length,
      count(s.tasksOpen.length, 'open task', 'open tasks'),
      ' assigned to you.',
    ),
    clause('claims', s.claimsOpen.length, count(s.claimsOpen.length, 'open claim', 'open claims'), '.'),
  ],
}

export const BRIEFING_TEMPLATES: Readonly<Record<string, BriefingTemplate>> = {
  admin: ADMIN,
  salesManager: SALES_MANAGER,
  agent: AGENT,
  backOffice: BACK_OFFICE,
  claims: CLAIMS,
  renewals: RENEWALS,
}

export function briefingTemplateFor(templateKey: string): BriefingTemplate {
  return BRIEFING_TEMPLATES[templateKey] ?? GENERIC
}

/* ------------------------------------------------------------------- rows */

function rowsFor(source: RowSource, snapshot: QueueSnapshot): readonly BlockRow[] {
  if (source === ROW_SOURCES.tatAtRisk || source === ROW_SOURCES.tatLapsed) {
    const rows =
      source === ROW_SOURCES.tatAtRisk ? snapshot.inquiriesTatAtRisk : snapshot.inquiriesTatLapsed
    return rows.map((row) => ({
      id: row.id,
      severity: source === ROW_SOURCES.tatLapsed ? ('hot' as const) : ('warm' as const),
      primary: `${row.systemNo} · ${row.contactName}`,
      secondary: row.ownerId === null ? 'no owner yet' : 'assigned, not yet closed',
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
  }

  if (source === ROW_SOURCES.unassigned) {
    return snapshot.inquiriesUnassigned.map((row) => ({
      id: row.id,
      severity: 'attn' as const,
      primary: `${row.systemNo} · ${row.contactName}`,
      secondary: 'waiting for an owner',
      to: `/inquiries?record=${row.id}`,
      right: { cell: 'clock' as const, mode: 'aging' as const, start: row.createdAt },
    }))
  }

  if (source === ROW_SOURCES.agedClaims) {
    return snapshot.claimsAged.map((row) => ({
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
  }

  if (source === ROW_SOURCES.insurerQueries) {
    return snapshot.claimsInsurerQuery.map((row) => ({
      id: row.id,
      severity: 'attn' as const,
      primary: row.systemNo,
      secondary: 'insurer query open',
      to: `/claims?record=${row.id}`,
      right: { cell: 'clock' as const, mode: 'aging' as const, start: row.raisedAt },
    }))
  }

  if (source === ROW_SOURCES.mandateFailures) {
    return snapshot.tasksMandateFailure.map((row) => ({
      id: row.id,
      severity: 'hot' as const,
      primary: row.title,
      secondary: `${row.systemNo} · mandate failure`,
      to: `/tasks?record=${row.id}`,
      right: { cell: 'date' as const, value: row.dueAt, mode: 'short' as const },
    }))
  }

  if (source === ROW_SOURCES.overdueTasks) {
    return snapshot.tasksOverdue.map((row) => ({
      id: row.id,
      severity: 'hot' as const,
      primary: row.title,
      secondary: `${row.systemNo} · ${row.kind.replace(/_/g, ' ')}`,
      to: `/tasks?record=${row.id}`,
      right: { cell: 'date' as const, value: row.dueAt, mode: 'short' as const },
    }))
  }

  if (source === ROW_SOURCES.renewalsDueThisWeek) {
    return snapshot.renewalsDueThisWeek.map((row) => ({
      id: row.id,
      severity: 'warm' as const,
      primary: row.policyId,
      secondary: `renewal ${row.state.replace(/_/g, ' ')}`,
      to: `/renewals?record=${row.id}`,
      right: { cell: 'date' as const, value: row.dueOn, mode: 'short' as const },
    }))
  }

  return snapshot.quotationsAwaitingReply.map((row) => ({
    id: row.id,
    severity: 'warm' as const,
    primary: row.systemNo,
    secondary: 'shared, no reply yet',
    to: `/quotations?record=${row.id}`,
    ...(row.sharedAt === null
      ? {}
      : { right: { cell: 'clock' as const, mode: 'aging' as const, start: row.sharedAt } }),
  }))
}

function attentionRows(template: BriefingTemplate, snapshot: QueueSnapshot): readonly BlockRow[] {
  for (const source of template.rowSources) {
    const rows = rowsFor(source, snapshot)
    if (rows.length > 0) return rows.slice(0, MAX_ROWS)
  }
  return []
}

/* --------------------------------------------------------------- assembly */

/**
 * The whole briefing, as blocks. Never empty, and never a greeting: a clear
 * queue is itself a fact worth stating, and it is stated as one.
 */
export function briefingFor(templateKey: string, snapshot: QueueSnapshot): readonly Block[] {
  const template = briefingTemplateFor(templateKey)

  if (!snapshot.enabled) {
    return [
      {
        kind: 'para',
        text: 'This account does not hold the Assistant, so there is nothing for it to read on your behalf.',
      },
      {
        kind: 'note',
        text: 'The Assistant runs as the person asking and never above them. An account without the grant gets no answers rather than a narrower set of them.',
      },
    ]
  }

  const clauses = template.clauses(snapshot).filter((entry) => entry.count > 0)

  if (clauses.length === 0) {
    return [
      {
        kind: 'para',
        text: `Nothing in ${template.queueName} is waiting on you right now.`,
      },
      {
        kind: 'note',
        text: 'Counted from your own records a moment ago, not from a cache. The suggestions below re-run the same counts whenever you want them.',
      },
    ]
  }

  const blocks: Block[] = [
    {
      kind: 'para',
      text: clauses.map((entry) => `${entry.lead}${entry.rest}`).join(' '),
      emphasis: clauses.map((entry) => entry.lead),
    },
  ]

  const rows = attentionRows(template, snapshot)
  if (rows.length > 0) blocks.push({ kind: 'rows', rows })

  return blocks
}

/** Exported for the truthfulness test, which walks every template. */
export function briefingClauses(
  templateKey: string,
  snapshot: QueueSnapshot,
): readonly BriefingClause[] {
  return briefingTemplateFor(templateKey).clauses(snapshot)
}

/** The counts a clause could have come from, for the same test. */
export function snapshotCounts(snapshot: QueueSnapshot): Readonly<Record<string, number>> {
  return {
    inquiriesOpen: snapshot.inquiriesOpen.length,
    inquiriesUnassigned: snapshot.inquiriesUnassigned.length,
    inquiriesTatAtRisk: snapshot.inquiriesTatAtRisk.length,
    inquiriesTatLapsed: snapshot.inquiriesTatLapsed.length,
    quotationsAwaitingReply: snapshot.quotationsAwaitingReply.length,
    quotationsDraft: snapshot.quotationsDraft.length,
    tasksOpen: snapshot.tasksOpen.length,
    tasksOverdue: snapshot.tasksOverdue.length,
    tasksDueThisWeek: snapshot.tasksDueThisWeek.length,
    tasksMandateFailure: snapshot.tasksMandateFailure.length,
    tasksPolicyEntry: snapshot.tasksPolicyEntry.length,
    claimsOpen: snapshot.claimsOpen.length,
    claimsAged: snapshot.claimsAged.length,
    claimsInsurerQuery: snapshot.claimsInsurerQuery.length,
    renewalsDueThisWeek: snapshot.renewalsDueThisWeek.length,
    renewalsLapsed: snapshot.renewalsLapsed.length,
  }
}
