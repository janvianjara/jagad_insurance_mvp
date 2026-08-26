/**
 * The mock adapter — plan §7, the only implementation of the repository
 * interfaces in the MVP.
 *
 * One call builds the whole set: an in-memory store hydrated from the fixtures,
 * a latency profile in front of every method, and eighteen repositories that
 * share both. Swapping in a real API later means writing a second
 * `createRepositories` and changing one line at the composition root — no screen
 * knows which one it is talking to.
 *
 * The test seam is the two options. `latency: NO_LATENCY` removes the wait
 * entirely, and passing a `store` lets a test build one, act on it, and inspect
 * `store.events()` afterwards to assert that a transition emitted what §9 says it
 * emits.
 */

import type { Repositories } from '../repo'
import { createCatalogueRepositories } from './catalogue'
import { createContractRepositories } from './contract'
import { createLatency, DEFAULT_LATENCY } from './latency'
import type { Latency, LatencyOptions, LatencyProfile } from './latency'
import { createPipelineRepositories } from './pipeline'
import { createMockStore } from './store'
import type { MockStore, MockStoreOptions } from './store'

export * from './latency'
export * from './list'
export * from './move'
export * from './store'

export type MockRepositoriesOptions = MockStoreOptions & {
  /** Pass an existing store to keep a handle on the tables and the event log. */
  readonly store?: MockStore
  readonly latency?: LatencyProfile
  readonly latencyOptions?: LatencyOptions
}

export type MockRepositories = Repositories & {
  /** The store behind them. Tests read it; screens never do. */
  readonly store: MockStore
  readonly latency: Latency
}

export function createMockRepositories(
  options: MockRepositoriesOptions = {},
): MockRepositories {
  const store = options.store ?? createMockStore(options)
  const latency = createLatency(options.latency ?? DEFAULT_LATENCY, options.latencyOptions)
  const deps = { store, latency }

  const catalogue = createCatalogueRepositories(deps)
  const pipeline = createPipelineRepositories(deps)
  const contract = createContractRepositories(deps)

  return { ...catalogue, ...pipeline, ...contract, store, latency }
}
