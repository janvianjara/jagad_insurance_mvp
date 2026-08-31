import { describe, expect, it } from 'vitest'
import { autoMap, missingRequired, normaliseHeading, unmappedColumns, withMapping } from './mapping'
import { FIELD_KINDS, requiredFields, templateFileName, templateSheet } from './spec'
import type { ImportSpec } from './spec'
import { parseCsv, toCsv } from './csv'
import { validateRows } from './validate'

/** A spec small enough to reason about and shaped like the real ones. */
export const TEST_SPEC: ImportSpec = {
  key: 'people',
  label: 'People',
  noun: 'person',
  nounPlural: 'people',
  summary: 'Puts a person on the books.',
  sheetName: 'People',
  identity: ['mobile'],
  writable: true,
  fields: [
    {
      key: 'fullName',
      label: 'Full name',
      kind: FIELD_KINDS.text,
      required: true,
      synonyms: ['name', 'customer name'],
      example: 'Rakesh Patel',
    },
    {
      key: 'mobile',
      label: 'Mobile',
      kind: FIELD_KINDS.phone,
      required: true,
      synonyms: ['mobile no', 'phone', 'contact number'],
      example: '9825012345',
    },
    {
      key: 'altMobile',
      label: 'Alternate mobile',
      kind: FIELD_KINDS.phone,
      synonyms: ['alt mobile'],
      example: '9898098980',
    },
    {
      key: 'premium',
      label: 'Premium',
      kind: FIELD_KINDS.money,
      example: '12485.00',
    },
    {
      key: 'startDate',
      label: 'Start date',
      kind: FIELD_KINDS.date,
      example: '2025-04-01',
    },
    {
      key: 'source',
      label: 'Source',
      kind: FIELD_KINDS.enum,
      options: [
        { value: 'walk_in', label: 'Walk-in', synonyms: ['walkin', 'office'] },
        { value: 'referral', label: 'Referral' },
      ],
      example: 'Walk-in',
    },
    {
      key: 'companyId',
      label: 'Insurer',
      kind: FIELD_KINDS.reference,
      resolverKey: 'company',
      example: 'HDFC ERGO',
    },
  ],
}

describe('normaliseHeading', () => {
  it('takes case, spaces, punctuation and the required marker out of a heading', () => {
    expect(normaliseHeading('Mobile No. *')).toBe('mobileno')
    expect(normaliseHeading('mobile_no')).toBe('mobileno')
    expect(normaliseHeading('  MOBILE  NO  ')).toBe('mobileno')
  })
})

describe('autoMap', () => {
  it('matches on the key, the label and the synonyms', () => {
    const result = autoMap(['Customer Name', 'Mobile No.', 'premium', 'Notes'], TEST_SPEC)
    expect(result.map).toEqual({ fullName: 0, mobile: 1, premium: 2 })
    expect(result.unmappedColumns).toEqual([3])
    expect(result.missingRequired).toEqual([])
  })

  it('names the required fields nothing was mapped to', () => {
    const result = autoMap(['Premium', 'Notes'], TEST_SPEC)
    expect(result.missingRequired).toEqual(['fullName', 'mobile'])
  })

  it('gives a heading two fields could take to the one the spec lists first', () => {
    // "Mobile" is a synonym of neither alternate; spec order decides.
    const result = autoMap(['Mobile', 'Alt mobile'], TEST_SPEC)
    expect(result.map).toEqual({ mobile: 0, altMobile: 1 })
  })

  it('maps a downloaded template back to itself, asterisks and all', () => {
    const template = templateSheet(TEST_SPEC)
    const result = autoMap(template.header, TEST_SPEC)
    expect(Object.keys(result.map).sort()).toEqual(TEST_SPEC.fields.map((f) => f.key).sort())
    expect(result.missingRequired).toEqual([])
    expect(result.unmappedColumns).toEqual([])
  })
})

describe('withMapping', () => {
  it('takes a column away from the field that had it, rather than sharing it', () => {
    const map = withMapping({ fullName: 0, mobile: 1 }, 'altMobile', 1)
    expect(map).toEqual({ fullName: 0, altMobile: 1 })
  })

  it('unmaps a field, and says so through missingRequired', () => {
    const map = withMapping({ fullName: 0, mobile: 1 }, 'mobile', null)
    expect(map).toEqual({ fullName: 0 })
    expect(missingRequired(map, TEST_SPEC)).toEqual(['mobile'])
    expect(unmappedColumns(map, ['A', 'B', 'C'])).toEqual([1, 2])
  })
})

describe('templateSheet', () => {
  it('marks required columns and carries a worked example row', () => {
    const sheet = templateSheet(TEST_SPEC)
    expect(sheet.header[0]).toBe('Full name *')
    expect(sheet.header[3]).toBe('Premium')
    expect(sheet.rows[0]?.[0]).toBe('Rakesh Patel')
    expect(templateFileName(TEST_SPEC, 'xlsx')).toBe('people-import-template.xlsx')
  })

  it('names every required field', () => {
    expect(requiredFields(TEST_SPEC).map((field) => field.key)).toEqual(['fullName', 'mobile'])
  })

  /**
   * The template is documentation, and documentation drifts. This is what stops
   * it: the example row must survive the importer's own validation.
   */
  it('offers an example row this importer would actually accept', () => {
    const sheet = parseCsv(toCsv(templateSheet(TEST_SPEC)))
    const map = autoMap(sheet.header, TEST_SPEC).map
    const report = validateRows(sheet, map, TEST_SPEC, {
      resolve: (resolverKey, raw) => (resolverKey === 'company' && raw !== '' ? 'cmp-1' : null),
    })
    expect(report.verdicts).toHaveLength(1)
    expect(report.verdicts[0]?.errors).toEqual([])
  })
})
