import { describe, expect, it } from 'vitest'

/**
 * The data boundary, asserted from this side of it — plan §14.1, FR-22.13.
 *
 * eslint already refuses an import from `src/domain` or from anywhere in
 * `src/data` other than `src/data/assistant`, and that is the enforcement that
 * matters. This test is the second lock: it reads the feature's own source and
 * fails on the same rule, so the guarantee survives a lint config that is
 * edited, a rule that is disabled inline, or a file that is somehow skipped.
 *
 * Two locks rather than one because §14.1's whole argument is that the boundary
 * has to hold in eighteen months, "long after everyone has forgotten this
 * conversation" — and a boundary with a single enforcement point is a boundary
 * with a single point of failure.
 */

const SOURCES: Record<string, string> = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function specifiersOf(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1])
}

const FILES = Object.keys(SOURCES).filter((path) => !path.includes('.test.'))

describe('the Assistant feature reads projections and nothing else', () => {
  it('has source to check', () => {
    expect(FILES.length).toBeGreaterThan(10)
  })

  it.each(FILES)('%s imports no entity type from the data layer', (path) => {
    for (const specifier of specifiersOf(SOURCES[path])) {
      if (!/(^|\/)data\//.test(specifier)) continue
      expect(specifier, `${path} may import only src/data/assistant`).toMatch(
        /(^|\/)data\/assistant$/,
      )
    }
  })

  it.each(FILES)('%s imports nothing from the domain layer', (path) => {
    for (const specifier of specifiersOf(SOURCES[path])) {
      expect(specifier, `${path} may not import src/domain`).not.toMatch(/(^|\/)domain\//)
    }
  })

  it.each(Object.keys(SOURCES))('%s carries no emoji', (path) => {
    expect(SOURCES[path]).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('the feature never produces a figure it was not given', () => {
  /**
   * D3 and FR-22.5 are kept structurally rather than by inspection. An amount
   * reaches a screen as one thing and one thing only: a `money` cell carrying
   * integer paise, rendered by `<Money>`. So the feature has no formatter of its
   * own, no currency string, and no way to build a `Money` — the domain module
   * that constructs and adds them is on the far side of a boundary it cannot
   * import. Nothing here can total two figures because nothing here can make one.
   */
  it.each(FILES)('%s formats no amount of its own', (path) => {
    expect(SOURCES[path]).not.toMatch(/formatINR|toLocaleString|Intl\.NumberFormat/)
    expect(SOURCES[path]).not.toMatch(/['"`]INR['"`]/)
  })

  it('routes every amount through the one cell that carries recorded paise', () => {
    const cells = FILES.filter((path) => /cell: 'money'/.test(SOURCES[path]))
    expect(cells.length).toBeGreaterThan(0)

    for (const path of cells) {
      // Always `?.paise ?? null` off a record, never a computed expression.
      for (const match of SOURCES[path].matchAll(/cell: 'money', paise: ([^}]+)}/g)) {
        expect(match[1]).not.toMatch(/[+*/]|\s-\s/)
      }
    }
  })
})
