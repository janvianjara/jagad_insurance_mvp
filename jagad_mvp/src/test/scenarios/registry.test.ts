import { describe, expect, it } from 'vitest'
import canvasHtml from '../../../documents/jagad_workflow_canvas.html?raw'
import playbook from '../../../documents/BUILD_PLAYBOOK.md?raw'
import {
  FLOW_TITLES,
  PHASES,
  SCENARIOS,
  claimedTests,
  m0Rows,
  rowById,
  rowsInState,
} from './registry'
import type { TestRef } from './registry'

/**
 * The rule that stops the registry becoming fiction.
 *
 * A coverage list is only worth reading if it cannot be improved by editing it.
 * So nothing here trusts the registry: the rows are read back out of the canvas
 * that is the acceptance matrix, and every test the registry names is read back
 * out of the file it says holds it. Renaming a test, deleting one, or claiming
 * one that was never written all fail here, by name.
 *
 * `tsconfig.app.json` carries only `vite/client` types, so `node:fs` is not
 * available under `src/`. Both documents and every test file are pulled in as
 * text through Vite instead, which is the same mechanism the app itself uses.
 */

/** Every test file in the repository, as source text. Nothing is executed. */
const SOURCES = import.meta.glob('/src/**/*.{test,spec}.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>

const HERE = 'src/test/scenarios/'

/* --------------------------------------------------------- the canvas itself */

type CanvasRow = {
  readonly id: string
  readonly flow: number
  readonly title: string
  readonly given: string
  readonly when: string
  readonly then: string
}

/**
 * Reads the 48 rows out of the canvas's own `FLOWS` array.
 *
 * The canvas is a single HTML file whose scenario tab is rendered from a literal
 * at the bottom of it. Parsing that literal rather than keeping a copy is the
 * whole point: there is one source of the matrix, and it is the file the client
 * was shown.
 */
function canvasRows(): readonly CanvasRow[] {
  const start = canvasHtml.indexOf('const FLOWS=[')
  expect(start, 'The canvas no longer contains a FLOWS array.').toBeGreaterThan(-1)
  const block = canvasHtml.slice(start, canvasHtml.indexOf('];', start))

  const rows: CanvasRow[] = []
  let flow = 0
  let index = 0
  let title = ''

  for (const line of block.split('\n')) {
    const header = /^\["(.*?)","(.*?)",\[$/.exec(line)
    if (header) {
      flow += 1
      index = 0
      title = header[1] as string
      continue
    }
    const row = /^\["([^"]*)","([^"]*)","([^"]*)"\]/.exec(line)
    if (!row) continue
    index += 1
    rows.push({
      id: `${flow}.${index}`,
      flow,
      title,
      given: row[1] as string,
      when: row[2] as string,
      then: row[3] as string,
    })
  }

  return rows
}

function sourceOf(ref: TestRef): string {
  const source = SOURCES[`/${ref.file}`]
  expect(source, `The registry names ${ref.file}, which is not a test file in this repository.`)
    .toBeDefined()
  return source as string
}

describe('the registry is the canvas, not a paraphrase of it', () => {
  it('lists every one of the 48 rows, once, under the id the canvas gives it', () => {
    const rows = canvasRows()
    expect(rows).toHaveLength(48)

    expect(SCENARIOS.map((row) => row.id)).toEqual(rows.map((row) => row.id))
    expect(new Set(SCENARIOS.map((row) => row.id)).size).toBe(SCENARIOS.length)
  })

  it('quotes each row word for word, so a canvas edit cannot pass unnoticed', () => {
    for (const row of canvasRows()) {
      const entry = rowById(row.id)
      expect(entry, `The registry has no row ${row.id}.`).toBeDefined()
      expect({
        given: entry?.given,
        when: entry?.when,
        then: entry?.then,
        flow: entry?.flow,
      }).toEqual({ given: row.given, when: row.when, then: row.then, flow: row.flow })
    }
  })

  it('titles the seven flows as the canvas titles them', () => {
    for (const row of canvasRows()) {
      expect(FLOW_TITLES[row.flow]).toBe(row.title)
    }
  })
})

describe('a row cannot claim a test that does not exist', () => {
  it('finds every named test, by its exact title, in the file it is claimed to be in', () => {
    const claimed = claimedTests()
    expect(claimed.length).toBeGreaterThan(0)

    for (const ref of claimed) {
      const source = sourceOf(ref)
      // The title as `it(...)` was given it. A rename breaks this, which is the
      // point: a renamed test is a row whose evidence has moved.
      expect(
        source.includes(ref.name),
        `${ref.file} contains no test titled "${ref.name}".`,
      ).toBe(true)
      expect(
        /\bit\(/.test(source),
        `${ref.file} declares no tests at all.`,
      ).toBe(true)
    }
  })

  it('puts covered-here rows in this directory and covered-elsewhere rows outside it', () => {
    for (const row of SCENARIOS) {
      if (row.coverage.state === 'covered-here') {
        for (const ref of row.coverage.tests) {
          expect(ref.file.startsWith(HERE), `${row.id} claims ${ref.file} as covered-here.`).toBe(
            true,
          )
        }
      }
      if (row.coverage.state === 'covered-elsewhere') {
        expect(
          row.coverage.tests.some((ref) => !ref.file.startsWith(HERE)),
          `${row.id} is covered-elsewhere but names no test outside ${HERE}.`,
        ).toBe(true)
      }
    }
  })

  it('gives every covered row at least one test', () => {
    for (const row of SCENARIOS) {
      if (row.coverage.state === 'pending') continue
      expect(row.coverage.tests.length, `${row.id} is marked covered with no test.`).toBeGreaterThan(
        0,
      )
    }
  })
})

describe('a pending row says who will cover it, and why nobody has', () => {
  it('names a step the playbook actually contains, or a phase the plan actually ships', () => {
    for (const row of SCENARIOS) {
      if (row.coverage.state !== 'pending') continue
      const { step } = row.coverage
      const known =
        (PHASES as readonly string[]).includes(step) ||
        playbook.includes(`### ${step} —`) ||
        playbook.includes(`### ${step} `)
      expect(known, `${row.id} is pending against "${step}", which is neither a step nor a phase.`)
        .toBe(true)
    }
  })

  it('gives a reason, not a shrug', () => {
    for (const row of SCENARIOS) {
      if (row.coverage.state !== 'pending') continue
      expect(row.coverage.why.length, `${row.id} is pending with no reason.`).toBeGreaterThan(30)
    }
  })

  it('never lets a pending row point at a step earlier than this one for an M0 row', () => {
    // P-17 is the last step. An M0 row pending against a step that has already
    // shipped would mean the step lied about being done.
    const shipped = ['P-11', 'P-12', 'P-14']
    for (const row of m0Rows()) {
      if (row.coverage.state !== 'pending') continue
      expect(
        shipped.includes(row.coverage.step),
        `${row.id} is pending against ${row.coverage.step}, which the playbook has already closed.`,
      ).toBe(false)
    }
  })
})

describe('what M0 demonstrates', () => {
  it('accounts for every M0 row as covered or pending against a remaining step', () => {
    const rows = m0Rows()
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      if (row.coverage.state === 'pending') {
        expect(
          ['P-13', 'P-15', 'P-16'],
          `${row.id} is an M0 row pending against ${row.coverage.step}.`,
        ).toContain(row.coverage.step)
      }
    }
  })

  it('holds the headline this file opens with, so the summary cannot rot', () => {
    // The doc comment at the top of registry.ts states these numbers. A comment
    // that states a count and is never checked is a comment that goes wrong.
    expect(SCENARIOS).toHaveLength(48)
    expect(m0Rows()).toHaveLength(21)
    expect(rowsInState('covered-here')).toHaveLength(3)
    expect(rowsInState('covered-elsewhere')).toHaveLength(32)

    // Nothing in M0 is pending any more. Canvas flow 2 was the last block
    // outstanding — P-13 built the screens and the quotation tests now walk every
    // row of it — so the golden path owes nothing. This stays an assertion rather
    // than becoming a deleted test: the day a new M0 row is added un-walked, this
    // is what says so.
    const m0Pending = m0Rows().filter((row) => row.coverage.state === 'pending')
    expect(m0Pending.map((row) => row.id)).toEqual([])
  })

  it('leaves nothing in a phase the plan does not have', () => {
    for (const row of SCENARIOS) {
      expect(PHASES).toContain(row.phase)
    }
  })

  it('covers every admin-configuration row that has a screen to walk', () => {
    // Canvas flow 6 is the one M0 flow that is entirely buildable today except
    // for the two rows whose screens are P1. If that stops being true, this says so.
    const flowSix = SCENARIOS.filter((row) => row.flow === 6)
    expect(flowSix).toHaveLength(5)

    const walkable = flowSix.filter((row) => row.phase === 'M0')
    expect(walkable.map((row) => row.id)).toEqual(['6.1', '6.3', '6.4'])
    for (const row of walkable) {
      expect(row.coverage.state, `${row.id} is an M0 configuration row and is not covered.`).toBe(
        'covered-here',
      )
    }
  })
})
