/**
 * Seeing the discarded rows a queue hides by default.
 *
 * The repositories exclude a discarded record from every list unless the query
 * asks for it, which is the whole point of the discard: it stops appearing. That
 * default would be a trap without a way back — a record nobody can reach is
 * indistinguishable from one nobody kept — so every discardable queue offers
 * this filter, and because a queue's state lives in its URL the choice survives
 * a reload and can be sent to somebody else.
 *
 * The key mirrors the one the list adapter reads (`DISCARDED_FILTER_KEY` in
 * `src/data/mock/list.ts`). It is restated rather than imported so a feature
 * does not reach into an adapter it is meant to be swappable behind; the round
 * trip is asserted by the queue tests, which is what would catch a drift.
 */

import type { QueueFilter } from '../WorkQueue'

export const DISCARDED_FILTER_KEY = 'discarded'

export const DISCARDED_FILTER: QueueFilter = {
  key: DISCARDED_FILTER_KEY,
  label: 'Discarded',
  anyLabel: 'Live records',
  options: [
    { value: 'true', label: 'Discarded records' },
    { value: 'false', label: 'Live records only' },
  ],
}
