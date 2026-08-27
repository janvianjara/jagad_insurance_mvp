/**
 * The opening turn — FR-22.1, plan §3 (D-G), voiced against the prototype.
 *
 * `documents/jagad-ai-prototype (8).html` is the behavioural specification, and
 * its `ROLES[*].open` strings are the target register. Read together they do
 * three things our first pass did not:
 *
 *   A FRAME before the counts, so a number arrives with a context — "Month to
 *   date:", "Your queue:", "across the team".
 *
 *   A SECOND, INTERPRETIVE SENTENCE naming only what wants a person, and saying
 *   what follows if nobody comes — "if those lapse they reassign on their own
 *   and the customer waits longer".
 *
 *   A RECORD NAMED IN THE PROSE — "CLM-0398 has now crossed 30 days" — rather
 *   than only in the list underneath.
 *
 * The prototype's figures are demo copy. Ours are live, and the properties that
 * make them trustworthy are enforced by the shape of this module rather than by
 * care. All four survived the rewrite:
 *
 *   1. Every number in a briefing is a `count` carried on the clause that prints
 *      it, and every clause's `lead` begins with that count. `briefing.test.ts`
 *      asserts exactly that across every role and every band.
 *
 *   2. A clause whose count is zero is dropped, never printed as "0" and never
 *      softened into "a few". A role whose whole queue is clear gets the empty
 *      briefing below, which says so — it is still not a greeting.
 *
 *   3. The interpretive material is DIGIT-FREE. A `rest` and a `consequence` may
 *      say "past thirty days"; they may not print a figure. So every digit in a
 *      briefing paragraph came either from a clause's own count or from a record
 *      number read off a snapshot row, and the test proves it by stripping the
 *      named records and matching what is left against the snapshot's counts.
 *      A consequence a role's data cannot support is simply absent.
 *
 *   4. No clause performs arithmetic on money, and none may. The briefing counts
 *      records; it never totals, averages or estimates an amount (FR-22.5). The
 *      prototype's admin line quotes premium and commission booked — recorded
 *      ledger figures, which the Assistant may repeat — but the snapshot holds
 *      no such totals, so ours counts records instead of inventing them.
 */

import type { Block, BlockRow } from '../blocks/blocks'
import { THRESHOLDS, tatAllowanceMs } from '../queue-rules'
import type { QueueSnapshot } from './snapshot'

/**
 * Which sentence a clause belongs to.
 *
 * The prototype's briefings are two sentences and the split is not stylistic:
 * the first says how big the job is, the second says which part of it is on
 * fire. Making the band part of the clause means the split is decided beside the
 * count rather than by the assembler guessing.
 */
export const CLAUSE_BANDS = {
  /** The size of the queue. First sentence, behind the frame. */
  headline: 'headline',
  /** The part that wants a person now. Second sentence. */
  attention: 'attention',
} as const

export type ClauseBand = (typeof CLAUSE_BANDS)[keyof typeof CLAUSE_BANDS]

/** One counted fact. `lead` always starts with `count`; the test enforces it. */
export type BriefingClause = {
  readonly key: string
  readonly count: number
  /** The counted phrase, emphasised on screen: "18 open inquiries". */
  readonly lead: string
  /**
   * What follows it inside the same clause — no terminal punctuation, because
   * the assembler joins clauses into one sentence and closes it once. Digit-free
   * by rule; the only figure in a clause is the one in its `lead`.
   */
  readonly rest: string
  readonly band: ClauseBand
  /**
   * What follows if nobody comes, appended once to the end of the attention
   * sentence. Digit-free, derived from the same rows as the count, and omitted
   * entirely when the data cannot support one.
   */
  readonly consequence?: string
  /**
   * Record numbers this clause names in its own `rest`, read off the snapshot
   * rows the count was taken from. Emphasised on screen, and the one licensed
   * source of digits in a briefing other than a count.
   */
  readonly names?: readonly string[]
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
  /**
   * The prototype's lead-in, verbatim in register: "Month to date:", "Your
   * queue:". Empty for the roles whose first clause carries its own context.
   * Never contains a number — a frame is orientation, not a fact.
   */
  readonly frame: string
  readonly clauses: (snapshot: QueueSnapshot) => readonly BriefingClause[]
  /** Tried in order; the first source with rows supplies the list under the text. */
  readonly rowSources: readonly RowSource[]
}

