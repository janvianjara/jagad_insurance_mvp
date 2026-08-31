/**
 * The comparison matrix, as data. Plan §5 Composer row, §6 `BenefitMatrix`,
 * canvas 2.1-2.3.
 *
 * The component in this folder renders a draft and reports edits. Everything that
 * decides what the matrix contains lives here, in functions with no React in
 * them, because two of those decisions are product rules rather than layout:
 *
 *   Rows are the union of the mapped benefits of the chosen products, in
 *   catalogue order, with each column's cell pre-filled from that product's own
 *   `defaultValue`. A product that does not map a benefit gets an empty cell, not
 *   a borrowed one.
 *
 *   Final Payable Premium is absent until a person types it. There is no function
 *   in this module that returns one. `setColumnPremium` accepts what the control
 *   handed it — `Money` or `null` — and stores it; `columnsMissingPremium` reads
 *   the draft and names the columns still empty. Read the exports as the
 *   guarantee: nothing here derives, defaults, suggests or totals a premium, and
 *   `matrix-model.test.ts` asserts that the export surface stays that way (D3).
 */

import type { Money } from '../../domain/money'
import type { PremiumMode } from '../../domain/workflows'
import type { BenefitItem, PolicyBenefitMap } from '../../data/repo/benefits'
import type { QuotationBenefitRow, QuotationLine } from '../../data/repo/quotations'

/** One company-and-product column of the comparison. */
export type MatrixColumn = {
  readonly columnKey: string
  readonly label: string
  readonly companyId: string
  readonly companyName: string
  readonly productId: string
  readonly productName: string
}

/**
 * The whole editable state of one quotation version.
 *
 * `values` is row key to column key to the text a person typed. `premiums` is
 * column key to the figure a person typed, and `null` is a real state there — it
 * means unrecorded, and it is what blocks generate.
 */
export type MatrixDraft = {
  readonly rows: readonly QuotationBenefitRow[]
  readonly columns: readonly MatrixColumn[]
  readonly values: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly premiums: Readonly<Record<string, Money | null>>
  readonly premiumMode: PremiumMode
}

/** What the composer knows when it opens: the columns, and the catalogue behind them. */
export type OpenMatrixInput = {
  readonly columns: readonly MatrixColumn[]
  readonly benefitItems: readonly BenefitItem[]
  /** Product id to that product's mapped benefit rows, straight from the repository. */
  readonly mapsByProduct: Readonly<Record<string, readonly PolicyBenefitMap[]>>
  readonly premiumMode: PremiumMode
}

/** The line shape `compose` and `regenerate` take — no id, no version, no lock. */
export type DraftQuotationLine = Omit<
  QuotationLine,
  'id' | 'quotationId' | 'version' | 'locked'
>

/**
 * Canvas 2.1: "the union of mapped benefit rows ... defaults pre-filled".
 *
 * Union, not intersection: a benefit only one of the three companies covers still
 * gets a row, and the columns that do not cover it read empty. Order comes from
 * the catalogue's own `sortOrder` so two quotations over the same products list
 * their benefits the same way round.
 */
