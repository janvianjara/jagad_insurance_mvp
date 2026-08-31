/**
 * The minimal ZIP container, because an `.xlsx` file is a ZIP of XML.
 *
 * No dependency was added for this, and none is needed. The writer emits
 * **stored** entries — method 0, no compression — which removes the compressor
 * entirely and leaves exactly one piece of real work, a CRC32. Excel, Numbers
 * and LibreOffice all open a stored-entry workbook; the file is larger than a
 * deflated one and, for a sheet of a few thousand rows, still small.
 *
 * The reader has to handle both, because the files an agency uploads were
 * written by Excel and Excel deflates. Method 8 is inflated with the platform's
 * own `DecompressionStream('deflate-raw')`, which is a browser primitive rather
 * than a library.
 *
 * The reader trusts the **central directory** rather than the local headers.
 * That is not fussiness: an entry written with a streaming data descriptor
 * carries zeroes for its sizes in the local header, and a reader that believes
 * them extracts nothing at all.
 */

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50

const METHOD_STORED = 0
const METHOD_DEFLATED = 8

const LOCAL_HEADER_SIZE = 30
const CENTRAL_HEADER_SIZE = 46
const EOCD_SIZE = 22

/** UTF-8 filenames. Bit 11 of the general-purpose flags; OOXML sets it. */
const FLAG_UTF8 = 0x0800

export type ZipEntry = {
  readonly name: string
  readonly data: Uint8Array
}

/* ------------------------------------------------------------------- CRC32 */

/**
 * The standard reversed-polynomial table (0xEDB88320), built once.
 *
 * Fifteen lines rather than a dependency, and the only arithmetic the writer
 * needs. `>>> 0` everywhere because JavaScript bitwise operators are signed and
 * a CRC is not.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/* ------------------------------------------------------------------ writing */

/**
 * A fixed timestamp rather than `new Date()`.
 *
 * Two exports of the same rows should be the same bytes; a clock in the header
 * makes them differ, which makes the writer untestable and makes a diff of two
 * downloads meaningless. 1980-01-01 00:00 is the earliest the DOS format can
 * express, and every tool shows it without complaint.
 */
const DOS_TIME = 0
const DOS_DATE = 33 // (1980-1980) << 9 | 1 << 5 | 1

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name)
}

class ByteWriter {
  private parts: Uint8Array[] = []
  private length = 0

  get offset(): number {
    return this.length
  }

  push(bytes: Uint8Array): void {
    this.parts.push(bytes)
    this.length += bytes.length
  }

  u16(value: number): void {
    const bytes = new Uint8Array(2)
    new DataView(bytes.buffer).setUint16(0, value & 0xffff, true)
    this.push(bytes)
  }

  u32(value: number): void {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
    this.push(bytes)
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length)
    let at = 0
    for (const part of this.parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }
}

/** Writes a ZIP with every entry stored. See the header note for why stored. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const writer = new ByteWriter()
  const directory: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const name = encodeName(entry.name)
    const crc = crc32(entry.data)
    const offset = writer.offset

    writer.u32(LOCAL_SIGNATURE)
    writer.u16(20)
    writer.u16(FLAG_UTF8)
    writer.u16(METHOD_STORED)
    writer.u16(DOS_TIME)
    writer.u16(DOS_DATE)
    writer.u32(crc)
    writer.u32(entry.data.length)
    writer.u32(entry.data.length)
    writer.u16(name.length)
    writer.u16(0)
    writer.push(name)
    writer.push(entry.data)

    directory.push({ name, crc, size: entry.data.length, offset })
  }

  const centralOffset = writer.offset
  for (const record of directory) {
    writer.u32(CENTRAL_SIGNATURE)
    writer.u16(20)
    writer.u16(20)
    writer.u16(FLAG_UTF8)
    writer.u16(METHOD_STORED)
    writer.u16(DOS_TIME)
    writer.u16(DOS_DATE)
    writer.u32(record.crc)
    writer.u32(record.size)
    writer.u32(record.size)
    writer.u16(record.name.length)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u32(0)
    writer.u32(record.offset)
    writer.push(record.name)
  }
  const centralSize = writer.offset - centralOffset

  writer.u32(EOCD_SIGNATURE)
  writer.u16(0)
  writer.u16(0)
  writer.u16(directory.length)
  writer.u16(directory.length)
  writer.u32(centralSize)
  writer.u32(centralOffset)
  writer.u16(0)

  return writer.toUint8Array()
}

/* ------------------------------------------------------------------ reading */

function findEndOfCentralDirectory(view: DataView): number {
  // The EOCD is last, but may be followed by a comment of up to 64 KB.
  const start = Math.max(0, view.byteLength - EOCD_SIZE - 0xffff)
  for (let at = view.byteLength - EOCD_SIZE; at >= start; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at
  }
  return -1
}

/**
 * Inflate, over the platform's own stream primitive.
 *
 * Written against `ReadableStream` rather than `new Blob(...).stream()` for a
 * portability reason worth keeping: jsdom ships a `Blob` without `.stream()`, so
 * the Blob spelling passes in a browser and throws under test — and an inflate
 * path that cannot be tested is an inflate path nobody has checked.
 */
export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot read compressed spreadsheets. Save the file as CSV and upload that instead.',
    )
  }

  // Copied into its own buffer: the caller hands in a subarray view over the
  // whole archive, and the stream's element type is pinned to a plain
  // ArrayBuffer-backed array by the DOM lib.
  const copy = new Uint8Array(bytes)
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(copy)
      controller.close()
    },
  })

  const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) {
      chunks.push(value)
      total += value.length
    }
  }

  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/**
 * Every entry in the archive, by path, decompressed.
 *
 * A workbook holds a handful of small parts, so reading all of them is cheaper
 * than indexing and seeking twice.
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) {
    throw new Error('This file is not a spreadsheet — no ZIP directory was found in it.')
  }

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const out = new Map<string, Uint8Array>()

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new Error('This spreadsheet is damaged — its file directory does not read.')
    }
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localOffset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + CENTRAL_HEADER_SIZE, at + CENTRAL_HEADER_SIZE + nameLength))

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`This spreadsheet is damaged — the entry "${name}" does not read.`)
    }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method === METHOD_STORED) {
      out.set(name, raw)
    } else if (method === METHOD_DEFLATED) {
      out.set(name, await inflateRaw(raw))
    } else {
      throw new Error(
        `This spreadsheet uses a compression method this reader does not support (${method}). Re-save it as .xlsx or .csv.`,
      )
    }

    at += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength
  }

  return out
}
