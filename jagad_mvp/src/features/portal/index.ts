/**
 * The customer portal — plan §4's five `/portal` rows, §11.1's separate shell,
 * decision D-I, and §12's grievance channel.
 *
 * The screens and their route elements are deliberately absent from this
 * barrel. They live in `routes.ts`, whose dynamic imports are what keep them out
 * of the authenticated bundle; re-exporting one here would let any importer fold
 * it back in and `portal-isolation.test.ts` would fail. The router imports
 * `features/portal/routes` directly, exactly as it does for consent and upload.
 *
 * What is exported is the vocabulary and the desk — pure modules a test or a
 * later screen may read without pulling a page in.
 */
export {
  PORTAL_ATTENTION_KINDS,
  PORTAL_CLAIM_STEPS,
  PORTAL_LIVE_STATES,
  attentionRank,
  claimIsOpen,
  claimProgress,
  coverHasEnded,
  coverIsRunning,
  dayOf,
  daysUntil,
  policyStatusFor,
} from './portal-view'
export type {
  PortalAttentionKind,
  PortalClaimProgress,
  PortalClaimStepKey,
  PortalStatus,
} from './portal-view'

export { PORTAL_CLAIM_NEW_PATH, PORTAL_IDENTITY_PARAM, PORTAL_NAV, portalHref } from './portal-session'
export { portalDesk } from './data/portal-desk'
export type { PortalDesk } from './data/portal-desk'
export { GRIEVANCE_CATEGORIES, grievanceDesk } from './data/grievance-desk'
export type { Grievance, GrievanceCategory, GrievanceDesk } from './data/grievance-desk'