export function unionBenefitRows(
  benefitItems: readonly BenefitItem[],
  mapsByProduct: Readonly<Record<string, readonly PolicyBenefitMap[]>>,
): readonly QuotationBenefitRow[] {
  const itemsById = new Map(benefitItems.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const rows: QuotationBenefitRow[] = []

  for (const maps of Object.values(mapsByProduct)) {
    for (const map of maps) {
      if (seen.has(map.benefitItemId)) continue
      const item = itemsById.get(map.benefitItemId)
      if (!item) continue
      seen.add(map.benefitItemId)
      rows.push({
        key: item.key,
        benefitItemId: item.id,
        label: item.label,
        adHoc: false,
        sortOrder: item.sortOrder,
      })
    }
  }

  return rows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((row, index) => ({ ...row, sortOrder: index + 1 }))
}

/**
 * The pre-fill. Each cell reads its own product's `defaultValue` — the text an
 * admin copied off the brochure when the product was configured. Nothing is
 * computed and nothing is carried across columns.
 */
export function defaultCellValues(
  rows: readonly QuotationBenefitRow[],
  columns: readonly MatrixColumn[],
  mapsByProduct: Readonly<Record<string, readonly PolicyBenefitMap[]>>,
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  const values: Record<string, Record<string, string>> = {}

  for (const row of rows) {
    const cells: Record<string, string> = {}
    for (const column of columns) {
      const maps = mapsByProduct[column.productId] ?? []
      const map = maps.find((candidate) => candidate.benefitItemId === row.benefitItemId)
      cells[column.columnKey] = map ? map.defaultValue : ''
    }
    values[row.key] = cells
  }

  return values
}

/** The composer's opening state. Every premium starts `null`, because it is. */
export function openMatrixDraft(input: OpenMatrixInput): MatrixDraft {
  const rows = unionBenefitRows(input.benefitItems, input.mapsByProduct)
  const premiums: Record<string, Money | null> = {}
  for (const column of input.columns) premiums[column.columnKey] = null

  return {
    rows,
    columns: input.columns,
    values: defaultCellValues(rows, input.columns, input.mapsByProduct),
    premiums,
    premiumMode: input.premiumMode,
  }
}

/**
 * Reopening a saved version — canvas 2.5's v2, and any draft revisited.
 *
 * The typed figures come back exactly as they were stored; a line whose
 * `finalPayablePremium` is null returns to being an empty stop.
 */
export function draftFromLines(
  rows: readonly QuotationBenefitRow[],
  columns: readonly MatrixColumn[],
  lines: readonly QuotationLine[],
  premiumMode: PremiumMode,
): MatrixDraft {
  const byColumn = new Map(lines.map((line) => [line.columnKey, line]))
  const values: Record<string, Record<string, string>> = {}
  for (const row of rows) {
    const cells: Record<string, string> = {}
    for (const column of columns) {
      cells[column.columnKey] = byColumn.get(column.columnKey)?.benefitValues[row.key] ?? ''
    }
    values[row.key] = cells
  }

  const premiums: Record<string, Money | null> = {}
  for (const column of columns) {
    premiums[column.columnKey] = byColumn.get(column.columnKey)?.finalPayablePremium ?? null
  }

  return { rows, columns, values, premiums, premiumMode }
}

/** A cell edit. Text, always — a benefit value is what the brochure says, not a sum. */
export function setCellValue(
  draft: MatrixDraft,
  rowKey: string,
  columnKey: string,
  value: string,
): MatrixDraft {
  return {
    ...draft,
    values: { ...draft.values, [rowKey]: { ...(draft.values[rowKey] ?? {}), [columnKey]: value } },
  }
}

/**
 * Canvas 2.2: a benefit the catalogue does not carry, added inline.
 *
 * `benefitItemId` is null and `adHoc` is true — which is the whole mechanism. The
 * row lives on this quotation's own `benefitRows`, the catalogue is never
 * written to, and the next quotation over the same products opens without it.
 */
export function addAdHocRow(draft: MatrixDraft, label: string): MatrixDraft {
  const trimmed = label.trim()
  if (trimmed.length === 0) return draft

  const key = adHocRowKey(trimmed, draft.rows)
  const row: QuotationBenefitRow = {
    key,
    benefitItemId: null,
    label: trimmed,
    adHoc: true,
    sortOrder: draft.rows.length + 1,
  }
  const cells: Record<string, string> = {}
  for (const column of draft.columns) cells[column.columnKey] = ''

  return { ...draft, rows: [...draft.rows, row], values: { ...draft.values, [key]: cells } }
}

export function removeRow(draft: MatrixDraft, rowKey: string): MatrixDraft {
  const values = { ...draft.values }
  delete values[rowKey]
  return { ...draft, rows: draft.rows.filter((row) => row.key !== rowKey), values }
}

function adHocRowKey(label: string, rows: readonly QuotationBenefitRow[]): string {
  const base = `adhoc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  const taken = new Set(rows.map((row) => row.key))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/**
 * The premium stop, written down.
 *
 * The signature is the rule: this takes an amount and stores it. It has no
 * branch that supplies one, no fallback when the argument is null, and no
 * sibling that fills the rest of the columns from this one.
 */
export function setColumnPremium(
  draft: MatrixDraft,
  columnKey: string,
  amount: Money | null,
): MatrixDraft {
  return { ...draft, premiums: { ...draft.premiums, [columnKey]: amount } }
}

/** D-A: the mode is informational on a quotation. It changes no figure. */
export function setPremiumMode(draft: MatrixDraft, premiumMode: PremiumMode): MatrixDraft {
  return { ...draft, premiumMode }
}

/** The columns whose Final Payable Premium nobody has typed yet. */
export function columnsMissingPremium(draft: MatrixDraft): readonly MatrixColumn[] {
  return draft.columns.filter((column) => draft.premiums[column.columnKey] == null)
}

/**
 * §9's generate guard, asked early so the button can carry the same sentence the
 * refusal would have. It reports; it never fills.
 */
export function matrixReadyToGenerate(draft: MatrixDraft): boolean {
  return draft.columns.length > 0 && columnsMissingPremium(draft).length === 0
}

/** The sentence the blocked Generate button says, naming the columns still empty. */
export function premiumStopMessage(draft: MatrixDraft): string | null {
  if (draft.columns.length === 0) {
    return 'This quotation has no columns yet. Add at least one company and product before generating.'
  }
  const missing = columnsMissingPremium(draft)
  if (missing.length === 0) return null
  const labels = missing.map((column) => column.label).join(', ')
  return `Final Payable Premium is missing for: ${labels}. Type the figure from each insurer's quote — the platform does not work it out.`
}

/**
 * The draft as the lines a repository takes. `finalPremiumSource` is `'typed'`
 * because that is the only way a figure gets into this module; a column with no
 * figure goes down as null and the machine refuses the generate.
 */
export function toQuotationLines(draft: MatrixDraft): readonly DraftQuotationLine[] {
  return draft.columns.map((column) => {
    const benefitValues: Record<string, string> = {}
    for (const row of draft.rows) {
      benefitValues[row.key] = draft.values[row.key]?.[column.columnKey] ?? ''
    }
    const premium = draft.premiums[column.columnKey] ?? null
    return {
      columnKey: column.columnKey,
      label: column.label,
      companyId: column.companyId,
      productId: column.productId,
      finalPayablePremium: premium,
      finalPremiumSource: premium ? ('typed' as const) : null,
      // The matrix captures the final figure per column and never asks for its
      // parts, so the components go down unrecorded rather than as zero.
      netPremium: null,
      gstAmount: null,
      benefitValues,
    }
  })
}
