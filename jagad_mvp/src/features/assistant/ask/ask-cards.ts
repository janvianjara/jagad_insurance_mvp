/**
 * The Ask cards — FR-22.2's first request kind, and the one M0 shipped.
 *
 * "Fetch something you would otherwise navigate to. Nothing changes; it just
 * arrives faster than opening four screens." Each card is a projection query,
 * run at the moment its chip is pressed, as the person who pressed it. The
 * shared machinery — the card shape, the empty answer, the tones, the table
 * parts — lives in `card-kit.ts`, so Analyse, Act and Produce are built from
 * the same pieces rather than from a second copy of them.
 *
 * This file also owns the registry: which chips each role sees, how a typed
 * question is matched against them, and what is said to one that matches
 * nothing.
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantTask,
} from '../../../data/assistant'
import { textCell } from '../blocks/blocks'
import {
  ACT_CARDS,
  ASSIGN_UNASSIGNED,
  CHASE_MANDATE,
  ESCALATE_OLDEST_CLAIM,
  RESCHEDULE_OVERDUE,
} from './act-cards'
import { AGEING_SIDES, ANALYSE_CARDS, LOAD_BY_OWNER, WHY_LAPSING, WHY_UNASSIGNED } from './analyse-cards'
import { CLAIM_SUMMARY, PRODUCE_CARDS, RENEWAL_NOTICE, WORK_SUMMARY } from './produce-cards'
import {
  INQUIRY_COLUMNS,
  MAX_ROWS,
  PAGE,
  REQUEST_KINDS,
  answer,
  claimTone,
  countWord,
  inquiryRows,
  inquiryTableRow,
  nothingFound,
  taskRows,
  taskTone,
  words,
} from './card-kit'
import type { AskCard, CardAnswer } from './card-kit'
import {
  THRESHOLDS,
  isAgedClaim,
  isAwaitingReply,
  isDraftQuotation,
  isDueThisWeek,
  isInsurerQuery,
  isLapsedRenewal,
  isMandateFailure,
  isOpenClaim,
  isOpenInquiry,
  isOpenTask,
  isOverdueTask,
  isPolicyEntryTask,
  isRenewalDueThisWeek,
  isTatAtRisk,
  isUnassignedInquiry,
} from '../queue-rules'

export { REQUEST_KINDS } from './card-kit'
export type { AskCard, CardAnswer, RequestKind } from './card-kit'

/* -------------------------------------------------------------- the cards */

function inquiryCard(
  id: string,
  label: string,
  question: string,
  subject: string,
  keep: (row: AssistantInquiry, now: Date) => boolean,
  headline: (total: number) => { text: string; emphasis: readonly string[] },
): AskCard {
  return {
    id,
    label,
    question,
    kind: REQUEST_KINDS.ask,
    async run(repo, now) {
      const rows = (await inquiryRows(repo)).filter((row) => keep(row, now))
      if (rows.length === 0) return nothingFound(subject)
      const head = headline(rows.length)
      return answer(
        head.text,
        head.emphasis,
        INQUIRY_COLUMNS,
        rows.slice(0, MAX_ROWS).map(inquiryTableRow),
        rows.length,
      )
    },
  }
}

const MY_LEADS = inquiryCard(
  'my-leads',
  'My leads',
  'What is open in my book right now?',
  'book',
  (row) => isOpenInquiry(row),
  (total) => {
    const lead = countWord(total, 'open lead', 'open leads')
    return { text: `${lead} you can see, newest last.`, emphasis: [lead] }
  },
)

const OPEN_INQUIRIES = inquiryCard(
  'open-inquiries',
  'Open inquiries',
  'What is open across the queue?',
  'queue',
  (row) => isOpenInquiry(row),
  (total) => {
    const lead = countWord(total, 'open inquiry', 'open inquiries')
    return { text: `${lead} in scope for this account.`, emphasis: [lead] }
  },
)

const UNASSIGNED = inquiryCard(
  'unassigned',
  'Unassigned',
  'Which inquiries have nobody on them?',
  'queue',
  (row) => isUnassignedInquiry(row),
  (total) => {
    const lead = `${total} unassigned`
    return {
      text: `${lead}. Each one is waiting for an owner before its turnaround starts.`,
      emphasis: [lead],
    }
  },
)

const TAT_AT_RISK = inquiryCard(
  'tat-at-risk',
  'TAT at risk',
  'Which inquiries are close to their turnaround?',
  'queue',
  (row, now) => isTatAtRisk(row, now),
  (total) => {
    const lead = `${total} inside the three-hour window`
    return {
      text: `${lead}. If a turnaround lapses the inquiry reassigns on its own and the customer waits longer.`,
      emphasis: [lead],
    }
  },
)

