import { describe, expect, it } from 'vitest'
import { DEFAULT_FIXTURE_SEED, buildFixtures } from './index'
import type { FixtureSet } from './index'
import { createPrng } from './prng'

/**
 * Plan §8: "Generated deterministically from a fixed seed." The test that matters
 * is the boring one — build it twice and compare — because everything downstream
 * assumes it. A screenshot, a performance number and a failing assertion are all
 * unreproducible the moment a fixture shuffles between runs.
 */

function idsOf(set: FixtureSet, table: keyof FixtureSet): string[] {
  return (set[table] as readonly { readonly id: string }[]).map((row) => row.id)
}

describe('the generator', () => {
  it('produces the same numbers from the same seed', () => {
    const a = createPrng(42)
    const b = createPrng(42)
    const first = Array.from({ length: 20 }, () => a.next())
    const second = Array.from({ length: 20 }, () => b.next())

    expect(first).toEqual(second)
  })

  it('produces different numbers from different seeds', () => {
    const a = createPrng(42)
    const b = createPrng(43)

    expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(
      Array.from({ length: 10 }, () => b.next()),
    )
  })

  it('refuses a seed that is not a whole number, rather than quietly truncating it', () => {
    expect(() => createPrng(1.5)).toThrow(TypeError)
  })

  it('never reaches for Math.random', () => {
    // The guarantee is only worth as much as its weakest call site, so the whole
    // fixture build runs with Math.random replaced by something that throws.
    const original = Math.random
    Math.random = () => {
      throw new Error('A fixture reached for Math.random. Determinism is gone.')
    }

    try {
      expect(() => buildFixtures()).not.toThrow()
    } finally {
      Math.random = original
    }
  })
})

describe('the fixture set', () => {
  it('is identical across two builds with the same seed', () => {
    const first = buildFixtures()
    const second = buildFixtures()

    expect(second).toEqual(first)
  })

  it('is identical down to the serialised bytes, amounts included', () => {
    // `toEqual` is structural. This one catches an amount that lost its brand,
    // a date that became a Date object, a key that changed order in a record.
    expect(JSON.stringify(buildFixtures())).toEqual(JSON.stringify(buildFixtures()))
  })

  it('assigns the same ids to the same generated rows, every run', () => {
    const first = buildFixtures()
    const second = buildFixtures()

    for (const table of ['customers', 'policies', 'tasks'] as const) {
      expect(idsOf(second, table)).toEqual(idsOf(first, table))
    }
  })

  it('gives generated rows the same names and figures, not just the same ids', () => {
    const first = buildFixtures().customers.at(-1)
    const second = buildFixtures().customers.at(-1)

    expect(second?.fullName).toBe(first?.fullName)
    expect(second?.mobile).toBe(first?.mobile)
    expect(second?.createdAt).toBe(first?.createdAt)
  })

  it('changes when the seed changes, so the seed is doing something', () => {
    const standard = buildFixtures()
    const other = buildFixtures({ seed: DEFAULT_FIXTURE_SEED + 1 })

    expect(other.customers.at(-1)?.fullName).not.toBe(standard.customers.at(-1)?.fullName)
    // The story cast and the config seed are hand-written, so they must not move.
    expect(other.companies).toEqual(standard.companies)
    expect(other.inquiries).toEqual(standard.inquiries)
    expect(other.customers.slice(0, 7)).toEqual(standard.customers.slice(0, 7))
  })

  it('honours the volume it is asked for', () => {
    const small = buildFixtures({ volume: { customers: 5, policies: 3, tasks: 2 } })

    // Seven story customers plus five generated ones.
    expect(small.customers).toHaveLength(12)
    expect(small.tasks).toHaveLength(7)
  })

  it('does not move when the wall clock does, because it is anchored', () => {
    const before = buildFixtures()
    const after = buildFixtures()

    expect(after.customers.at(-1)?.createdAt).toBe(before.customers.at(-1)?.createdAt)
    expect(after.policies[0].expiryDate).toBe(before.policies[0].expiryDate)
  })
})
