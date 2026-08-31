import { describe, expect, it } from 'vitest'
import {
  cellAuto,
  cellDate,
  cellMoney,
  cellText,
  exportFileName,
  isForbiddenExportKey,
  renderCell,
  toSheet,
} from './export'
import type { ExportColumn } from './export'
import { parseCsv, toCsv } from './csv'
import { readXlsx, writeXlsx } from './xlsx'
import { autoMap } from './mapping'
import { validateRows } from './validate'
import { TEST_SPEC } from './spec.test'

type Row = {
  readonly systemNo: string
  readonly fullName: string
  readonly mobile: string
  readonly premium: { paise: number; currency: string } | null
  readonly startDate: string | null
  readonly aadhaarNumber: string | null
  readonly aadhaarLast4: string | null
}

const ROWS: readonly Row[] = [
  {
    systemNo: 'POL-0042',
    fullName: 'Rakesh Patel',
    mobile: '9825012345',
    premium: { paise: 1248500, currency: 'INR' },
    startDate: '2025-04-01T00:00:00.000Z',
    aadhaarNumber: null,
    aadhaarLast4: '4021',
  },
  {
    systemNo: 'POL-0043',
    fullName: 'Meera Shah',
    mobile: '9898098980',
    premium: null,
    startDate: null,
    aadhaarNumber: null,
    aadhaarLast4: null,
  },
]

const COLUMNS: readonly ExportColumn<Row>[] = [
  { key: 'systemNo', header: 'Reference', value: (row) => cellText(row.systemNo) },
  { key: 'fullName', header: 'Customer', value: (row) => cellText(row.fullName) },
  { key: 'premium', header: 'Premium', value: (row) => cellMoney(row.premium?.paise ?? null) },
  { key: 'startDate', header: 'Start date', value: (row) => cellDate(row.startDate) },
]

describe('rendering a cell', () => {
  it('writes money as rupees with two decimals, and absent as empty', () => {
    expect(renderCell(cellMoney(1248500))).toBe('12485.00')
    expect(renderCell(cellMoney(7))).toBe('0.07')
    // Not "0.00". An amount nobody recorded is not an amount of nothing.
    expect(renderCell(cellMoney(null))).toBe('')
  })

  it('writes a date as ISO, whatever it arrived as', () => {
    expect(renderCell(cellDate('2025-04-01T09:15:00.000Z'))).toBe('2025-04-01')
    expect(renderCell(cellDate(new Date(Date.UTC(2025, 3, 1))))).toBe('2025-04-01')
    expect(renderCell(cellDate(null))).toBe('')
  })

  it('reads the shape of a value it was not told about', () => {
    expect(renderCell(cellAuto({ paise: 1248500, currency: 'INR' }))).toBe('12485.00')
    expect(renderCell(cellAuto('2025-04-01'))).toBe('2025-04-01')
    expect(renderCell(cellAuto('POL-0042'))).toBe('POL-0042')
    expect(renderCell(cellAuto(42))).toBe('42')
    expect(renderCell(cellAuto(true))).toBe('Yes')
    expect(renderCell(cellAuto(['motor', 'health']))).toBe('motor; health')
    expect(renderCell(cellAuto(null))).toBe('')
    // A nested record exports empty rather than as "[object Object]".
    expect(renderCell(cellAuto({ nested: true }))).toBe('')
  })
})

describe('toSheet', () => {
  it('builds the header and rows the columns describe', () => {
    const sheet = toSheet('Policies', ROWS, COLUMNS)
    expect(sheet.header).toEqual(['Reference', 'Customer', 'Premium', 'Start date'])
    expect(sheet.rows[0]).toEqual(['POL-0042', 'Rakesh Patel', '12485.00', '2025-04-01'])
    expect(sheet.rows[1]).toEqual(['POL-0043', 'Meera Shah', '', ''])
  })

  it('refuses to export a full Aadhaar however the caller asks', () => {
    expect(isForbiddenExportKey('aadhaarNumber')).toBe(true)
    expect(isForbiddenExportKey('nomineeAadhaarNumber')).toBe(true)
    expect(isForbiddenExportKey('aadhaarLast4')).toBe(false)

    const sheet = toSheet('Customers', ROWS, [
      { key: 'aadhaarNumber', header: 'Aadhaar', value: (row) => cellText(row.aadhaarNumber) },
      { key: 'aadhaarLast4', header: 'Aadhaar last 4', value: (row) => cellText(row.aadhaarLast4) },
    ])
    expect(sheet.header).toEqual(['Aadhaar last 4'])
    expect(sheet.rows[0]).toEqual(['4021'])
  })

  it('dates the file, because an export is a snapshot', () => {
    expect(exportFileName('Collections to verify', 'xlsx', new Date('2026-08-31T10:00:00Z'))).toBe(
      'collections-to-verify-2026-08-31.xlsx',
    )
  })
})

/**
 * The loop the product actually promises: what comes out of a queue goes back in
 * through the importer without a person editing a heading.
 */
describe('export then import', () => {
  it('round trips through .xlsx and validates clean', async () => {
    const sheet = toSheet('People', ROWS, [
      { key: 'fullName', header: 'Full name', value: (row) => cellText(row.fullName) },
      { key: 'mobile', header: 'Mobile', value: (row) => cellText(row.mobile) },
      { key: 'premium', header: 'Premium', value: (row) => cellMoney(row.premium?.paise ?? null) },
      { key: 'startDate', header: 'Start date', value: (row) => cellDate(row.startDate) },
    ])

    const back = await readXlsx(await writeXlsx(sheet))
    const report = validateRows(back, autoMap(back.header, TEST_SPEC).map, TEST_SPEC)

    expect(report.counts).toEqual({ total: 2, ready: 2, failed: 0, duplicate: 0 })
    expect(report.verdicts[0]?.values.premium).toEqual({
      kind: 'money',
      raw: '12485.00',
      paise: 1248500,
    })
  })

  it('round trips through .csv too', () => {
    const sheet = toSheet('People', ROWS, [
      { key: 'fullName', header: 'Full name', value: (row) => cellText(row.fullName) },
      { key: 'mobile', header: 'Mobile', value: (row) => cellText(row.mobile) },
    ])
    const back = parseCsv(toCsv(sheet))
    const report = validateRows(back, autoMap(back.header, TEST_SPEC).map, TEST_SPEC)
    expect(report.counts.ready).toBe(2)
  })
})
