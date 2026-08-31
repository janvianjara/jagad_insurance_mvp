/**
 * The collections module's public surface — FR-08.3's verification queue.
 *
 * The screen is reached through `routes.ts`, which is the only file the router
 * touches. What is exported here is the vocabulary another module might need to
 * say "a collection awaiting verification" in the same words this one does — the
 * labels, the tones and the desk. The waiting state set itself is not re-exported
 * from here: it belongs to `src/features/backoffice/queues.ts`, which is where
 * the ops board counts it from, and a second export would invite a second copy.
 */
export { collectionDesk, isBackOfficeVerifier } from './data/collection-desk'
export type { CollectionDesk } from './data/collection-desk'
export {
  COLLECTION_LABEL,
  COLLECTION_TONE,
  INSTRUMENT_LABEL,
  MODE_LABEL,
  ROUTE_LABEL,
  VERIFICATION_AGE_LIMIT_DAYS,
  blocksClosure,
  canBounce,
  collectionSeverity,
  daysWaiting,
} from './collection-view'
export { collectionQueueConfig } from './queue-config'
export type { CollectionQueueDeps } from './queue-config'