const MY_DRAFTS: AskCard = {
  id: 'my-drafts',
  label: 'My drafts',
  question: 'Which quotations have I not sent yet?',
  kind: REQUEST_KINDS.ask,
  async run(repo) {
    const rows = (await repo.quotations({ pageSize: PAGE })).rows.filter(isDraftQuotation)
    if (rows.length === 0) return nothingFound('drafts')

    const lead = countWord(rows.length, 'quotation', 'quotations')
    return answer(
      `${lead} composed and not yet shared.`,
      [lead],
      [
        { key: 'no', label: 'Quotation' },
        { key: 'state', label: 'State' },
        { key: 'version', label: 'Version' },
        { key: 'premium', label: 'Final payable', align: 'end' },
      ],
      rows.slice(0, MAX_ROWS).map((row) => ({
        id: row.id,
        cells: [
          { cell: 'id', systemNo: row.systemNo },
          { cell: 'status', value: words(row.status), tone: 'info' },
          textCell(`v${row.version}`),
          // Recorded, never derived: the figure a person typed, or nothing.
          { cell: 'money', paise: row.finalPayablePremium?.paise ?? null },
        ],
      })),
      rows.length,
    )
  },
}

const AWAITING_REPLY: AskCard = {
  id: 'awaiting-reply',
  label: 'Awaiting reply',
  question: 'Which quotations are shared with no answer back?',
  kind: REQUEST_KINDS.ask,
  async run(repo) {
    const rows = (await repo.quotations({ pageSize: PAGE })).rows.filter(isAwaitingReply)
    if (rows.length === 0) return nothingFound('pipeline')

    const lead = countWord(rows.length, 'quotation', 'quotations')
    return answer(
      `${lead} shared and still unanswered.`,
      [lead],
      [
        { key: 'no', label: 'Quotation' },
        { key: 'shared', label: 'Shared' },
        { key: 'waiting', label: 'Waiting', align: 'end' },
      ],
      rows.slice(0, MAX_ROWS).map((row) => ({
        id: row.id,
        cells: [
          { cell: 'id', systemNo: row.systemNo },
          { cell: 'date', value: row.sharedAt },
          row.sharedAt === null
            ? textCell('share time not recorded')
            : { cell: 'clock', mode: 'aging', start: row.sharedAt },
        ],
      })),
      rows.length,
    )
  },
}

const TASK_COLUMNS = [
  { key: 'no', label: 'Task' },
  { key: 'what', label: 'What' },
  { key: 'kind', label: 'Kind' },
  { key: 'due', label: 'Due', align: 'end' as const },
]

function taskCard(
  id: string,
  label: string,
  question: string,
  subject: string,
  keep: (row: AssistantTask, now: Date) => boolean,
  headline: (total: number) => { text: string; emphasis: readonly string[] },
): AskCard {
  return {
    id,
    label,
    question,
    kind: REQUEST_KINDS.ask,
    async run(repo, now) {
      const rows = (await taskRows(repo)).filter((row) => keep(row, now))
      if (rows.length === 0) return nothingFound(subject)
      const head = headline(rows.length)
      return answer(
        head.text,
        head.emphasis,
        TASK_COLUMNS,
        rows.slice(0, MAX_ROWS).map((row) => ({
          id: row.id,
          cells: [
            { cell: 'id', systemNo: row.systemNo },
            textCell(row.title),
            { cell: 'status', value: words(row.kind), tone: taskTone(row, now) },
            { cell: 'date', value: row.dueAt, mode: 'short' },
          ],
        })),
        rows.length,
      )
    },
  }
}

const DUE_THIS_WEEK = taskCard(
  'due-this-week',
  'Due this week',
  'What falls due in the next seven days?',
  'queue',
  (row, now) => isDueThisWeek(row, now),
  (total) => {
    const lead = countWord(total, 'item', 'items')
    return { text: `${lead} due in the next seven days.`, emphasis: [lead] }
  },
)

const PAST_DUE = taskCard(
  'past-due',
  'Past due',
  'What is already past its due date?',
  'queue',
  (row, now) => isOverdueTask(row, now),
  (total) => {
    const lead = countWord(total, 'item', 'items')
    return { text: `${lead} past due.`, emphasis: [lead] }
  },
)

