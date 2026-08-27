/*
 * The matrix, as rules rather than layout.
 *
 * Two of these assertions are product promises rather than unit coverage:
 * canvas 2.1's union-with-defaults, and canvas 2.2's ad-hoc row that leaves the
 * catalogue untouched. The third is D3's premium stop, asserted structurally —
 * the export surface of this module is read and checked, so a future helper that
 * totals, defaults or derives a premium cannot land without turning this red.
 */
import { describe, expect, it } from 'vitest'
import { fromPaise, money } from '../../domain/money'
import { PREMIUM_MODES } from '../../domain/workflows'
import type { BenefitItem, PolicyBenefitMap } from '../../data/repo/benefits'
import type { QuotationLine } from '../../data/repo/quotations'
import {
  addAdHocRow,
  columnsMissingPremium,
  defaultCellValues,
  draftFromLines,
  matrixReadyToGenerate,
  openMatrixDraft,
  premiumStopMessage,
  removeRow,
  setCellValue,
  setColumnPremium,
  setPremiumMode,
  toQuotationLines,
  unionBenefitRows,
} from './matrix-model'
import type { MatrixColumn, OpenMatrixInput } from './matrix-model'
import matrixModelSource from './matrix-model.ts?raw'

const BENEFITS: readonly BenefitItem[] = [
  { id: 'b-room', key: 'room-rent', label: 'Room rent limit', line: 'health', valueKind: 'text', sortOrder: 10, active: true },
  { id: 'b-pre', key: 'pre-hosp', label: 'Pre-hospitalisation', line: 'health', valueKind: 'text', sortOrder: 20, active: true },
  { id: 'b-mat', key: 'maternity', label: 'Maternity cover', line: 'health', valueKind: 'covered', sortOrder: 30, active: true },
  { id: 'b-rest', key: 'restore', label: 'Restoration of sum insured', line: 'health', valueKind: 'covered', sortOrder: 40, active: true },
]

/** Star maps room, pre-hosp and maternity; Care maps room, pre-hosp and restore. */
const MAPS: Readonly<Record<string, readonly PolicyBenefitMap[]>> = {
  'p-star': [
    { id: 'm-1', productId: 'p-star', benefitItemId: 'b-room', defaultValue: 'Single private room', sortOrder: 1 },
    { id: 'm-2', productId: 'p-star', benefitItemId: 'b-pre', defaultValue: '60 days', sortOrder: 2 },
    { id: 'm-3', productId: 'p-star', benefitItemId: 'b-mat', defaultValue: 'Covered after 36 months', sortOrder: 3 },
  ],
  'p-care': [
    { id: 'm-4', productId: 'p-care', benefitItemId: 'b-room', defaultValue: 'No room rent capping', sortOrder: 1 },
    { id: 'm-5', productId: 'p-care', benefitItemId: 'b-pre', defaultValue: '30 days', sortOrder: 2 },
    { id: 'm-6', productId: 'p-care', benefitItemId: 'b-rest', defaultValue: 'Unlimited restoration', sortOrder: 3 },
  ],
}

const STAR: MatrixColumn = {
  columnKey: 'col-star',
  label: 'Star Comprehensive',
  companyId: 'c-star',
  companyName: 'Star Health',
  productId: 'p-star',
  productName: 'Comprehensive',
}

const CARE: MatrixColumn = {
  columnKey: 'col-care',
  label: 'Care Supreme',
  companyId: 'c-care',
  companyName: 'Care Health',
  productId: 'p-care',
  productName: 'Supreme',
}

function input(): OpenMatrixInput {
  return {
    columns: [STAR, CARE],
    benefitItems: BENEFITS,
    mapsByProduct: MAPS,
    premiumMode: PREMIUM_MODES.annual,
  }
}

