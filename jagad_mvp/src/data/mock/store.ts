/**
 * The in-memory store — plan §7, "a mock adapter behind the repository
 * interfaces".
 *
 * One `Map` per fixture table, keyed by id and holding insertion order, plus the
 * event bus every transition emits on. The bus matters more than the maps: an
 * audit sink is attached at creation, so the event log is complete by
 * construction rather than because every call site remembered to log — which is
 * exactly the property FR-20.4's append-only store needs and exactly the property
 * the audit timeline renders.
 *
 * The store is created once and handed to the repositories. Nothing outside
 * `src/data/mock/` touches it, and nothing anywhere writes to a table without
 * going through a machine first.
 */

import { createEventBus } from '../../domain/events'
import type { DomainEvent, EventBus } from '../../domain/events'
import { createIdCounter, parseSystemNo } from '../../domain/ids'
import type { IdCounter, RecordPrefix } from '../../domain/ids'
import { FIXTURE_NOW, buildFixtures } from '../fixtures'
import type { FixtureOptions, FixtureSet } from '../fixtures'
import type { EraseRequest } from '../repo/erasure'

/** One table per fixture collection, keyed by the row's own id. */
export type MockTables = {
  readonly [K in keyof FixtureSet]: Map<string, FixtureSet[K][number]>
}

export type MockStore = {
  readonly tables: MockTables
  /**
   * The erasure register — FR-20.2, and the one table with no fixture behind it.
   *
   * Every table above is hydrated from the fixture set, which is the agency's
   * book as it stands. An erase request is not part of a book: it is something a
   * data principal did, and seeding one would assert that somebody asked to be
   * erased when nobody has — the same lie `recipeRuns` refuses to tell by staying
   * deliberately empty. So it lives beside the tables rather than in them, empty
   * at boot and written only by `eraseRequests.request`.
   */
  readonly eraseRequests: Map<string, EraseRequest>
  readonly bus: EventBus
  /**
   * The sequence a created record draws its `systemNo` from, seeded from the
   * highest number each prefix already holds. A record captured at runtime
   * therefore continues the platform's own series rather than starting a second
   * one, and — because the seed is read off the fixtures — two stores built from
   * the same fixture set number their creations identically.
   */
  readonly ids: IdCounter
  /** Injected so a fixture build, a test and the app can each pin their own clock. */
  now(): Date
  /** Every event emitted since the store was built, oldest first. */
  events(): readonly DomainEvent[]
  /** The audit timeline for one record. */
  eventsFor(entity: string, id: string): readonly DomainEvent[]
}

export type MockStoreOptions = {
  readonly fixtures?: FixtureSet
  readonly fixtureOptions?: FixtureOptions
  /**
   * The clock the bus stamps events with. Defaults to the fixture anchor rather
   * than to the wall clock, so a test comparing two runs gets two identical logs.
   */
  readonly now?: () => Date
}

type MutableTables = { [K in keyof FixtureSet]: Map<string, FixtureSet[K][number]> }

function tableOf<T extends { readonly id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

function hydrate(fixtures: FixtureSet): MockTables {
  const tables: Partial<MutableTables> = {}
  for (const key of Object.keys(fixtures) as (keyof FixtureSet)[]) {
    // Every fixture row carries an `id`, which is what makes one generic
    // hydration correct rather than thirty hand-written ones.
    const rows = fixtures[key] as readonly { readonly id: string }[]
    ;(tables as Record<string, Map<string, unknown>>)[key] = tableOf(rows)
  }
  return tables as MockTables
}

/**
 * The counter, seeded from what is already on the books.
 *
 * Every numbered row carries `systemNo`, and `parseSystemNo` splits it back into
 * a prefix and a sequence, so one pass over the tables finds the high-water mark
 * per prefix without a per-entity list to keep in step. `POL` and `POL-DRAFT`
 * count independently, which is exactly what §8 asks for.
 */
function seedIdCounter(tables: MockTables): IdCounter {
  const seeds: Partial<Record<RecordPrefix, number>> = {}

  for (const table of Object.values(tables) as Map<string, unknown>[]) {
    for (const row of table.values()) {
      const value = (row as { readonly systemNo?: unknown }).systemNo
      if (typeof value !== 'string') continue
      const parsed = parseSystemNo(value)
      if (!parsed) continue
      seeds[parsed.prefix] = Math.max(seeds[parsed.prefix] ?? 0, parsed.sequence)
    }
  }

  return createIdCounter(seeds)
}

export function createMockStore(options: MockStoreOptions = {}): MockStore {
  const fixtures = options.fixtures ?? buildFixtures(options.fixtureOptions)
  const now = options.now ?? (() => FIXTURE_NOW)
  const tables = hydrate(fixtures)

  const log: DomainEvent[] = []
  const bus = createEventBus({ now })
  bus.onAudit((event) => {
    log.push(event)
  })

  return {
    tables,
    eraseRequests: new Map<string, EraseRequest>(),
    bus,
    ids: seedIdCounter(tables),
    now,
    events() {
      return log
    },
    eventsFor(entity, id) {
      return log.filter((event) => event.subject?.entity === entity && event.subject.id === id)
    },
  }
}

/** The rows of a table, in insertion order. */
export function rowsOf<T>(table: Map<string, T>): readonly T[] {
  return [...table.values()]
}