const POLICY_ENTRIES = taskCard(
  'policy-entries',
  'Policy drafts',
  'Which policy entries are still incomplete?',
  'queue',
  (row) => isPolicyEntryTask(row),
  (total) => {
    const lead = countWord(total, 'policy entry', 'policy entries')
    return { text: `${lead} waiting to be completed.`, emphasis: [lead] }
  },
)

const MANDATE_FAILURES = taskCard(
  'mandate-failures',
  'Failed mandates',
  'Which mandates have failed and are still open?',
  'queue',
  (row) => isMandateFailure(row),
  (total) => {
    const lead = countWord(total, 'failed mandate', 'failed mandates')
    return {
      text: `${lead} with the follow-up still open. The bank reported the failure; nothing here re-presents a debit.`,
      emphasis: [lead],
    }
  },
)

const CLAIM_COLUMNS = [
  { key: 'no', label: 'Claim' },
  { key: 'type', label: 'Type' },
  { key: 'state', label: 'State' },
  { key: 'age', label: 'Age', align: 'end' as const },
]

function claimCard(
  id: string,
  label: string,
  question: string,
  keep: (row: AssistantClaim, now: Date) => boolean,
  headline: (total: number) => { text: string; emphasis: readonly string[] },
  agingThreshold?: number,
): AskCard {
  return {
    id,
    label,
    question,
    kind: REQUEST_KINDS.ask,
    async run(repo, now) {
      const rows = (await repo.claims({ pageSize: PAGE })).rows.filter((row) => keep(row, now))
      if (rows.length === 0) return nothingFound('claim queue')
      const head = headline(rows.length)
      return answer(
        head.text,
        head.emphasis,
        CLAIM_COLUMNS,
        rows.slice(0, MAX_ROWS).map((row) => ({
          id: row.id,
          cells: [
            { cell: 'id', systemNo: row.systemNo, insurerNo: row.insurerNo },
            textCell(row.claimType),
            { cell: 'status', value: words(row.state), tone: claimTone(row.state) },
            {
              cell: 'clock',
              mode: 'aging',
              start: row.raisedAt,
              ...(agingThreshold === undefined ? {} : { durationMs: agingThreshold }),
            },
          ],
        })),
        rows.length,
      )
    },
  }
}

const MY_CLAIMS = claimCard(
  'my-claims',
  'My claims',
  'Which claims are open in my queue?',
  (row) => isOpenClaim(row),
  (total) => {
    const lead = countWord(total, 'open claim', 'open claims')
    return {
      text: `${lead}. The Assistant coordinates and records; the insurer and the TPA decide.`,
      emphasis: [lead],
    }
  },
)

const INSURER_QUERIES = claimCard(
  'insurer-queries',
  'Insurer queries',
  'Which claims are stuck on an insurer query?',
  (row) => isInsurerQuery(row),
  (total) => {
    const lead = countWord(total, 'claim', 'claims')
    return { text: `${lead} waiting on an insurer query.`, emphasis: [lead] }
  },
)

const AGED_CLAIMS = claimCard(
  'aged-claims',
  'Past thirty days',
  'Which open claims have aged past thirty days?',
  (row, now) => isAgedClaim(row, now),
  (total) => {
    const lead = countWord(total, 'open claim', 'open claims')
    return { text: `${lead} past the thirty-day mark.`, emphasis: [lead] }
  },
  THRESHOLDS.claimAgingMs,
)

const RENEWAL_COLUMNS = [
  { key: 'policy', label: 'Policy' },
  { key: 'state', label: 'State' },
  { key: 'due', label: 'Due', align: 'end' as const },
  { key: 'expiry', label: 'Expiry', align: 'end' as const },
]

const RENEWALS_DUE: AskCard = {
  id: 'renewals-due',
  label: 'Renewals this week',
  question: 'Which renewals fall due in the next seven days?',
  kind: REQUEST_KINDS.ask,
  async run(repo, now) {
    const rows = (await repo.renewals({ pageSize: PAGE })).rows.filter((row) =>
      isRenewalDueThisWeek(row, now),
    )
    if (rows.length === 0) return nothingFound('renewal pool')

    const lead = countWord(rows.length, 'renewal', 'renewals')
    return answer(
      `${lead} due in the next seven days.`,
      [lead],
      RENEWAL_COLUMNS,
      rows.slice(0, MAX_ROWS).map((row) => ({
        id: row.id,
        cells: [
          textCell(row.policyId),
          { cell: 'status', value: words(row.state), tone: 'info' },
          { cell: 'date', value: row.dueOn, mode: 'short' },
          { cell: 'date', value: row.expiryDate, mode: 'short' },
        ],
      })),
      rows.length,
    )
  },
}

