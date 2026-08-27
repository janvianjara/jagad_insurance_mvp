/**
 * Suggestion chips and the Ask cards behind them — FR-22.2 (Ask) and FR-22.3.
 *
 * A chip is not a canned answer. Each one is a query over the projection facade,
 * run at the moment it is pressed, as the person who pressed it. That is the
 * whole of FR-22.3 in this feature: there is no user id compared anywhere below,
 * because the scope was applied by the repository before these functions saw a
 * row. An agent asking about a customer they did not source gets nothing back —
 * not a filtered answer, an empty one — and the card says so in as many words.
 *
 * M0 is Ask-only (FR-22.2, "Ask M0; rest P1"), so every card here retrieves.
 * None of them writes, and none of them needs a `<ConfirmGate>` yet; the first
 * card that changes something will.
 *
 * The money rule holds here too and is easy to state: a card may show a figure
 * that was recorded on a record, and may not add two of them together. There is
 * no arithmetic on an amount anywhere in this file (FR-22.5, D3).
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantRepository,
  AssistantTask,
} from '../../../data/assistant'
import type { Block, Cell, TableRow } from '../blocks/blocks'
import { textCell } from '../blocks/blocks'
import type { Tone } from '../../../ui/signal'
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
  tatAllowanceMs,
} from '../queue-rules'

/** One page, then the answer is trimmed to `MAX_ROWS` with the total stated. */
const PAGE = 5000
const MAX_ROWS = 8

/**
 * FR-22.2 tags every response with the kind of request it answered. M0 answers
 * only the first of the four; the other three are named so the tag has a
 * vocabulary rather than a single value.
 */
export const REQUEST_KINDS = {
  ask: 'Ask',
  analyse: 'Analyse',
  act: 'Act',
  produce: 'Produce',
} as const

export type RequestKind = (typeof REQUEST_KINDS)[keyof typeof REQUEST_KINDS]

export type AskCard = {
  readonly id: string
  /** The chip's text. */
  readonly label: string
  /** What the chip stands in for, shown as the person's own turn. */
  readonly question: string
  readonly kind: RequestKind
  readonly run: (repo: AssistantRepository, now: Date) => Promise<readonly Block[]>
}

/* ------------------------------------------------------------------- tones */

function inquiryTone(status: AssistantInquiry['status']): Tone {
  if (status === 'escalated' || status === 'unrouted') return 'bad'
  if (status === 'new' || status === 'reassigned') return 'attn'
  if (status === 'converted') return 'ok'
  return 'info'
}

function claimTone(state: AssistantClaim['state']): Tone {
  if (state === 'blocked' || state === 'query_open') return 'bad'
  if (state === 'raised' || state === 'checklist_raised') return 'attn'
  if (state === 'settlement_recorded' || state === 'closed') return 'ok'
  return 'info'
}

function taskTone(task: AssistantTask, now: Date): Tone {
  if (isOverdueTask(task, now)) return 'bad'
  if (task.priority === 'urgent' || task.priority === 'high') return 'attn'
  return 'info'
}

function words(value: string): string {
  return value.replace(/_/g, ' ')
}

/* ------------------------------------------------------------ answer shape */

/**
 * The empty answer, and it is a deliberate one.
 *
 * FR-22.3's acceptance criterion is that a person asking outside their scope
 * "receives nothing". Saying nothing is found — rather than quietly showing a
 * shorter list — is what makes the boundary visible to the person using it.
 */
function nothingFound(subject: string): readonly Block[] {
  return [
    { kind: 'para', text: `Nothing in your ${subject} matches that right now.` },
    {
      kind: 'note',
      text: 'The Assistant reads as you and never above you. A record outside this account’s scope is not filtered out of the answer — it was never in the query.',
    },
  ]
}

function answer(
  headline: string,
  emphasis: readonly string[],
  columns: readonly { key: string; label: string; align?: 'start' | 'end' }[],
  rows: readonly TableRow[],
  total: number,
): readonly Block[] {
  const blocks: Block[] = [
    { kind: 'para', text: headline, emphasis },
    { kind: 'table', columns, rows },
  ]

  if (total > rows.length) {
    blocks.push({
      kind: 'note',
      text: `Showing the first ${rows.length} of ${total}. The queue screen holds the rest, with the filters and the bulk actions.`,
    })
  }

  return blocks
}

function countWord(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`
}

/* -------------------------------------------------------------- the loads */

async function inquiryRows(repo: AssistantRepository): Promise<readonly AssistantInquiry[]> {
  return (await repo.inquiries({ pageSize: PAGE })).rows
}

async function taskRows(repo: AssistantRepository): Promise<readonly AssistantTask[]> {
  return (await repo.tasks({ pageSize: PAGE })).rows
}

/* -------------------------------------------------------------- the cards */

const INQUIRY_COLUMNS = [
  { key: 'no', label: 'Inquiry' },
  { key: 'who', label: 'Contact' },
  { key: 'state', label: 'State' },
  { key: 'clock', label: 'Turnaround', align: 'end' as const },
]

function inquiryTableRow(row: AssistantInquiry): TableRow {
  const clock: Cell =
    row.assignedAt === null || row.tatDueAt === null
      ? textCell('no turnaround set')
      : {
          cell: 'clock',
          mode: 'tat',
          start: row.assignedAt,
          durationMs: tatAllowanceMs(row) ?? 0,
        }

  return {
    id: row.id,
    cells: [
      { cell: 'id', systemNo: row.systemNo },
      textCell(row.contactName),
      { cell: 'status', value: words(row.status), tone: inquiryTone(row.status) },
      clock,
    ],
  }
}

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

export const ASK_CARDS: readonly AskCard[] = [
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
]

/**
 * The chips each role sees, in the order they see them.
 *
 * §3 puts the role's own queue first — "the role's real queue is the second nav
 * section and the first suggestion chip" — and every set differs, because a
 * renewals officer offered "unassigned inquiries" learns that the Assistant does
 * not know what they do.
 */
const CHIPS_BY_TEMPLATE: Readonly<Record<string, readonly AskCard[]>> = {
  admin: [OPEN_INQUIRIES, UNASSIGNED, TAT_AT_RISK, AGED_CLAIMS, RENEWALS_DUE, DUE_THIS_WEEK],
  salesManager: [OPEN_INQUIRIES, UNASSIGNED, TAT_AT_RISK, AWAITING_REPLY, DUE_THIS_WEEK],
  agent: [MY_LEADS, TAT_AT_RISK, MY_DRAFTS, AWAITING_REPLY, DUE_THIS_WEEK],
  backOffice: [MY_QUEUE, POLICY_ENTRIES, MANDATE_FAILURES, PAST_DUE, DUE_THIS_WEEK],
  claims: [MY_CLAIMS, INSURER_QUERIES, AGED_CLAIMS, DUE_THIS_WEEK],
  renewals: [RENEWALS_DUE, RENEWALS_LAPSED, MANDATE_FAILURES, DUE_THIS_WEEK],
}

/** A template this file has not heard of gets the three queues everyone has. */
const GENERIC_CHIPS: readonly AskCard[] = [MY_QUEUE, DUE_THIS_WEEK, PAST_DUE]

export function chipsFor(templateKey: string): readonly AskCard[] {
  return CHIPS_BY_TEMPLATE[templateKey] ?? GENERIC_CHIPS
}

export function askCardById(id: string): AskCard | null {
  return ASK_CARDS.find((card) => card.id === id) ?? null
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
export function unmatchedAnswer(cards: readonly AskCard[]): readonly Block[] {
  const offered = cards.map((card) => card.label)

  return [
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
  ]
}
