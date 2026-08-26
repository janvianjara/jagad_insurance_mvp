/**
 * The Assistant's block vocabulary — the prototype's `blk()` rebuilt as data.
 *
 * The prototype's renderer takes objects tagged `b: 'para' | 'rows' | 'table' |
 * 'kv' | 'note' | 'act' | 'choice' | 'file' | 'stop'` and turns each into
 * markup. Five of those nine are Ask-shaped and land here; `act`, `choice`,
 * `file` and `stop` all write, produce or extract, and they arrive with the
 * features that need them rather than as empty cases nobody can exercise.
 *
 * Two rules shape the model, and both are product invariants rather than taste:
 *
 *   Blocks are data, never markup and never React. A turn can therefore be
 *   built in a pure function, asserted on in a test with no DOM, and reviewed
 *   for truthfulness by reading the values rather than the rendering.
 *
 *   A value that has a type keeps it all the way to the render edge. Money
 *   travels as integer paise and is formatted by `<Money>`; a date travels as
 *   its recorded ISO string and is formatted by `<DateTime>`; a record number
 *   travels as `systemNo` plus `insurerNo` and is rendered by `<RecordId>`.
 *   Nothing in this module ever produces a formatted string, so there is no
 *   route by which the Assistant could invent an amount on the way to a screen
 *   (D3, FR-22.5).
 */

import type { Severity, Tone } from '../../../ui/signal'
import type { DateTimeMode } from '../../../ui/type'

/* ------------------------------------------------------------------- cells */

export const CELL_KINDS = {
  text: 'text',
  id: 'id',
  money: 'money',
  date: 'date',
  status: 'status',
  clock: 'clock',
} as const

export type CellKind = (typeof CELL_KINDS)[keyof typeof CELL_KINDS]

/**
 * One value inside a table, a key-value block or a row's trailing slot.
 *
 * `money` carries paise and nothing else. There is deliberately no arithmetic
 * anywhere in this file: a cell holds a figure that was recorded, and a block
 * that wanted a total would have to be handed one.
 */
export type Cell =
  | { readonly cell: 'text'; readonly value: string }
  | { readonly cell: 'id'; readonly systemNo: string; readonly insurerNo?: string | null }
  | { readonly cell: 'money'; readonly paise: number | null }
  | { readonly cell: 'date'; readonly value: string | null; readonly mode?: DateTimeMode }
  | { readonly cell: 'status'; readonly value: string; readonly tone: Tone }
  | {
      readonly cell: 'clock'
      readonly mode: 'tat' | 'aging'
      /** When the clock started, as recorded: an assignment time, a raise time. */
      readonly start: string
      /** The allowance. Required for `tat`; for `aging` it marks "needs a person". */
      readonly durationMs?: number
      readonly label?: string
    }

export function textCell(value: string): Cell {
  return { cell: 'text', value }
}

/* ------------------------------------------------------------------ blocks */

export const BLOCK_KINDS = {
  /** A sentence. The briefing is mostly this. */
  para: 'para',
  /** A short list of records, each with a severity stripe. */
  rows: 'rows',
  /** A dense grid, for an answer that is genuinely tabular. */
  table: 'table',
  /** One record's facts. */
  kv: 'kv',
  /** The quiet framing line under an answer — where a notice states its reason. */
  note: 'note',
} as const

export type BlockKind = (typeof BLOCK_KINDS)[keyof typeof BLOCK_KINDS]

/**
 * A sentence, with the phrases worth emphasising named rather than marked up.
 *
 * The prototype writes `<b>18 open inquiries</b>` inline. Inline HTML would mean
 * `dangerouslySetInnerHTML`, and the phrases being emphasised here are counts
 * taken from live data — precisely the strings that must not become markup. So
 * the emphasis is a list of substrings and the renderer splits on them.
 */
export type ParaBlock = {
  readonly kind: 'para'
  readonly text: string
  readonly emphasis?: readonly string[]
}

export type NoteBlock = {
  readonly kind: 'note'
  readonly text: string
}

export type BlockRow = {
  readonly id: string
  readonly severity: Severity
  readonly primary: string
  readonly secondary: string
  /** The trailing slot: a clock, a status, an amount that was recorded. */
  readonly right?: Cell
  /** Where the record lives. A row without one is a fact, not a link. */
  readonly to?: string
}

export type RowsBlock = {
  readonly kind: 'rows'
  readonly rows: readonly BlockRow[]
}

export type TableColumn = {
  readonly key: string
  readonly label: string
  readonly align?: 'start' | 'end'
}

export type TableRow = {
  readonly id: string
  readonly cells: readonly Cell[]
}

export type TableBlock = {
  readonly kind: 'table'
  readonly columns: readonly TableColumn[]
  readonly rows: readonly TableRow[]
  readonly caption?: string
}

export type KvItem = {
  readonly key: string
  readonly label: string
  readonly value: Cell
}

export type KvBlock = {
  readonly kind: 'kv'
  readonly title: string
  readonly tag?: string
  readonly items: readonly KvItem[]
}

export type Block = ParaBlock | NoteBlock | RowsBlock | TableBlock | KvBlock

/* ------------------------------------------------------- emphasis splitting */

export type ParaSegment = {
  readonly text: string
  readonly emphasised: boolean
}

/**
 * Splits a sentence into plain and emphasised runs.
 *
 * Longest phrase first, so "4 unassigned" does not get shadowed by "4", and
 * every match is consumed left to right without overlapping. A phrase that is
 * not in the text is simply not found — an emphasis list that has drifted from
 * the sentence degrades to an unemphasised sentence rather than to a crash.
 */
export function splitEmphasis(text: string, emphasis: readonly string[] = []): ParaSegment[] {
  const phrases = [...new Set(emphasis.filter((phrase) => phrase.length > 0))].sort(
    (a, b) => b.length - a.length,
  )

  if (phrases.length === 0) return text.length > 0 ? [{ text, emphasised: false }] : []

  const segments: ParaSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    let bestAt = -1
    let bestPhrase = ''

    for (const phrase of phrases) {
      const at = text.indexOf(phrase, cursor)
      if (at === -1) continue
      if (bestAt === -1 || at < bestAt || (at === bestAt && phrase.length > bestPhrase.length)) {
        bestAt = at
        bestPhrase = phrase
      }
    }

    if (bestAt === -1) {
      segments.push({ text: text.slice(cursor), emphasised: false })
      break
    }

    if (bestAt > cursor) segments.push({ text: text.slice(cursor, bestAt), emphasised: false })
    segments.push({ text: bestPhrase, emphasised: true })
    cursor = bestAt + bestPhrase.length
  }

  return segments
}