const RENEWALS_LAPSED: AskCard = {
  id: 'renewals-lapsed',
  label: 'Lapsed',
  question: 'Which renewals have lapsed?',
  kind: REQUEST_KINDS.ask,
  async run(repo) {
    const rows = (await repo.renewals({ pageSize: PAGE })).rows.filter(isLapsedRenewal)
    if (rows.length === 0) return nothingFound('renewal pool')

    const lead = countWord(rows.length, 'renewal', 'renewals')
    return answer(
      `${lead} lapsed and on the win-back path.`,
      [lead],
      RENEWAL_COLUMNS,
      rows.slice(0, MAX_ROWS).map((row) => ({
        id: row.id,
        cells: [
          textCell(row.policyId),
          { cell: 'status', value: words(row.state), tone: 'bad' },
          { cell: 'date', value: row.dueOn, mode: 'short' },
          { cell: 'date', value: row.expiryDate, mode: 'short' },
        ],
      })),
      rows.length,
    )
  },
}

const MY_QUEUE = taskCard(
  'my-queue',
  'My queue',
  'What is open in my queue?',
  'queue',
  (row) => isOpenTask(row),
  (total) => {
    const lead = countWord(total, 'open item', 'open items')
    return { text: `${lead} assigned to this account.`, emphasis: [lead] }
  },
)

/* ------------------------------------------------------------ per-role set */

/** Every card in the product, of every kind. The registry, and the only one. */
export const ALL_CARDS: readonly AskCard[] = [
  MY_LEADS,
  OPEN_INQUIRIES,
  UNASSIGNED,
  TAT_AT_RISK,
  MY_DRAFTS,
  AWAITING_REPLY,
  MY_QUEUE,
  DUE_THIS_WEEK,
  PAST_DUE,
  POLICY_ENTRIES,
  MANDATE_FAILURES,
  MY_CLAIMS,
  INSURER_QUERIES,
  AGED_CLAIMS,
  RENEWALS_DUE,
  RENEWALS_LAPSED,
  ...ANALYSE_CARDS,
  ...ACT_CARDS,
  ...PRODUCE_CARDS,
]

/** Kept under its M0 name: the Ask half of the registry. */
export const ASK_CARDS: readonly AskCard[] = ALL_CARDS.filter(
  (card) => card.kind === REQUEST_KINDS.ask,
)

/**
 * The chips each role sees, in the order they see them.
 *
 * §3 puts the role's own queue first — "the role's real queue is the second nav
 * section and the first suggestion chip" — and every set differs, because a
 * renewals officer offered "unassigned inquiries" learns that the Assistant does
 * not know what they do.
 *
 * Each set is also mixed across the four request kinds, which is the whole
 * reason the tag on a chip is worth printing. A row of six chips that all
 * retrieve teaches a person that the Assistant looks things up; a row that
 * opens with their queue and ends with "Claim summary · Produce" teaches them
 * what else it is for, before they have to guess and type.
 */
const CHIPS_BY_TEMPLATE: Readonly<Record<string, readonly AskCard[]>> = {
  admin: [
    OPEN_INQUIRIES,
    UNASSIGNED,
    AGED_CLAIMS,
    LOAD_BY_OWNER,
    AGEING_SIDES,
    WORK_SUMMARY,
  ],
  salesManager: [
    OPEN_INQUIRIES,
    UNASSIGNED,
    TAT_AT_RISK,
    WHY_UNASSIGNED,
    ASSIGN_UNASSIGNED,
    AWAITING_REPLY,
  ],
  agent: [MY_LEADS, TAT_AT_RISK, MY_DRAFTS, DUE_THIS_WEEK, RESCHEDULE_OVERDUE],
  backOffice: [
    MY_QUEUE,
    POLICY_ENTRIES,
    MANDATE_FAILURES,
    PAST_DUE,
    CHASE_MANDATE,
    RESCHEDULE_OVERDUE,
  ],
  claims: [
    MY_CLAIMS,
    INSURER_QUERIES,
    AGED_CLAIMS,
    AGEING_SIDES,
    ESCALATE_OLDEST_CLAIM,
    CLAIM_SUMMARY,
  ],
  renewals: [
    RENEWALS_DUE,
    RENEWALS_LAPSED,
    MANDATE_FAILURES,
    WHY_LAPSING,
    CHASE_MANDATE,
    RENEWAL_NOTICE,
  ],
}

