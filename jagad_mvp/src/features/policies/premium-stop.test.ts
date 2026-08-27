import { describe, expect, it } from 'vitest'
import { money } from '../../domain/money'
import { CAST, WALKTHROUGH_NOW, WHO, freshRepositories } from './test-harness'

/**
 * The record-only stop, asserted in the source itself.
 *
 * A rule you can only keep by remembering it is a rule you will eventually
 * break. D3 is the most expensive rule in this product to break — a premium the
 * platform worked out is indistinguishable, once recorded, from a premium a
 * person read off an insurer's document, and the day somebody notices is the day
 * a customer disputes a figure nobody can source. It is also, unhappily, the
 * easiest rule to break by accident and in good faith: a reviewer sees an empty
 * Final beside a perfectly good derived total and adds four characters that copy
 * one into the other, and every test in this feature still passes.
 *
 * So the rule is not left to memory or to review. This file reads the feature's
 * own source and fails on the shape of the mistake rather than on its effect:
 * `src/features/policies/` performs no Money arithmetic at all, because it never
 * names the functions that perform it. `<RollUp>` does the only arithmetic the
 * product allows, on the far side of `src/components/guardrails/`, and it
 * renders that arithmetic rather than returning it — so there is no value for
 * this feature to catch even if it wanted one.
 *
 * The second half is the same argument at the seam. `computed` is a provenance
 * the machine refuses, and this feature cannot express it: the string does not
 * occur in the feature's code, and `TypedPremiumSource` leaves it unrepresentable
 * at the desk. A guard that nothing can reach is a guard nobody maintains, so the
 * last test here reaches past the desk to the repository and proves the refusal
 * is live rather than merely theoretical.
 *
 * Test files are read out of the scan on purpose. A test may build a Money to
 * type into a control, and this file has to write `computed` in order to prove
 * the machine refuses it. Excluding them keeps the assertion about the product's
 * code, which is the only code that ships.
 */

const SOURCES = import.meta.glob('/src/features/policies/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>

const FILES = Object.keys(SOURCES).filter((path) => !/\.test\.tsx?$/.test(path))

/**
 * Prose is free to name what the code may not. Every one of these files argues
 * for its own design in a doc comment, and forbidding the word `computed` in an
 * explanation of why `computed` is forbidden would make the rule unexplainable.
 * So the assertions run against code with its comments taken out.
 */
function withoutComments(source: string): string {
  const kept: string[] = []
  let inBlock = false

  for (const line of source.split('\n')) {
    let rest = line

    if (inBlock) {
      const close = rest.indexOf('*/')
      if (close === -1) continue
      rest = rest.slice(close + 2)
      inBlock = false
    }

    for (;;) {
      const open = rest.indexOf('/*')
      if (open === -1) break
      const close = rest.indexOf('*/', open + 2)
      if (close === -1) {
        rest = rest.slice(0, open)
        inBlock = true
        break
      }
      rest = `${rest.slice(0, open)}${rest.slice(close + 2)}`
    }

    kept.push(rest.replace(/(^|[^:])\/\/.*$/, '$1'))
  }

  return kept.join('\n')
}

const CODE: Readonly<Record<string, string>> = Object.fromEntries(
  FILES.map((path) => [path, withoutComments(SOURCES[path])]),
)

/** Every way this codebase has of building or adding a Money. */
const ARITHMETIC: readonly RegExp[] = [/\bsumMoney\b/, /\baddMoney\b/, /\bfromPaise\b/, /\bmoney\(/]

describe('the policy feature performs no money arithmetic', () => {
  it('has source to check', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4)
  })

  it.each(FILES)('%s neither imports nor calls a Money operation', (path) => {
    for (const forbidden of ARITHMETIC) {
      expect(
        CODE[path],
        `${path} may not perform Money arithmetic; <RollUp> renders the only sum the product allows.`,
      ).not.toMatch(forbidden)
    }
  })

  it.each(FILES)('%s cannot name the provenance the machine refuses', (path) => {
    expect(
      CODE[path],
      `${path} may not express a computed premium; the feature types every figure it records.`,
    ).not.toMatch(/\bcomputed\b/)
  })
})

describe('the guard behind the stop is live', () => {
  it('refuses a Final Premium marked as computed, and accepts the same figure typed', async () => {
    const repositories = freshRepositories()

    const refused = await repositories.policies.issue(CAST.directDraft, {
      actorId: WHO.priya,
      finalPremium: money(24_500),
      finalPremiumSource: 'computed',
      now: WALKTHROUGH_NOW,
    })

    expect(refused.ok).toBe(false)
    expect(refused.ok ? '' : refused.reason).toBe(
      'Final Premium is marked as computed. This figure is typed from the insurer, never derived from anything the platform holds.',
    )

    // The same policy and the same figure, and the only difference is where it
    // came from — so the refusal above is about provenance and nothing else.
    const allowed = await repositories.policies.issue(CAST.directDraft, {
      actorId: WHO.priya,
      finalPremium: money(24_500),
      finalPremiumSource: 'typed',
      now: WALKTHROUGH_NOW,
    })

    expect(allowed.ok).toBe(true)
    expect(allowed.ok ? allowed.record.finalPremium : null).toEqual({
      paise: 2_450_000,
      currency: 'INR',
    })
  })
})
