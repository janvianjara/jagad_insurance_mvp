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
import { FIXTURE_NOW, buildFixtures } from '../fixtures'
import type { FixtureOptions, FixtureSet } from '../fixtures'

/** One table per fixture collection, keyed by the row's own id. */
export type MockTables = {
  readonly [K in keyof FixtureSet]: Map<string, FixtureSet[K][number]>
}

export type MockStore = {
  readonly tables: MockTables
  readonly bus: EventBus
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
    bus,
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