/** A template this file has not heard of gets the three queues everyone has. */
const GENERIC_CHIPS: readonly AskCard[] = [MY_QUEUE, DUE_THIS_WEEK, PAST_DUE]

export function chipsFor(templateKey: string): readonly AskCard[] {
  return CHIPS_BY_TEMPLATE[templateKey] ?? GENERIC_CHIPS
}

export function askCardById(id: string): AskCard | null {
  return ALL_CARDS.find((card) => card.id === id) ?? null
}

/* --------------------------------------------------------------- follow-ups */

/**
 * What is offered after an answer lands — the prototype's `n:` list.
 *
 * An assistant that shows the same six chips after every turn is a menu with a
 * text box on it. The prototype's does not: each answer proposes the moves that
 * follow from what it just showed, which is the reason a second and a third turn
 * happen at all. "Which inquiries have nobody on them" is followed by "route
 * them", not by "which renewals are due".
 *
 * It is a map rather than a field on the card because the interesting content is
 * the EDGES — which answer leads to which — and an edge list is only readable
 * when it is in one place. A card with no entry falls back to the role's own
 * chips, which is the right default and the prototype's.
 */
const FOLLOW_UPS: Readonly<Record<string, readonly string[]>> = {
  'open-inquiries': ['unassigned', 'tat-at-risk', 'why-unassigned'],
  unassigned: ['assign-unassigned', 'why-unassigned', 'tat-at-risk'],
  'tat-at-risk': ['assign-unassigned', 'unassigned', 'load-by-owner'],
  'why-unassigned': ['assign-unassigned', 'unassigned', 'load-by-owner'],
  'assign-unassigned': ['tat-at-risk', 'open-inquiries', 'load-by-owner'],
  'my-leads': ['my-drafts', 'awaiting-reply', 'due-this-week'],
  'my-drafts': ['awaiting-reply', 'my-leads', 'due-this-week'],
  'awaiting-reply': ['my-drafts', 'reschedule-overdue', 'due-this-week'],

  'my-queue': ['past-due', 'policy-entries', 'reschedule-overdue'],
  'due-this-week': ['past-due', 'my-queue', 'reschedule-overdue'],
  'past-due': ['reschedule-overdue', 'load-by-owner', 'my-queue'],
  'policy-entries': ['past-due', 'my-queue', 'work-summary'],
  'mandate-failures': ['chase-mandate', 'past-due', 'why-lapsing'],
  'chase-mandate': ['mandate-failures', 'due-this-week', 'past-due'],
  'reschedule-overdue': ['past-due', 'my-queue', 'due-this-week'],

  'my-claims': ['insurer-queries', 'aged-claims', 'claim-summary'],
  'insurer-queries': ['aged-claims', 'ageing-sides', 'claim-summary'],
  'aged-claims': ['ageing-sides', 'escalate-claim', 'claim-summary'],
  'ageing-sides': ['escalate-claim', 'aged-claims', 'claim-summary'],
  'escalate-claim': ['aged-claims', 'my-claims', 'claim-summary'],
  'claim-summary': ['aged-claims', 'insurer-queries', 'record-settlement'],
  'record-settlement': ['my-claims', 'aged-claims'],

  'renewals-due': ['renewal-notice', 'renewals-lapsed', 'mandate-failures'],
  'renewals-lapsed': ['why-lapsing', 'renewals-due', 'renewal-notice'],
  'why-lapsing': ['renewals-lapsed', 'renewals-due', 'renewal-notice'],
  'renewal-notice': ['renewals-due', 'renewals-lapsed', 'why-lapsing'],

  'load-by-owner': ['past-due', 'unassigned', 'work-summary'],
  'work-summary': ['load-by-owner', 'past-due', 'aged-claims'],
}

/**
 * The chips to show after `cardId` answered, for this role.
 *
 * Two rules, and the second is a scope rule rather than a layout one. Ids are
 * resolved against the registry, so a follow-up naming a card that no longer
 * exists is dropped instead of rendering a dead chip. And a follow-up is only
 * offered if it is genuinely reachable — a role that has no claims work is not
 * shown "escalate the oldest claim" just because the edge list mentions it.
 * Falling back to the role's own chips means a person is never left with an
 * answer and no next move.
 */
export function followUpsFor(cardId: string, templateKey: string): readonly AskCard[] {
  const role = chipsFor(templateKey)
  const ids = FOLLOW_UPS[cardId]
  if (!ids) return role

  const offered = ids
    .map((id) => askCardById(id))
    .filter((card): card is AskCard => card !== null && reachableFor(card, templateKey))

  return offered.length > 0 ? offered : role
}

