/**
 * The automation core — plan §7 ("let mock recipes subscribe"), FR-21.
 *
 * Pure and framework-free, like the rest of `src/domain`. Nothing here reads a
 * repository, opens a socket or sends a message: it decides what should fire, and
 * the runtime in `src/data/automation/` is the piece that binds it to a bus, a
 * timer and the desks.
 *
 * Six parts, and they are separable on purpose. `ladder` reads rungs off a
 * recipe. `ticks` says which rungs have passed. `elapsed` says which records are
 * past a deadline they carry themselves. `outbound` says whether the platform
 * may speak to somebody at all. `dispatch` is the subscriber that turns an event
 * into a run. `lease` decides which tab is allowed to be the clock. Each is
 * testable without the others, which is why the ladder was provable long before
 * anything fired.
 */

export { CONSENT_CADENCE, afterQuietHours, inQuietHours } from './cadence'
export { CONSENTED_STATE, OUTBOUND_HOLDS, checkOutbound } from './outbound'
export type { OutboundDecision, OutboundHold, OutboundInput } from './outbound'
export { breachKey, elapsedTicks } from './elapsed'
export type { DeadlineRecord, ElapsedInput, ElapsedTick } from './elapsed'
export { LADDER_PARAMS, readLadder, rungInstant } from './ladder'
export type { AutomationParameters, Ladder, LadderResult } from './ladder'
export { firedKey, runKey } from './ledger'
export type { FiredKeyParts, RunKeyParts } from './ledger'
export { dueTicks } from './ticks'
export type { DueRecord, DueTick, SupersededRung, TickInput } from './ticks'
export { MAX_CHAIN_DEPTH, RUN_DECISIONS, createDispatcher } from './dispatch'
export type {
  ActionContext,
  ActionOutcome,
  ActionRegistry,
  Dispatcher,
  DispatcherOptions,
  RecipeAction,
  RecipeBinding,
  RecipeRunDraft,
  RunDecision,
  RunSink,
} from './dispatch'
export {
  LEASE_RENEWAL_FRACTION,
  acquireLease,
  isHeldBy,
  readLease,
  releaseLease,
  renewalIntervalMs,
} from './lease'
export type { Lease, LeaseOptions, LeaseStorage } from './lease'
