/**
 * The automation runtime — FR-21.
 *
 * `src/domain/automation` decides; this acts. Nothing here is imported by a
 * component: the runtime is started once at the composition root and the screens
 * read its output through `RecipeRunRepository` like any other record.
 */

export { createActions } from './actions'
export type { ActionDeps } from './actions'
export {
  CALLBACK_DUE_KEY,
  CLOCK_LEASE_TTL_MS,
  CONSENT_EXPIRY_KEY,
  SCHEDULES,
  TAT_BREACH_KEY,
  createClock,
  localStorageLease,
} from './clock'
export type { Clock, ClockDeps, ClockOptions, ScheduleNote, TickReport } from './clock'
export { currentAutomation, onAutomationChange, setCurrentAutomation } from './handle'
export { OUTBOUND_STATES, createOutbox } from './outbox'
export type { Outbox, OutboundState, StagedMessage } from './outbox'
export { createRecipientResolver } from './recipients'
export type { RecipientResolver } from './recipients'
export { CLOCK_LEASE_KEY, startAutomation } from './runtime'
export type { AutomationOptions, AutomationRuntime } from './runtime'