/**
 * Whether this role can be offered this card at all.
 *
 * The repository is what actually enforces scope — every card returns an empty
 * answer for records the account cannot see, so offering a chip is never a leak.
 * This is narrower than that and about usefulness: a chip whose answer is always
 * "nothing found" is noise, and a role's own chip set is the best available
 * statement of what that person's work is. A card in their set, or one whose
 * subject their set already covers, is fair to offer.
 */
function reachableFor(card: AskCard, templateKey: string): boolean {
  const role = chipsFor(templateKey)
  if (role.some((chip) => chip.id === card.id)) return true

  const subjects = new Set(role.map(subjectOf))
  return subjects.has(subjectOf(card))
}

/**
 * What a card is *about* — the queue it reads.
 *
 * Derived from the id rather than declared, deliberately: the ids already carry
 * the subject and a second declaration would be one more thing to keep in step.
 */
function subjectOf(card: AskCard): string {
  const id = card.id
  if (id.includes('claim') || id.includes('settlement') || id === 'ageing-sides') return 'claims'
  if (id.includes('renewal') || id === 'why-lapsing') return 'renewals'
  if (id.includes('inquir') || id.includes('unassigned') || id.includes('tat') || id.includes('lead')) {
    return 'inquiries'
  }
  if (id.includes('quotation') || id.includes('drafts') || id.includes('reply')) return 'quotations'
  return 'tasks'
}

/* ------------------------------------------------------- typed questions */

/**
 * Words that carry no subject. Dropped before matching so "what is still
 * unassigned?" and "unassigned" score the same.
 */
const EMPTY_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'is', 'are', 'was',
  'were', 'be', 'do', 'does', 'did', 'what', 'which', 'who', 'when', 'where', 'how', 'why',
  'show', 'me', 'my', 'i', 'you', 'your', 'this', 'that', 'it', 'any', 'all', 'can', 'get',
  'give', 'list', 'tell', 'about', 'right', 'now', 'please',
])

function meaningfulWords(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !EMPTY_WORDS.has(word))
}

/** How many words a typed question and a card have to share before it is a match. */
const MATCH_FLOOR = 2

/**
 * The card a typed question is asking for, or null.
 *
 * The prototype answers free text by matching it against a fixed list of
 * examples (`KEYS`) and, failing that, saying plainly that this build answers a
 * fixed set. This is the same contract with the matching done over the cards
 * themselves rather than a second hand-written table, so a card added to a role
 * becomes typeable in the same commit it becomes pressable.
 *
 * The search is over the role's OWN cards, never all of them. Every card runs
 * through the scoped facade, so a wider search would still be safe — but a
 * renewals officer typing "claims" and getting a claims answer teaches them the
 * Assistant does not know what they do, which is the thing `chipsFor` exists to
 * avoid.
 *
 * `MATCH_FLOOR` is what keeps it from guessing. One shared word is a
 * coincidence; below the floor the caller gets null and says so, which is the
 * honest answer and the prototype's own.
 */
export function matchAskCard(question: string, cards: readonly AskCard[]): AskCard | null {
  const asked = new Set(meaningfulWords(question))
  if (asked.size === 0) return null

  let best: AskCard | null = null
  let bestScore = 0

  for (const card of cards) {
    const known = new Set([...meaningfulWords(card.label), ...meaningfulWords(card.question)])
    let score = 0
    for (const word of asked) if (known.has(word)) score += 1

    if (score > bestScore) {
      best = card
      bestScore = score
    }
  }

  return bestScore >= MATCH_FLOOR ? best : null
}

/**
 * What the Assistant says to a question it cannot answer yet.
 *
 * The prototype's own reply, with our chips named instead of its examples: it
 * offers what it CAN do rather than apologising, and it never pretends to have
 * looked something up. Nothing here is a stored answer.
 */
export function unmatchedAnswer(cards: readonly AskCard[]): CardAnswer {
  const offered = cards.map((card) => card.label)

  return { blocks: [
    {
      kind: 'para',
      text: 'I can look that up, but this build answers a fixed set of questions about your own queue.',
    },
    {
      kind: 'note',
      text:
        offered.length > 0
          ? `Try one of these instead: ${offered.join(', ')}. Each runs a live query over the records this account can see, at the moment you press it.`
          : 'This account has no suggestions available, so there is nothing for a typed question to match.',
      },
    ],
  }
}
