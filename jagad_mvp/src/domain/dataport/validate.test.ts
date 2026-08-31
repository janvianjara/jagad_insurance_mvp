import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { autoMap } from './mapping'
import { TEST_SPEC } from './spec.test'
import {
  ROW_OUTCOMES,
  errorSheet,
  identityFromValues,
  isoOf,
  paiseOf,
  textOf,
  troubleFirst,
  validateRows,
} from './validate'
import type { ValidationContext } from './validate'

const CONTEXT: ValidationContext = {
  resolve: (resolverKey, raw) =>
    resolverKey === 'company' && raw.toLowerCase().includes('hdfc') ? 'cmp-hdfc' : null,
}

function check(csv: string, context: ValidationContext = CONTEXT) {
  const sheet = parseCsv(csv)
  const map = autoMap(sheet.header, TEST_SPEC).map
  return { sheet, map, report: validateRows(sheet, map, TEST_SPEC, context) }
}

const HEADER = 'Full name,Mobile,Alternate mobile,Premium,Start date,Source,Insurer\n'

describe('validateRows', () => {
  it('types every mapped cell against the spec', () => {
    const { report } = check(
      `${HEADER}Rakesh Patel,+91 98250 12345,,"₹ 12,485.00",01/04/2025,Walk-in,HDFC ERGO\n`,
    )
    const verdict = report.verdicts[0]

    expect(verdict?.outcome).toBe(ROW_OUTCOMES.ready)
    expect(verdict?.rowNumber).toBe(2)
    expect(textOf(verdict?.values ?? {}, 'mobile')).toBe('9825012345')
    expect(paiseOf(verdict?.values ?? {}, 'premium')).toBe(1248500)
    expect(isoOf(verdict?.values ?? {}, 'startDate')).toBe('2025-04-01')
    expect(textOf(verdict?.values ?? {}, 'source')).toBe('walk_in')
    expect(textOf(verdict?.values ?? {}, 'companyId')).toBe('cmp-hdfc')
  })

  it('leaves an empty optional cell absent — it does not become zero', () => {
    const { report } = check(`${HEADER}Rakesh Patel,9825012345,,,,,\n`)
    const values = report.verdicts[0]?.values ?? {}
    // D3: an amount nobody recorded is not an amount of nothing.
    expect(paiseOf(values, 'premium')).toBeNull()
    expect(values.premium?.kind).toBe('empty')
    expect(report.verdicts[0]?.outcome).toBe(ROW_OUTCOMES.ready)
  })

  it('pins every error to the column it came from', () => {
    const { report } = check(`${HEADER},98250,,"12,4o0",31/02/2025,Postcard,Acme Assurance\n`)
    const verdict = report.verdicts[0]

    expect(verdict?.outcome).toBe(ROW_OUTCOMES.failed)
    const byField = Object.fromEntries(
      (verdict?.errors ?? []).map((error) => [error.fieldKey, error]),
    )
    expect(byField.fullName?.column).toBe(0)
    expect(byField.fullName?.message).toMatch(/required/)
    expect(byField.mobile?.column).toBe(1)
    expect(byField.startDate?.message).toMatch(/not a real date/)
    expect(byField.source?.message).toMatch(/Walk-in, Referral/)
    expect(byField.companyId?.message).toMatch(/does not match anything on file/)
  })

  it('fails a required field that no column is mapped to', () => {
    const sheet = parseCsv('Mobile\n9825012345\n')
    const report = validateRows(sheet, autoMap(sheet.header, TEST_SPEC).map, TEST_SPEC, CONTEXT)
    const error = report.verdicts[0]?.errors[0]
    expect(error?.fieldKey).toBe('fullName')
    expect(error?.column).toBeNull()
    expect(error?.message).toMatch(/no column in this file is mapped to it/)
  })

  it('skips blank rows without counting them as failures', () => {
    const { report } = check(`${HEADER}Rakesh,9825012345,,,,,\n,,,,,,\nMeera,9898098980,,,,,\n`)
    expect(report.counts.total).toBe(2)
    expect(report.counts.ready).toBe(2)
  })
})

describe('duplicates', () => {
  it('warns about a repeat inside the same file rather than failing it', () => {
    const { report } = check(
      `${HEADER}Rakesh,9825012345,,,,,\nRakesh again,+91 98250 12345,,,,,\n`,
    )
    expect(report.verdicts[0]?.outcome).toBe(ROW_OUTCOMES.ready)
    expect(report.verdicts[1]?.outcome).toBe(ROW_OUTCOMES.duplicateInFile)
    expect(report.verdicts[1]?.errors).toEqual([])
    expect(report.verdicts[1]?.warnings[0]?.message).toMatch(/repeats a row earlier/)
    expect(report.counts).toEqual({ total: 2, ready: 1, failed: 0, duplicate: 1 })
  })

  it('recognises a record already on the books, however the number is written', () => {
    const existing = new Set([identityFromValues(['9825012345'])])
    const { report } = check(`${HEADER}Rakesh,098250-12345,,,,,\n`, { ...CONTEXT, existingIdentities: existing })
    expect(report.verdicts[0]?.outcome).toBe(ROW_OUTCOMES.duplicateOnFile)
    expect(report.verdicts[0]?.warnings[0]?.message).toMatch(/already on file/)
  })
})

describe('the error sheet', () => {
  it('gives back the failing rows with their file row number and what to fix', () => {
    const { sheet, report } = check(
      `${HEADER}Rakesh,9825012345,,,,,\n,98250,,,,,\nMeera,9898098980,,,,,\n`,
    )
    const errors = errorSheet(sheet, report.verdicts)

    expect(errors.header[0]).toBe('Row in your file')
    expect(errors.header.at(-1)).toBe('What to fix')
    expect(errors.rows).toHaveLength(1)
    expect(errors.rows[0]?.[0]).toBe('3')
    expect(errors.rows[0]?.at(-1)).toMatch(/Full name is required/)
    expect(errors.rows[0]?.at(-1)).toMatch(/Mobile is not a ten-digit/)
  })

  it('puts the rows that need a person first', () => {
    const { report } = check(
      `${HEADER}Rakesh,9825012345,,,,,\n,98250,,,,,\nMeera,9898098980,,,,,\nRepeat,9825012345,,,,,\n`,
    )
    expect(troubleFirst(report.verdicts).map((verdict) => verdict.outcome)).toEqual([
      ROW_OUTCOMES.failed,
      ROW_OUTCOMES.duplicateInFile,
      ROW_OUTCOMES.ready,
      ROW_OUTCOMES.ready,
    ])
  })
})