describe('canvas 2.1 — the union of the mapped benefits, defaults pre-filled', () => {
  it('takes the union of the two products, not the intersection', () => {
    const rows = unionBenefitRows(BENEFITS, MAPS)

    expect(rows.map((row) => row.key)).toEqual(['room-rent', 'pre-hosp', 'maternity', 'restore'])
    expect(rows.every((row) => row.adHoc === false)).toBe(true)
  })

  it('orders rows by the catalogue, so two quotations over the same products agree', () => {
    const reversed: Record<string, readonly PolicyBenefitMap[]> = {
      'p-care': MAPS['p-care'],
      'p-star': MAPS['p-star'],
    }
    expect(unionBenefitRows(BENEFITS, reversed).map((row) => row.label)).toEqual(
      unionBenefitRows(BENEFITS, MAPS).map((row) => row.label),
    )
  })

  it('pre-fills each cell from that product’s own default value', () => {
    const draft = openMatrixDraft(input())

    expect(draft.values['room-rent']['col-star']).toBe('Single private room')
    expect(draft.values['room-rent']['col-care']).toBe('No room rent capping')
    expect(draft.values['pre-hosp']['col-star']).toBe('60 days')
    expect(draft.values['pre-hosp']['col-care']).toBe('30 days')
  })

  it('leaves an unmapped benefit empty rather than borrowing the other column’s value', () => {
    const draft = openMatrixDraft(input())

    // Care does not map maternity; Star does not map restoration.
    expect(draft.values['maternity']['col-care']).toBe('')
    expect(draft.values['maternity']['col-star']).toBe('Covered after 36 months')
    expect(draft.values['restore']['col-star']).toBe('')
    expect(draft.values['restore']['col-care']).toBe('Unlimited restoration')
  })

  it('ignores a map pointing at a benefit the catalogue no longer carries', () => {
    const withGhost: Record<string, readonly PolicyBenefitMap[]> = {
      'p-star': [
        ...MAPS['p-star'],
        { id: 'm-x', productId: 'p-star', benefitItemId: 'b-retired', defaultValue: 'x', sortOrder: 9 },
      ],
    }
    expect(unionBenefitRows(BENEFITS, withGhost).map((row) => row.key)).not.toContain('b-retired')
  })

  it('opens with every Final Payable Premium unrecorded', () => {
    const draft = openMatrixDraft(input())

    expect(draft.premiums).toEqual({ 'col-star': null, 'col-care': null })
    expect(defaultCellValues(draft.rows, draft.columns, MAPS)).toEqual(draft.values)
  })
})

describe('canvas 2.2 — an ad-hoc row lives on this quotation only', () => {
  it('adds a row with benefitItemId null and adHoc true', () => {
    const next = addAdHocRow(openMatrixDraft(input()), 'OPD consultation cover')
    const row = next.rows[next.rows.length - 1]

    expect(row.benefitItemId).toBeNull()
    expect(row.adHoc).toBe(true)
    expect(row.label).toBe('OPD consultation cover')
    expect(next.values[row.key]).toEqual({ 'col-star': '', 'col-care': '' })
  })

  it('leaves the catalogue input byte-identical, so the next quotation opens without it', () => {
    const catalogue = JSON.stringify(BENEFITS)
    const maps = JSON.stringify(MAPS)

    const next = addAdHocRow(openMatrixDraft(input()), 'OPD consultation cover')
    expect(next.rows).toHaveLength(5)

    expect(JSON.stringify(BENEFITS)).toBe(catalogue)
    expect(JSON.stringify(MAPS)).toBe(maps)

    // The proof that matters to the demo: reopening over the same products.
    const fresh = openMatrixDraft(input())
    expect(fresh.rows.map((row) => row.key)).toEqual([
      'room-rent',
      'pre-hosp',
      'maternity',
      'restore',
    ])
    expect(fresh.rows.some((row) => row.adHoc)).toBe(false)
  })

  it('does not mutate the draft it was handed', () => {
    const draft = openMatrixDraft(input())
    const before = JSON.stringify(draft)

    addAdHocRow(draft, 'OPD consultation cover')
    expect(JSON.stringify(draft)).toBe(before)
  })

  it('refuses a blank label without changing anything', () => {
    const draft = openMatrixDraft(input())
    expect(addAdHocRow(draft, '   ')).toBe(draft)
  })

  it('keeps two rows of the same name apart', () => {
    const once = addAdHocRow(openMatrixDraft(input()), 'Dental')
    const twice = addAdHocRow(once, 'Dental')

    expect(twice.rows).toHaveLength(6)
    expect(new Set(twice.rows.map((row) => row.key)).size).toBe(6)
  })

  it('removes an ad-hoc row and its cells', () => {
    const added = addAdHocRow(openMatrixDraft(input()), 'Dental')
    const key = added.rows[added.rows.length - 1].key
    const removed = removeRow(added, key)

    expect(removed.rows.map((row) => row.key)).not.toContain(key)
    expect(removed.values[key]).toBeUndefined()
  })
})

describe('the premium stop', () => {
  it('names every column while nothing has been typed, and refuses to generate', () => {
    const draft = openMatrixDraft(input())

    expect(columnsMissingPremium(draft).map((column) => column.columnKey)).toEqual([
      'col-star',
      'col-care',
    ])
    expect(matrixReadyToGenerate(draft)).toBe(false)
    expect(premiumStopMessage(draft)).toContain('Star Comprehensive')
    expect(premiumStopMessage(draft)).toContain('Care Supreme')
    expect(premiumStopMessage(draft)).toMatch(/does not work it out/i)
  })

  it('stores the typed figure unchanged, and null unchanged too', () => {
    const draft = openMatrixDraft(input())
    const typed = money(18500)

    const recorded = setColumnPremium(draft, 'col-star', typed)
    expect(recorded.premiums['col-star']).toBe(typed)
    // The other column is untouched: one figure never fills another.
    expect(recorded.premiums['col-care']).toBeNull()

    const cleared = setColumnPremium(recorded, 'col-star', null)
    expect(cleared.premiums['col-star']).toBeNull()
    expect(matrixReadyToGenerate(cleared)).toBe(false)
  })

  it('clears only once every column carries a figure', () => {
    let draft = openMatrixDraft(input())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))
    expect(matrixReadyToGenerate(draft)).toBe(false)

    draft = setColumnPremium(draft, 'col-care', fromPaise(1699900))
    expect(matrixReadyToGenerate(draft)).toBe(true)
    expect(premiumStopMessage(draft)).toBeNull()
  })

  it('refuses a matrix with no columns at all', () => {
    const empty = openMatrixDraft({ ...input(), columns: [] })

    expect(matrixReadyToGenerate(empty)).toBe(false)
    expect(premiumStopMessage(empty)).toMatch(/no columns yet/i)
  })

  it('records the source as typed, because typed is the only way in', () => {
    let draft = openMatrixDraft(input())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))

    const lines = toQuotationLines(draft)
    const star = lines.find((line) => line.columnKey === 'col-star')
    const care = lines.find((line) => line.columnKey === 'col-care')

    expect(star?.finalPremiumSource).toBe('typed')
    expect(star?.finalPayablePremium?.paise).toBe(1850000)
    expect(care?.finalPayablePremium).toBeNull()
    expect(care?.finalPremiumSource).toBeNull()
  })
})

