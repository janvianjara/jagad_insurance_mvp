/**
 * What every card is made of — the shared half of the four request kinds.
 *
 * FR-22.2 gives the Assistant four kinds of request, and each one is a card in
 * the same shape: a chip label, the question it stands in for, and a function
 * that runs against the projection facade at the moment it is pressed. Only the
 * `kind` and what the function returns differ.
 *
 *   Ask       retrieve something the person would otherwise navigate to
 *   Analyse   explain a movement — a reason, where a report gives a number
 *   Act       change something, behind a confirmation gate (FR-22.4)
 *   Produce   generate a document from data already in the system (FR-22.9)
 *
 * The rules that hold across all four, and that this module is the place to
 * state once:
 *
 *   Nothing here is a canned answer. Every card is a query, run as the person
 *   who pressed it. There is no user id compared anywhere below, because the
 *   scope was applied by the repository before these functions saw a row
 *   (FR-22.3) — an agent asking about a customer they did not source gets
 *   nothing back, and the card says so in as many words.
 *
 *   No card does arithmetic on an amount. A card may show a figure that was
 *   recorded on a record; it may not add two of them together, average them or
 *   project one forward. There is no arithmetic on money anywhere in these
 *   files, and that is checked by reading them, not hoped for (FR-22.5, D3).
 *
 *   Counting rows is not the same thing. "Four inquiries are unassigned" is a
 *   count of records, which the Assistant is free to do and which is most of
 *   what Analyse is; the boundary is money, not numbers.
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantRepository,
  AssistantTask,
} from '../../../data/assistant'
import type { Block, Cell, TableRow } from '../blocks/blocks'
import { textCell } from '../blocks/blocks'
import type { AssistantDocumentPage } from '../documents/document-page'
import type { Tone } from '../../../ui/signal'
import { isOverdueTask, tatAllowanceMs } from '../queue-rules'

/** One page, then the answer is trimmed to `MAX_ROWS` with the total stated. */
export const PAGE = 5000
export const MAX_ROWS = 8

/**
 * FR-22.2 tags every response with the kind of request it answered, and the
 * chip carries the same tag before it is pressed — so a person can tell a read
 * from a change without having to press it and find out.
 */
export const REQUEST_KINDS = {
  ask: 'Ask',
  analyse: 'Analyse',
  act: 'Act',
  produce: 'Produce',
} as const

export type RequestKind = (typeof REQUEST_KINDS)[keyof typeof REQUEST_KINDS]

/**
 * What running a card produces.
 *
 * `documents` is how a Produce card hands its letterhead sheet to the drawer.
 * It travels beside the blocks rather than inside a block, because the feed
 * card is a receipt for the document and the document is the thing itself; a
 * block that carried the whole sheet would put a page of tables inside a
 * conversation turn.
 */
export type CardAnswer = {
  readonly blocks: readonly Block[]
  readonly documents?: readonly AssistantDocumentPage[]
}

export type AskCard = {
  readonly id: string
  /** The chip's text. */
  readonly label: string
  /** What the chip stands in for, shown as the person's own turn. */
  readonly question: string
  readonly kind: RequestKind
  readonly run: (repo: AssistantRepository, now: Date) => Promise<CardAnswer>
}

/* ------------------------------------------------------------------- tones */

export function inquiryTone(status: AssistantInquiry['status']): Tone {
  if (status === 'escalated' || status === 'unrouted') return 'bad'
  if (status === 'new' || status === 'reassigned') return 'attn'
  if (status === 'converted') return 'ok'
  return 'info'
}

export function claimTone(state: AssistantClaim['state']): Tone {
  if (state === 'blocked' || state === 'query_open') return 'bad'
  if (state === 'raised' || state === 'checklist_raised') return 'attn'
  if (state === 'settlement_recorded' || state === 'closed') return 'ok'
  return 'info'
}

export function taskTone(task: AssistantTask, now: Date): Tone {
  if (isOverdueTask(task, now)) return 'bad'
  if (task.priority === 'urgent' || task.priority === 'high') return 'attn'
  return 'info'
}

/** `query_open` reads as "query open", and nowhere does a raw state reach a person. */
export function words(value: string): string {
  return value.replace(/_/g, ' ')
}

export function countWord(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`
}

/* ------------------------------------------------------------ answer shape */

/**
 * The empty answer, and it is a deliberate one.
 *
 * FR-22.3's acceptance criterion is that a person asking outside their scope
 * "receives nothing". Saying nothing is found — rather than quietly showing a
 * shorter list — is what makes the boundary visible to the person using it.
 */
export function nothingFound(subject: string): CardAnswer {
  return {
    blocks: [
      { kind: 'para', text: `Nothing in your ${subject} matches that right now.` },
      {
        kind: 'note',
        text: 'The Assistant reads as you and never above you. A record outside this account’s scope is not filtered out of the answer — it was never in the query.',
      },
    ],
  }
}

export function answer(
  headline: string,
  emphasis: readonly string[],
  columns: readonly { key: string; label: string; align?: 'start' | 'end' }[],
  rows: readonly TableRow[],
  total: number,
): CardAnswer {
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

  return { blocks }
}

/* -------------------------------------------------------------- the loads */

export async function inquiryRows(
  repo: AssistantRepository,
): Promise<readonly AssistantInquiry[]> {
  return (await repo.inquiries({ pageSize: PAGE })).rows
}

export async function taskRows(repo: AssistantRepository): Promise<readonly AssistantTask[]> {
  return (await repo.tasks({ pageSize: PAGE })).rows
}

/* ------------------------------------------------------------- table parts */

export const INQUIRY_COLUMNS = [
  { key: 'no', label: 'Inquiry' },
  { key: 'who', label: 'Contact' },
  { key: 'state', label: 'State' },
  { key: 'clock', label: 'Turnaround', align: 'end' as const },
]

export function inquiryTableRow(row: AssistantInquiry): TableRow {
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

/* --------------------------------------------------------------- grouping */

export type Tally = {
  readonly key: string
  readonly label: string
  readonly count: number
}

/**
 * Counts rows into named buckets, largest first.
 *
 * This is the whole engine behind Analyse, and it is worth being plain about
 * what it is: counting records, sorted. It never touches an amount. "Motor
 * renewals are down thirty-one policies" is a count; "that is ₹44,200 of the
 * gap" is the prototype inventing a figure, and it is the one thing from that
 * file that does not come across.
 */
export function tally<T>(
  rows: readonly T[],
  bucket: (row: T) => { key: string; label: string } | null,
): readonly Tally[] {
  const counts = new Map<string, Tally>()

  for (const row of rows) {
    const at = bucket(row)
    if (at === null) continue
    const seen = counts.get(at.key)
    counts.set(at.key, { key: at.key, label: at.label, count: (seen?.count ?? 0) + 1 })
  }

  return [...counts.values()].sort((a, b) => b.count - a.count)
}
