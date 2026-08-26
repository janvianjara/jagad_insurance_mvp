/**
 * Simulated latency — plan §8, "Fixtures live behind the repository layer with
 * simulated latency, so loading, empty and error states get built rather than
 * discovered in UAT."
 *
 * The playbook asks for 150 to 400 milliseconds. An in-memory store that answers
 * instantly produces screens with no loading state, and the first time anybody
 * sees one is when a real API is plugged in and every list flashes.
 *
 * Both halves of the delay are injectable, and that is the point of this file
 * rather than an inline `setTimeout`. A test suite that actually slept would add
 * a minute per hundred assertions, so tests pass `NO_LATENCY` and get a resolved
 * promise with no timer at all — deterministic, and instant.
 */

export type LatencyProfile = {
  readonly minMs: number
  readonly maxMs: number
}

/** The profile the running app uses. */
export const DEFAULT_LATENCY: LatencyProfile = { minMs: 150, maxMs: 400 }

/** What the test suite uses: no timer, no wait, no flake. */
export const NO_LATENCY: LatencyProfile = { minMs: 0, maxMs: 0 }

export type LatencyOptions = {
  /**
   * Where the jitter comes from. Defaults to `Math.random`, which is fine here
   * because nothing depends on the exact delay — but a test that wants a fixed
   * one passes a seeded generator instead.
   */
  readonly random?: () => number
  readonly sleep?: (ms: number) => Promise<void>
}

export type Latency = {
  readonly profile: LatencyProfile
  /** The delay this call would use, without waiting for it. */
  next(): number
  wait(): Promise<void>
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function createLatency(
  profile: LatencyProfile = DEFAULT_LATENCY,
  options: LatencyOptions = {},
): Latency {
  const { minMs, maxMs } = profile
  if (minMs < 0 || maxMs < minMs) {
    throw new RangeError(`Latency profile is not a range: ${minMs}ms to ${maxMs}ms.`)
  }

  const random = options.random ?? Math.random
  const sleep = options.sleep ?? defaultSleep

  function next(): number {
    if (maxMs === 0) return 0
    return Math.round(minMs + random() * (maxMs - minMs))
  }

  return {
    profile,
    next,
    async wait() {
      const delay = next()
      // Zero means zero: no timer is scheduled, so a suite using NO_LATENCY does
      // not queue eight hundred macrotasks it then has to flush.
      if (delay <= 0) return
      await sleep(delay)
    },
  }
}