/*
 * D3, asserted against the module's own text. Behaviour tests prove that the
 * premium is empty today; these prove there is nowhere to put a computed one
 * tomorrow.
 */
const COMPUTATION_WORDS =
  /default|suggest|calculat|comput|derive|prefill|pre-fill|preset|auto|estimate|initial|fallback|seed|formula|total|recommend|average|scale|apportion|multipl|divide|percent/i

describe('D3 — nothing in this module produces a premium', () => {
  it('exports no helper whose name offers to work a premium out', () => {
    const exported = [...matrixModelSource.matchAll(/export (?:function|const) (\w+)/g)].map(
      (match) => match[1],
    )
    expect(exported).toContain('setColumnPremium')
    expect(exported).toContain('columnsMissingPremium')

    const offenders = exported.filter(
      (name) => /premium/i.test(name) && COMPUTATION_WORDS.test(name.replace(/premiumMode/i, '')),
    )
    expect(offenders).toEqual([])
  })

  it('applies no arithmetic to a premium: the module never touches paise at all', () => {
    expect(matrixModelSource).not.toMatch(/\bpaise\b/)
    expect(matrixModelSource).not.toMatch(/Number\(|parseFloat|parseInt|Math\./)
  })

  it('stores what setColumnPremium was handed, with no branch that supplies one', () => {
    const body = matrixModelSource.match(/export function setColumnPremium\([\s\S]*?\n\}/)?.[0] ?? ''

    expect(body).toContain('[columnKey]: amount')
    // No arithmetic, no coalescing fallback, no ternary that invents a figure.
    expect(body).not.toMatch(/[+*/%]/)
    expect(body).not.toMatch(/\?\?|\|\||amount\s*\?/)
  })

  it('has no export that fills the remaining columns from one figure', () => {
    expect(matrixModelSource).not.toMatch(/export (?:function|const) \w*[Ff]ill\w*/)
    expect(matrixModelSource).not.toMatch(/export (?:function|const) \w*[Aa]pply\w*[Tt]o[Aa]ll/)
  })
})

describe('reopening a saved version', () => {
  it('brings the typed figures and cells back exactly as stored', () => {
    const rows = unionBenefitRows(BENEFITS, MAPS)
    const lines: readonly QuotationLine[] = [
      {
        id: 'l-1',
        quotationId: 'q-1',
        version: 1,
        columnKey: 'col-star',
        label: 'Star Comprehensive',
        companyId: 'c-star',
        productId: 'p-star',
        finalPayablePremium: fromPaise(1850000),
        finalPremiumSource: 'typed',
        benefitValues: { 'room-rent': 'Single private room' },
        locked: true,
      },
    ]

    const draft = draftFromLines(rows, [STAR, CARE], lines, PREMIUM_MODES.annual)

    expect(draft.premiums['col-star']?.paise).toBe(1850000)
    expect(draft.values['room-rent']['col-star']).toBe('Single private room')
    // A column with no stored line returns to being an empty stop.
    expect(draft.premiums['col-care']).toBeNull()
    expect(draft.values['room-rent']['col-care']).toBe('')
    expect(matrixReadyToGenerate(draft)).toBe(false)
  })
})

describe('the informational premium mode (D-A)', () => {
  it('changes the mode and nothing else', () => {
    let draft = openMatrixDraft(input())
    draft = setColumnPremium(draft, 'col-star', fromPaise(1850000))
    draft = setCellValue(draft, 'room-rent', 'col-care', 'Single AC room')

    const switched = setPremiumMode(draft, PREMIUM_MODES.monthly)

    expect(switched.premiumMode).toBe(PREMIUM_MODES.monthly)
    expect(switched.premiums).toEqual(draft.premiums)
    expect(switched.values).toEqual(draft.values)
    expect(switched.rows).toBe(draft.rows)
  })
})
