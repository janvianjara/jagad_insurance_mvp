import { describe, expect, it } from 'vitest'
import { CSV_DELIMITERS, detectDelimiter, parseCsv, parseCsvRows, stripBom, toCsv } from './csv'
import { makeSheet } from './sheet'

/**
 * RFC 4180 is short and every clause of it is something a real agency file
 * contains. These are the clauses.
 */
describe('parseCsv', () => {
  it('reads a plain file into a header and rows', () => {
    const sheet = parseCsv('Name,Mobile\nRakesh,9825012345\nMeera,9898098980\n')
    expect(sheet.header).toEqual(['Name', 'Mobile'])
    expect(sheet.rows).toEqual([
      ['Rakesh', '9825012345'],
      ['Meera', '9898098980'],
    ])
  })

  it('does not invent a blank row for the trailing newline', () => {
    expect(parseCsv('A,B\n1,2\n').rows).toHaveLength(1)
    expect(parseCsv('A,B\r\n1,2\r\n').rows).toHaveLength(1)
  })

  it('keeps a quoted comma inside its field', () => {
    expect(parseCsv('A,B\n"Patel, Rakesh",9825012345\n').rows[0]).toEqual([
      'Patel, Rakesh',
      '9825012345',
    ])
  })

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('A\n"He said ""yes"""\n').rows[0]).toEqual(['He said "yes"'])
  })

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('A,B\n"line one\nline two",x\n').rows[0]).toEqual(['line one\nline two', 'x'])
  })

  it('strips the byte-order mark Excel writes', () => {
    const sheet = parseCsv('\ufeffName,Mobile\nRakesh,9825012345\n')
    expect(sheet.header[0]).toBe('Name')
    expect(stripBom('\ufeffx')).toBe('x')
  })

  it('pads a short row out to the header width', () => {
    expect(parseCsv('A,B,C\n1\n').rows[0]).toEqual(['1', '', ''])
  })

  it('does not trim, because trimming rewrites data nobody has seen', () => {
    expect(parseCsvRows('" 007 "', ',')[0]).toEqual([' 007 '])
  })
})

describe('detectDelimiter', () => {
  it('finds the semicolon a European Excel writes', () => {
    expect(detectDelimiter('Name;Mobile;City\nA;B;C')).toBe(CSV_DELIMITERS.semicolon)
  })

  it('finds a tab', () => {
    expect(detectDelimiter('Name\tMobile\nA\tB')).toBe(CSV_DELIMITERS.tab)
  })

  it('ignores separators inside quotes on the header line', () => {
    expect(detectDelimiter('"Name; not a column",Mobile\nA,B')).toBe(CSV_DELIMITERS.comma)
  })

  it('falls back to the comma', () => {
    expect(detectDelimiter('OneColumn\nvalue')).toBe(CSV_DELIMITERS.comma)
  })
})

describe('CSV round trip', () => {
  it('survives quotes, commas, newlines, unicode and empty cells', () => {
    const sheet = makeSheet(
      'Customers',
      ['Name', 'Note', 'City', 'Empty'],
      [
        ['Patel, Rakesh', 'He said "yes"', 'અમદાવાદ', ''],
        ['Meera', 'line one\r\nline two', 'Surat', ''],
        ['', '', '', ''],
      ],
    )
    const back = parseCsv(toCsv(sheet))
    expect(back.header).toEqual(sheet.header)
    // The CRLF inside the quoted field is preserved by the writer and read back
    // as a record separator would never be.
    expect(back.rows[0]).toEqual(['Patel, Rakesh', 'He said "yes"', 'અમદાવાદ', ''])
    expect(back.rows[1]?.[1]).toBe('line one\r\nline two')
    expect(back.rows).toHaveLength(3)
  })

  it('writes the byte-order mark by default so Excel reads UTF-8', () => {
    expect(toCsv(makeSheet('S', ['A'], [['અ']]))).toMatch(/^\ufeff/)
    expect(toCsv(makeSheet('S', ['A'], [['અ']]), { bom: false })).not.toMatch(/^\ufeff/)
  })

  it('round trips through a semicolon delimiter', () => {
    const sheet = makeSheet('S', ['A', 'B'], [['1;2', '3']])
    const text = toCsv(sheet, { delimiter: CSV_DELIMITERS.semicolon })
    expect(parseCsv(text).rows[0]).toEqual(['1;2', '3'])
  })
})