/** How many records the opening turn names. Beyond this it is a queue, not a briefing. */
const MAX_ROWS = 4

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`
}

type ClauseInput = {
  readonly key: string
  readonly count: number
  readonly lead: string
  readonly rest?: string
  readonly band: ClauseBand
  readonly consequence?: string
  readonly names?: readonly string[]
}

function clause(input: ClauseInput): BriefingClause {
  return {
    key: input.key,
    count: input.count,
    lead: input.lead,
    rest: input.rest ?? '',
    band: input.band,
    ...(input.consequence === undefined ? {} : { consequence: input.consequence }),
    ...(input.names === undefined ? {} : { names: input.names }),
  }
}

/* ------------------------------------------------------ naming one record */

/**
 * The record a clause names, and the phrase that introduces it.
 *
 * The prototype writes "CLM-0398 has now crossed 30 days without movement". The
 * honest version of that sentence has to know WHICH record it means, so every
 * caller picks the extreme of the set it just counted — the oldest claim, the
 * longest-overdue task — rather than whichever row the store returned first.
 * With a single row the superlative would be a lie, so it is dropped.
 */
type Named = { readonly no: string; readonly tail: string }

function named(no: string | undefined, total: number, superlative: string): Named | null {
  if (!no) return null
  return { no, tail: total === 1 ? `, ${no}` : `, ${no} ${superlative}` }
}

/** The earliest of a set by one of its recorded timestamps. Pure, and stable. */
function earliestBy<T>(rows: readonly T[], at: (row: T) => string | null | undefined): T | null {
  let best: T | null = null
  let bestAt = Number.MAX_SAFE_INTEGER

  for (const row of rows) {
    const value = at(row)
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isNaN(time) || time >= bestAt) continue
    best = row
    bestAt = time
  }

  return best ?? (rows.length > 0 ? rows[0] : null)
}

/* -------------------------------------------------------------- templates */

function plural(value: number, one: string, many: string): string {
  return value === 1 ? one : many
}

function withName(base: ClauseInput, name: Named | null): BriefingClause {
  if (name === null) return clause(base)
  return clause({ ...base, rest: `${base.rest ?? ''}${name.tail}`, names: [name.no] })
}

const SALES_MANAGER: BriefingTemplate = {
  key: 'salesManager',
  queueName: 'the team pipeline',
  frame: '',
  rowSources: [ROW_SOURCES.tatLapsed, ROW_SOURCES.tatAtRisk, ROW_SOURCES.unassigned],
  clauses: (s) => [
    clause({
      key: 'open',
      band: CLAUSE_BANDS.headline,
      count: s.inquiriesOpen.length,
      lead: count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
      rest: ' across the team',
    }),
    clause({
      key: 'quotes',
      band: CLAUSE_BANDS.headline,
      count: s.quotationsAwaitingReply.length,
      lead: count(s.quotationsAwaitingReply.length, 'quotation', 'quotations'),
      rest: ' shared and still unanswered',
    }),
    clause({
      key: 'unassigned',
      band: CLAUSE_BANDS.attention,
      count: s.inquiriesUnassigned.length,
      lead: `${s.inquiriesUnassigned.length} still unassigned`,
      consequence: 'an inquiry with no owner is nobody’s to lose',
    }),
    clause({
      key: 'tat',
      band: CLAUSE_BANDS.attention,
      count: s.inquiriesTatAtRisk.length,
      lead: `${s.inquiriesTatAtRisk.length} close to ${plural(s.inquiriesTatAtRisk.length, 'its', 'their')} TAT`,
      consequence: 'if those lapse they reassign on their own and the customer waits longer',
    }),
    withName(
      {
        key: 'lapsed',
        band: CLAUSE_BANDS.attention,
        count: s.inquiriesTatLapsed.length,
        lead: `${s.inquiriesTatLapsed.length} already past ${plural(s.inquiriesTatLapsed.length, 'its', 'their')} turnaround`,
        consequence:
          'each of those reassigned itself when the clock ran out, so the customer has already waited',
      },
      named(
        earliestBy(s.inquiriesTatLapsed, (row) => row.tatDueAt)?.systemNo,
        s.inquiriesTatLapsed.length,
        'the furthest past it',
      ),
    ),
  ],
}

const ADMIN: BriefingTemplate = {
  key: 'admin',
  queueName: 'the business',
  frame: 'Across the business:',
  rowSources: [
    ROW_SOURCES.agedClaims,
    ROW_SOURCES.tatLapsed,
    ROW_SOURCES.tatAtRisk,
    ROW_SOURCES.unassigned,
  ],
  clauses: (s) => [
    clause({
      key: 'open',
      band: CLAUSE_BANDS.headline,
      count: s.inquiriesOpen.length,
      lead: count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
    }),
    clause({
      key: 'claims',
      band: CLAUSE_BANDS.headline,
      count: s.claimsOpen.length,
      lead: count(s.claimsOpen.length, 'claim', 'claims'),
      rest: ' still open',
    }),
    clause({
      key: 'renewals',
      band: CLAUSE_BANDS.headline,
      count: s.renewalsDueThisWeek.length,
      lead: count(s.renewalsDueThisWeek.length, 'renewal', 'renewals'),
      rest: ' due this week',
    }),
    clause({
      key: 'unassigned',
      band: CLAUSE_BANDS.attention,
      count: s.inquiriesUnassigned.length,
      lead: `${s.inquiriesUnassigned.length} with no owner yet`,
    }),
    clause({
      key: 'lapsed',
      band: CLAUSE_BANDS.attention,
      count: s.inquiriesTatLapsed.length,
      lead: `${s.inquiriesTatLapsed.length} past ${plural(s.inquiriesTatLapsed.length, 'its', 'their')} turnaround`,
      consequence:
        'a turnaround that lapses reassigns the inquiry on its own, and the customer waits longer',
    }),
    withName(
      {
        key: 'aged',
        band: CLAUSE_BANDS.attention,
        count: s.claimsAged.length,
        lead: `${s.claimsAged.length} past thirty days`,
        consequence: 'the insurer decides those, but the chasing is ours',
      },
      named(
        earliestBy(s.claimsAged, (row) => row.raisedAt)?.systemNo,
        s.claimsAged.length,
        'the oldest of them',
      ),
    ),
  ],
}

const AGENT: BriefingTemplate = {
  key: 'agent',
  queueName: 'your book',
  frame: '',
  rowSources: [
    ROW_SOURCES.tatLapsed,
    ROW_SOURCES.tatAtRisk,
    ROW_SOURCES.quotationsAwaitingReply,
    ROW_SOURCES.overdueTasks,
  ],
  clauses: (s) => [
    clause({
      key: 'open',
      band: CLAUSE_BANDS.headline,
      count: s.inquiriesOpen.length,
      lead: count(s.inquiriesOpen.length, 'open lead', 'open leads'),
      rest: ' in your book',
    }),
    clause({
      key: 'drafts',
      band: CLAUSE_BANDS.headline,
      count: s.quotationsDraft.length,
      lead: count(s.quotationsDraft.length, 'draft', 'drafts'),
      rest: ' you have not sent yet',
    }),
    clause({
      key: 'due',
      band: CLAUSE_BANDS.headline,
      count: s.tasksDueThisWeek.length,
      lead: count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      rest: ' due this week',
    }),
    clause({
      key: 'lapsed',
      band: CLAUSE_BANDS.attention,
      count: s.inquiriesTatLapsed.length,
      lead: `${s.inquiriesTatLapsed.length} past ${plural(s.inquiriesTatLapsed.length, 'its', 'their')} turnaround`,
      consequence: 'a lead that runs out of turnaround moves to somebody else',
    }),
    withName(
      {
        key: 'quotes',
        band: CLAUSE_BANDS.attention,
        count: s.quotationsAwaitingReply.length,
        lead: count(s.quotationsAwaitingReply.length, 'quotation', 'quotations'),
        rest: ' shared with no reply',
        consequence: 'a quotation nobody follows up is usually one somebody else answered',
      },
      named(
        earliestBy(s.quotationsAwaitingReply, (row) => row.sharedAt)?.systemNo,
        s.quotationsAwaitingReply.length,
        'waiting longest',
      ),
    ),
    withName(
      {
        key: 'overdue',
        band: CLAUSE_BANDS.attention,
        count: s.tasksOverdue.length,
        lead: `${s.tasksOverdue.length} already past due`,
        consequence: 'nothing on that list moves until somebody touches it',
      },
      named(
        earliestBy(s.tasksOverdue, (row) => row.dueAt)?.systemNo,
        s.tasksOverdue.length,
        'the oldest',
      ),
    ),
  ],
}

const BACK_OFFICE: BriefingTemplate = {
  key: 'backOffice',
  queueName: 'the work queue',
  frame: 'Your queue:',
  rowSources: [ROW_SOURCES.mandateFailures, ROW_SOURCES.overdueTasks],
  clauses: (s) => [
    clause({
      key: 'open',
      band: CLAUSE_BANDS.headline,
      count: s.tasksOpen.length,
      lead: count(s.tasksOpen.length, 'open item', 'open items'),
    }),
    clause({
      key: 'entry',
      band: CLAUSE_BANDS.headline,
      count: s.tasksPolicyEntry.length,
      lead: count(s.tasksPolicyEntry.length, 'policy entry', 'policy entries'),
      rest: ' short of complete',
    }),
    clause({
      key: 'drafts',
      band: CLAUSE_BANDS.headline,
      count: s.quotationsDraft.length,
      lead: count(s.quotationsDraft.length, 'draft quotation', 'draft quotations'),
      rest: ' waiting to go out',
    }),
    withName(
      {
        key: 'overdue',
        band: CLAUSE_BANDS.attention,
        count: s.tasksOverdue.length,
        lead: `${s.tasksOverdue.length} past due`,
        consequence: 'every day past due is a day a customer is waiting on us',
      },
      named(
        earliestBy(s.tasksOverdue, (row) => row.dueAt)?.systemNo,
        s.tasksOverdue.length,
        'the oldest',
      ),
    ),
    clause({
      key: 'mandates',
      band: CLAUSE_BANDS.attention,
      count: s.tasksMandateFailure.length,
      lead: count(s.tasksMandateFailure.length, 'failed mandate', 'failed mandates'),
      rest: ' waiting on a call',
      consequence: 'a grace period runs out whether or not anybody calls',
    }),
  ],
}

const CLAIMS: BriefingTemplate = {
  key: 'claims',
  queueName: 'the claim queue',
  frame: '',
  rowSources: [ROW_SOURCES.agedClaims, ROW_SOURCES.insurerQueries, ROW_SOURCES.overdueTasks],
  clauses: (s) => [
    clause({
      key: 'open',
      band: CLAUSE_BANDS.headline,
      count: s.claimsOpen.length,
      lead: count(s.claimsOpen.length, 'claim', 'claims'),
      rest: ' assigned to you',
    }),
    clause({
      key: 'due',
      band: CLAUSE_BANDS.headline,
      count: s.tasksDueThisWeek.length,
      lead: count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      rest: ' due this week',
    }),
    withName(
      {
        key: 'query',
        band: CLAUSE_BANDS.attention,
        count: s.claimsInsurerQuery.length,
        lead: `${s.claimsInsurerQuery.length} waiting on an insurer query`,
        consequence: 'the reply is ours to send, not theirs to chase',
      },
      named(
        earliestBy(s.claimsInsurerQuery, (row) => row.raisedAt)?.systemNo,
        s.claimsInsurerQuery.length,
        'open longest',
      ),
    ),
    withName(
      {
        key: 'aged',
        band: CLAUSE_BANDS.attention,
        count: s.claimsAged.length,
        lead: `${s.claimsAged.length} past thirty days`,
        consequence: 'nothing has moved on that one since, and the insurer will not move it for us',
      },
      named(
        earliestBy(s.claimsAged, (row) => row.raisedAt)?.systemNo,
        s.claimsAged.length,
        'the oldest',
      ),
    ),
  ],
}

const RENEWALS: BriefingTemplate = {
  key: 'renewals',
  queueName: 'the renewal pool',
  frame: '',
  rowSources: [
    ROW_SOURCES.renewalsDueThisWeek,
    ROW_SOURCES.mandateFailures,
    ROW_SOURCES.overdueTasks,
  ],
  clauses: (s) => [
    clause({
      key: 'due',
      band: CLAUSE_BANDS.headline,
      count: s.renewalsDueThisWeek.length,
      lead: count(s.renewalsDueThisWeek.length, 'renewal', 'renewals'),
      rest: plural(
        s.renewalsDueThisWeek.length,
        ' falls due inside the week',
        ' fall due inside the week',
      ),
    }),
    clause({
      key: 'tasks',
      band: CLAUSE_BANDS.headline,
      count: s.tasksDueThisWeek.length,
      lead: count(s.tasksDueThisWeek.length, 'task', 'tasks'),
      rest: ' on the renewals desk this week',
    }),
    clause({
      key: 'silent',
      band: CLAUSE_BANDS.attention,
      count: s.renewalsNoReminder.length,
      lead: `${s.renewalsNoReminder.length} with no reminder sent yet`,
      consequence: 'a renewal nobody has been told about lapses quietly',
    }),
    clause({
      key: 'lapsed',
      band: CLAUSE_BANDS.attention,
      count: s.renewalsLapsed.length,
      lead: `${s.renewalsLapsed.length} already lapsed`,
      consequence: 'a lapse becomes a win-back, and a win-back costs more than a reminder',
    }),
    withName(
      {
        key: 'mandates',
        band: CLAUSE_BANDS.attention,
        count: s.tasksMandateFailure.length,
        lead: count(s.tasksMandateFailure.length, 'failed mandate', 'failed mandates'),
        rest: ' waiting on a call',
        consequence: 'a grace period runs out whether or not anybody calls',
      },
      named(
        earliestBy(s.tasksMandateFailure, (row) => row.dueAt)?.systemNo,
        s.tasksMandateFailure.length,
        'the oldest',
      ),
    ),
  ],
}

/**
 * For an account whose template this file has not heard of. It counts the three
 * queues every template can hold rather than guessing at a role, because a
 * briefing that invents a queue is worse than one that is short. It carries no
 * consequence for the same reason: the interpretation belongs to a role, and
 * this is the absence of one.
 */
const GENERIC: BriefingTemplate = {
  key: 'generic',
  queueName: 'your queue',
  frame: '',
  rowSources: [ROW_SOURCES.tatAtRisk, ROW_SOURCES.overdueTasks, ROW_SOURCES.agedClaims],
  clauses: (s) => [
    clause({
      key: 'inquiries',
      band: CLAUSE_BANDS.headline,
      count: s.inquiriesOpen.length,
      lead: count(s.inquiriesOpen.length, 'open inquiry', 'open inquiries'),
      rest: ' you can see',
    }),
    clause({
      key: 'tasks',
      band: CLAUSE_BANDS.headline,
      count: s.tasksOpen.length,
      lead: count(s.tasksOpen.length, 'open task', 'open tasks'),
      rest: ' assigned to you',
    }),
    clause({
      key: 'claims',
      band: CLAUSE_BANDS.headline,
      count: s.claimsOpen.length,
      lead: count(s.claimsOpen.length, 'open claim', 'open claims'),
    }),
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

/**
 * What the list under the sentence is, said in the list's own words.
 *
 * The briefing's sentence counts three or four different things and the list
 * shows one of them. Without a caption the reader has to guess which — and a
 * list nobody can place reads as decoration, which is exactly what it must not
 * be. Each phrase describes the filter that produced the rows; the two TAT
 * sources also name their order, because the snapshot really does sort them by
 * deadline and that is the order a person works them in.
 */
const ROW_CAPTIONS: Readonly<Record<RowSource, string>> = {
  [ROW_SOURCES.tatLapsed]: 'Past turnaround, furthest first',
  [ROW_SOURCES.tatAtRisk]: 'Closest to turnaround first',
  [ROW_SOURCES.unassigned]: 'Waiting for an owner',
  [ROW_SOURCES.agedClaims]: 'Open past thirty days',
  [ROW_SOURCES.insurerQueries]: 'Waiting on an insurer query',
  [ROW_SOURCES.overdueTasks]: 'Past due',
  [ROW_SOURCES.mandateFailures]: 'Failed mandates, follow-up still open',
  [ROW_SOURCES.renewalsDueThisWeek]: 'Renewals due this week',
  [ROW_SOURCES.quotationsAwaitingReply]: 'Shared, no reply yet',
}

type Attention = { readonly rows: readonly BlockRow[]; readonly caption: string }

/**
 * The first source that has anything in it, trimmed to `MAX_ROWS`.
 *
 * When the trim bites, the caption says so and says out of how many. That
 * sentence fragment is a count off the same array, so it obeys the same rule as
 * every other number in a briefing: it was measured, not chosen.
 */
function attentionRows(template: BriefingTemplate, snapshot: QueueSnapshot): Attention | null {
  for (const source of template.rowSources) {
    const rows = rowsFor(source, snapshot)
    if (rows.length === 0) continue

    const caption =
      rows.length > MAX_ROWS
        ? `${ROW_CAPTIONS[source]} — ${MAX_ROWS} of ${rows.length}`
        : ROW_CAPTIONS[source]

    return { rows: rows.slice(0, MAX_ROWS), caption }
  }
  return null
}

/* --------------------------------------------------------------- assembly */

/**
 * "A", "A and B", "A, B, and C" — the prototype's own joins.
 *
 * Its back-office line reads "6 drafts, 4 KYC files short of complete, and 8 OCR
 * rows waiting on review", so three or more take the serial comma and two do
 * not. Full stops belong to the sentence, not to the clause, which is why a
 * clause's `rest` carries no terminal punctuation.
 */
function joinPhrases(parts: readonly string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]

  // A clause that names a record carries its own comma ("395 past due, TSK-0705
  // the oldest"). Two such parts joined by a bare "and" read as one run-on list,
  // so a comma anywhere but the final part promotes the join to the serial form
  // the prototype uses for three. A comma inside the LAST part is the tail of
  // the sentence and needs no help.
  const crowded = parts.slice(0, -1).some((part) => part.includes(','))

  if (parts.length === 2 && !crowded) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

export type BriefingProse = {
  readonly text: string
  /** Counted phrases and named records — what is set in bold on screen. */
  readonly emphasis: readonly string[]
  /** The clauses that survived the zero-drop, in template order. */
  readonly clauses: readonly BriefingClause[]
}

/**
 * The two sentences, assembled from the clauses that have anything to say.
 *
 * The frame belongs to the first sentence and is dropped with it: "Your queue:"
 * in front of a sentence about failed mandates would be a frame describing
 * something that is not there. The consequence is taken from the LAST surviving
 * attention clause that carries one, because the clauses are ordered by
 * escalation and the last one standing is the sharpest thing true of the queue.
 */
export function briefingProse(templateKey: string, snapshot: QueueSnapshot): BriefingProse {
  const template = briefingTemplateFor(templateKey)
  const kept = template.clauses(snapshot).filter((entry) => entry.count > 0)

  const headline = kept.filter((entry) => entry.band === CLAUSE_BANDS.headline)
  const attention = kept.filter((entry) => entry.band === CLAUSE_BANDS.attention)
  const phrase = (entry: BriefingClause) => `${entry.lead}${entry.rest}`

  const sentences: string[] = []

  if (headline.length > 0) {
    const body = joinPhrases(headline.map(phrase))
    sentences.push(template.frame ? `${template.frame} ${body}.` : `${body}.`)
  }

  if (attention.length > 0) {
    const body = joinPhrases(attention.map(phrase))
    const tail = [...attention].reverse().find((entry) => entry.consequence !== undefined)
    sentences.push(tail ? `${body} — ${tail.consequence}.` : `${body}.`)
  }

  const emphasis = [
    ...kept.map((entry) => entry.lead),
    ...kept.flatMap((entry) => entry.names ?? []),
  ]

  return { text: sentences.join(' '), emphasis, clauses: kept }
}

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

  const prose = briefingProse(templateKey, snapshot)

  if (prose.clauses.length === 0) {
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
      text: prose.text,
      emphasis: prose.emphasis,
      // The named records are the subset of the emphasis that is set in mono.
      mono: prose.clauses.flatMap((entry) => entry.names ?? []),
    },
  ]

  const attention = attentionRows(template, snapshot)
  if (attention) blocks.push({ kind: 'rows', rows: attention.rows, caption: attention.caption })

  return blocks
}

/**
 * True when this role's whole queue is clear.
 *
 * The screen needs to know, because a clear queue is a *result* and has to look
 * like one. Rendered with the same weight as a queue on fire it reads as a
 * failure to load; rendered as a finished state — stated plainly, marked with
 * the one thing green is allowed to mean — it reads as the good news it is.
 *
 * An account without the grant is not quiet. It is refused, which is a different
 * sentence and a different feeling, and it must not borrow this one's tone.
 */
export function briefingIsQuiet(templateKey: string, snapshot: QueueSnapshot): boolean {
  if (!snapshot.enabled) return false
  return briefingTemplateFor(templateKey)
    .clauses(snapshot)
    .every((entry) => entry.count === 0)
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
    renewalsNoReminder: snapshot.renewalsNoReminder.length,
  }
}
