import { describe, expect, it } from 'vitest'
import { fromPaise, money } from '../../domain/money'
import { PREMIUM_MODES } from '../../domain/workflows'
import modelSource from './document-model.ts?raw'
import {
  DOCUMENT_LAYOUTS,
  PREMIUM_MODE_LABELS,
  buildQuotationDocument,
  defaultLayoutFor,
  isFloater,
} from './document-model'
import type { BuildQuotationDocumentInput, DocumentColumn, DocumentPerson } from './document-model'

/**
 * The model's whole job is to carry figures without touching them (D3). These
 * tests are written against that rather than against the shape: identical `Money`
 * values in and out, an absent figure that stays absent, and a floater flag read
 * off the person list and nothing else.
 */

const ANITA: DocumentPerson = {
  name: 'Anita Shah',
  dateOfBirth: '1984-03-11',
  relationship: 'Self',
}
const RAJ: DocumentPerson = { name: 'Raj Shah', dateOfBirth: '1981-07-02', relationship: 'Spouse' }
const MEERA: DocumentPerson = {
  name: 'Meera Shah',
  dateOfBirth: '2014-01-09',
  relationship: 'Daughter',
}

function column(overrides: Partial<DocumentColumn> = {}): DocumentColumn {
  return {
    columnKey: 'col-star',
    label: 'Star Health',
    companyName: 'Star Health',
    productName: 'Family Health Optima',
    benefitValues: { sum_insured: 'INR 10,00,000' },
    finalPayablePremium: money(24500),
    ...overrides,
  }
}

function input(overrides: Partial<BuildQuotationDocumentInput> = {}): BuildQuotationDocumentInput {
  return {
    systemNo: 'QT-2041',
    version: 1,
    issuedOn: '2026-02-14T09:30:00.000Z',
    customerName: 'Anita Shah',
    persons: [ANITA],
    rows: [{ key: 'sum_insured', label: 'Sum insured', adHoc: false }],
    columns: [column()],
    premiumMode: PREMIUM_MODES.annual,
    preparedBy: 'Nirav Patel',
    agencyName: 'Jagad Insurance',
    ...overrides,
  }
}

describe('isFloater', () => {
  it('reads the person count and nothing else', () => {
    expect(isFloater([])).toBe(false)
    expect(isFloater([ANITA])).toBe(false)
    expect(isFloater([ANITA, RAJ])).toBe(true)
    expect(isFloater([ANITA, RAJ, MEERA])).toBe(true)
  })

  it('does not consult the relationship or the date of birth', () => {
    const unnamedRelations: readonly DocumentPerson[] = [
      { name: 'A', dateOfBirth: null, relationship: null },
      { name: 'B', dateOfBirth: null, relationship: null },
    ]
    expect(isFloater(unnamedRelations)).toBe(true)
    expect(isFloater([{ name: 'A', dateOfBirth: '1990-01-01', relationship: 'Self' }])).toBe(false)
  })
})

describe('buildQuotationDocument', () => {
  it('copies every figure identically - no arithmetic anywhere in the model', () => {
    const star = money(24500)
    const care = fromPaise(3199900)
    const document = buildQuotationDocument(
      input({
        columns: [
          column({ finalPayablePremium: star }),
          column({ columnKey: 'col-care', companyName: 'Care Health', finalPayablePremium: care }),
        ],
      }),
    )

    expect(document.columns[0].finalPayablePremium).toEqual(star)
    expect(document.columns[0].finalPayablePremium?.paise).toBe(2450000)
    expect(document.columns[1].finalPayablePremium).toEqual(care)
    expect(document.columns[1].finalPayablePremium?.paise).toBe(3199900)
    // Same object identity: the figure was carried, not rebuilt.
    expect(document.columns[0].finalPayablePremium).toBe(star)
    expect(document.columns[1].finalPayablePremium).toBe(care)
  })

  it('leaves an absent premium absent rather than defaulting it to zero', () => {
    const document = buildQuotationDocument(
      input({ columns: [column({ finalPayablePremium: null })] }),
    )
    expect(document.columns[0].finalPayablePremium).toBeNull()
  })

  it('derives the floater flag from the persons and copies the rest verbatim', () => {
    const parts = input({ persons: [ANITA, RAJ, MEERA] })
    const document = buildQuotationDocument(parts)

    expect(document.kind).toBe('quotation')
    expect(document.floater).toBe(true)
    expect(document.persons).toBe(parts.persons)
    expect(document.rows).toBe(parts.rows)
    expect(document.columns).toBe(parts.columns)
    expect(document.systemNo).toBe('QT-2041')
    expect(document.version).toBe(1)
    expect(document.issuedOn).toBe('2026-02-14T09:30:00.000Z')
    expect(document.premiumMode).toBe(PREMIUM_MODES.annual)
    expect(document.preparedBy).toBe('Nirav Patel')
    expect(document.agencyName).toBe('Jagad Insurance')
  })

  it('a single person is not a floater', () => {
    expect(buildQuotationDocument(input()).floater).toBe(false)
  })

  it('carries no arithmetic operator over a premium in its source', () => {
    // Read through Vite's `?raw` rather than node:fs: tsconfig.app carries only
    // `vite/client` types, so `?raw` is how a test under src/ reads source text.
    const body = modelSource
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join('\n')

    expect(body).not.toMatch(/sumMoney|addMoney|reduce\(|Math\./)
    expect(body).not.toContain('paise')
    expect(body).not.toContain('formatINR')
  })
})

describe('defaultLayoutFor', () => {
  it('prints one company on its own sheet', () => {
    const document = buildQuotationDocument(input())
    expect(defaultLayoutFor(document)).toBe(DOCUMENT_LAYOUTS.single)
  })

  it('prints two or more side by side', () => {
    const two = buildQuotationDocument(
      input({ columns: [column(), column({ columnKey: 'col-care' })] }),
    )
    const three = buildQuotationDocument(
      input({
        columns: [column(), column({ columnKey: 'col-care' }), column({ columnKey: 'col-niva' })],
      }),
    )
    expect(defaultLayoutFor(two)).toBe(DOCUMENT_LAYOUTS.sideBySide)
    expect(defaultLayoutFor(three)).toBe(DOCUMENT_LAYOUTS.sideBySide)
  })
})

describe('PREMIUM_MODE_LABELS', () => {
  it('labels every mode D-A defines, so a document can never print a raw key', () => {
    for (const mode of Object.values(PREMIUM_MODES)) {
      expect(PREMIUM_MODE_LABELS[mode]).toBeTruthy()
      expect(PREMIUM_MODE_LABELS[mode]).not.toMatch(/_/)
    }
  })
})
