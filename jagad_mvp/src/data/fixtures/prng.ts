/**
 * The seeded generator — plan §8, fixture strategy.
 *
 * "Generated deterministically from a fixed seed" is not a nicety. A volume set
 * that shuffles between runs makes every screenshot, every performance
 * measurement and every failing test unreproducible, and it makes a bug that
 * only appears for one generated customer impossible to walk back to.
 *
 * So `Math.random` is not used anywhere in this layer. This is mulberry32: thirty
 * lines, no dependencies, identical output for identical seeds on every engine.
 * It is not cryptographic and must never be used for a token that matters — the
 * consent-link tokens in the story cast are written out by hand for that reason.
 */

export type Prng = {
  /** A float in [0, 1). */
  next(): number
  /** A whole number in [min, max], both ends included. */
  int(min: number, max: number): number
  /** One item, chosen uniformly. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T
  /** True with the given probability. */
  chance(probability: number): boolean
  /** A copy of the list in a shuffled order. The input is left alone. */
  shuffle<T>(items: readonly T[]): T[]
  /** `count` distinct items, in list order, when count is smaller than the list. */
  sample<T>(items: readonly T[], count: number): T[]
}

const UINT32 = 0x100000000

export function createPrng(seed: number): Prng {
  if (!Number.isInteger(seed)) {
    throw new TypeError(`A fixture seed must be a whole number, received ${seed}.`)
  }

  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / UINT32
  }

  function int(min: number, max: number): number {
    if (max < min) {
      throw new RangeError(`int(${min}, ${max}) has an empty range.`)
    }
    return min + Math.floor(next() * (max - min + 1))
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty list.')
    }
    return items[int(0, items.length - 1)]
  }

  function chance(probability: number): boolean {
    return next() < probability
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i)
      const swap = copy[i]
      copy[i] = copy[j]
      copy[j] = swap
    }
    return copy
  }

  function sample<T>(items: readonly T[], count: number): T[] {
    if (count >= items.length) return [...items]
    const chosen = new Set<number>()
    while (chosen.size < count) {
      chosen.add(int(0, items.length - 1))
    }
    return items.filter((_, index) => chosen.has(index))
  }

  return { next, int, pick, chance, shuffle, sample }
}

/**
 * The seed the app and the tests both use. Changing it changes every generated
 * id, so it is a deliberate act rather than a parameter somebody tweaks.
 */
export const DEFAULT_FIXTURE_SEED = 20260826
