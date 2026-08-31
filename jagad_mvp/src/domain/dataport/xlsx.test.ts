import { describe, expect, it } from 'vitest'
import { columnIndex, columnName, escapeXml, readXlsx, unescapeXml, writeXlsx } from './xlsx'
import { makeSheet } from './sheet'
import { crc32 } from './zip'

/* --------------------------------------------------------------- fixtures */

const encoder = new TextEncoder()

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  return bytes
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
  return bytes
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes)
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(copy)
      controller.close()
    },
  })
  const reader = source.pipeThrough(new CompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) chunks.push(value)
  }
  return concat(chunks)
}

/**
 * A ZIP whose entries are genuinely deflated — which is what every file Excel
 * writes looks like. The production writer stores rather than deflates, so
 * without this fixture the reader's method-8 path would never be exercised.
 */
async function deflatedZip(entries: readonly { name: string; text: string }[]): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const raw = encoder.encode(entry.text)
    const packed = await deflateRaw(raw)
    const crc = crc32(raw)

    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(8),
      u16(0),
      u16(33),
      u32(crc),
      u32(packed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      packed,
    ])
    locals.push(local)

    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(8),
        u16(0),
        u16(33),
        u32(crc),
        u32(packed.length),
        u32(raw.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }

  const body = concat(locals)
  const directory = concat(central)
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(body.length),
    u16(0),
  ])
  return concat([body, directory, eocd])
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'

/* ------------------------------------------------------------------ tests */

describe('A1 references', () => {
  it('counts in bijective base 26', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    expect(columnName(701)).toBe('ZZ')
    expect(columnName(702)).toBe('AAA')
  })

  it('reads a reference back to its column', () => {
    for (const index of [0, 1, 25, 26, 51, 701, 702, 1000]) {
      expect(columnIndex(`${columnName(index)}17`)).toBe(index)
    }
    expect(columnIndex('17')).toBe(-1)
  })
})

describe('XML escaping', () => {
  it('round trips the five entities', () => {
    const value = `A & B < C > D "quoted" 'single'`
    expect(unescapeXml(escapeXml(value))).toBe(value)
  })

  it('drops control characters XML cannot carry', () => {
    expect(escapeXml('a\u0000b\u001Fc')).toBe('abc')
    expect(escapeXml('keep\ttab\nnewline')).toBe('keep\ttab\nnewline')
  })

  it('decodes numeric character references', () => {
    expect(unescapeXml('&#65;&#x42;')).toBe('AB')
  })
})

describe('xlsx round trip', () => {
  it('survives quotes, commas, newlines, unicode and empty cells', async () => {
    const sheet = makeSheet(
      'Customers',
      ['Name', 'Note', 'City', 'Empty', 'Amount'],
      [
        ['Patel, Rakesh', 'He said "yes" & <no>', 'અમદાવાદ', '', '1248.50'],
        ['Meera', 'line one\nline two', 'Surat', '', ''],
        ['', '', '', '', '0.05'],
      ],
    )

    const back = await readXlsx(await writeXlsx(sheet))

    expect(back.name).toBe('Customers')
    expect(back.header).toEqual(sheet.header)
    expect(back.rows).toEqual(sheet.rows)
  })

  it('keeps a leading zero, because a policy number is not an integer', async () => {
    const sheet = makeSheet('S', ['Policy'], [['00742']])
    const back = await readXlsx(await writeXlsx(sheet))
    expect(back.rows[0]).toEqual(['00742'])
  })

  it('names the worksheet legally even when the caller does not', async () => {
    const back = await readXlsx(await writeXlsx(makeSheet('a/b:c*d?e[f]g', ['A'], [['1']])))
    expect(back.name).toBe('a b c d e f g')
  })
})

describe('reading files this writer did not produce', () => {
  const SHARED =
    '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'count="3" uniqueCount="3"><si><t>Name</t></si><si><t>City</t></si>' +
    '<si><t>Rakesh &amp; Sons</t></si></sst>'

  /**
   * The sparse case, which is where naive readers break: row 2 declares C before
   * A, and row 3 is missing entirely.
   */
  const SHEET =
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="C2"><v>45383</v></c><c r="A2" t="s"><v>2</v></c></row>' +
    '<row r="4"><c r="B4" t="inlineStr"><is><t>Sur</t><t>at</t></is></c></row>' +
    '</sheetData></worksheet>'

  const WORKBOOK =
    '<?xml version="1.0"?><workbook><sheets><sheet name="Book" sheetId="1" r:id="rId1"/></sheets></workbook>'

  it('inflates deflated entries, resolves shared strings and honours A1 references', async () => {
    const bytes = await deflatedZip([
      { name: '[Content_Types].xml', text: CONTENT_TYPES },
      { name: 'xl/workbook.xml', text: WORKBOOK },
      { name: 'xl/sharedStrings.xml', text: SHARED },
      { name: 'xl/worksheets/sheet1.xml', text: SHEET },
    ])

    const sheet = await readXlsx(bytes)

    expect(sheet.name).toBe('Book')
    expect(sheet.header).toEqual(['Name', 'City', ''])
    // C2 lands in column three, not column one, however the XML ordered it.
    expect(sheet.rows[0]).toEqual(['Rakesh & Sons', '', '45383'])
    // Row 3 is absent from the file, so it is a blank row and row 4 stays row 4.
    expect(sheet.rows[1]).toEqual(['', '', ''])
    expect(sheet.rows[2]).toEqual(['', 'Surat', ''])
  })

  it('refuses a file that is not a ZIP at all', async () => {
    await expect(readXlsx(encoder.encode('Name,Mobile\nRakesh,982'))).rejects.toThrow(
      /not a spreadsheet/i,
    )
  })

  it('refuses a workbook with no first worksheet', async () => {
    const bytes = await deflatedZip([{ name: '[Content_Types].xml', text: CONTENT_TYPES }])
    await expect(readXlsx(bytes)).rejects.toThrow(/no first worksheet/i)
  })
})
