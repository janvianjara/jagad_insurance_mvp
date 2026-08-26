/**
 * The shapes the configuration screens edit — plan §5 "Config × 10", decision D1
 * ("the whole system is configuration, not code").
 *
 * Every type here extends a `src/data/repo` record rather than replacing it. The
 * repository owns what a master value or a staff account *is*; configuration
 * owns the handful of extra facts an admin edits and the MVP's read-only mock
 * adapter has nowhere to put yet — a value's parent in a cascade, its revision
 * history, a template's provenance, a two-factor policy. When a write API lands,
 * these fields move onto the repository records and this file shrinks to the
 * aliases; nothing in the screens changes.
 *
 * Two rules are expressed as types rather than as prose:
 *   - a template carries its `origin`, and a starter is never `editable`, so the
 *     clone-and-edit rule cannot be bypassed by a screen that forgot it;
 *   - a master value's `key` is what records store, so it is written once at
 *     creation and only the label is versioned afterwards.
 */

import type { PermissionTemplate } from '../../../domain/permissions'
import type { MasterType, MasterValue, StaffUser } from '../../../data/repo'

/* ---------------------------------------------------------------- templates */

export const TEMPLATE_ORIGINS = {
  /** Shipped in `STARTER_TEMPLATES`. Read-only: it is cloned, never edited. */
  starter: 'starter',
  /** Made on this screen by cloning a starter or another clone. */
  clone: 'clone',
} as const

export type TemplateOrigin = (typeof TEMPLATE_ORIGINS)[keyof typeof TEMPLATE_ORIGINS]

/**
 * A row in the template library. It *is* a `PermissionTemplate`, so `can()`
 * evaluates it directly and the editor cannot drift from the evaluator.
 */
export type ConfigTemplate = PermissionTemplate & {
  readonly origin: TemplateOrigin
  /** The template this one was cloned from, for the library's provenance line. */
  readonly clonedFrom: string | null
  /** False for every starter. The editor renders read-only when this is false. */
  readonly editable: boolean
}

/* -------------------------------------------------------------------- users */

/**
 * A staff account as configuration edits it. `twoFactorEnrolled` is recorded,
 * not enforced: the MVP implements no TOTP (P-10a scope note), so this says what
 * the agency has on file, and the matrix below says what the policy asks for.
 */
export type ConfigUser = StaffUser & {
  readonly twoFactorEnrolled: boolean
}

/* ------------------------------------------------- two-factor, record-only */

export const TWO_FACTOR_LEVELS = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

export type TwoFactorLevel = (typeof TWO_FACTOR_LEVELS)[keyof typeof TWO_FACTOR_LEVELS]

export const TWO_FACTOR_LEVEL_LABELS: Readonly<Record<TwoFactorLevel, string>> = {
  off: 'Not asked for',
  optional: 'Offered',
  required: 'Required',
}

/** The moments a second factor can be asked for. One column each in the matrix. */
export const TWO_FACTOR_EVENTS = ['signIn', 'sensitiveView', 'outwardSend', 'configChange'] as const

export type TwoFactorEvent = (typeof TWO_FACTOR_EVENTS)[number]

export const TWO_FACTOR_EVENT_LABELS: Readonly<Record<TwoFactorEvent, string>> = {
  signIn: 'Sign in',
  sensitiveView: 'Opening a sensitive field',
  outwardSend: 'Sending to a customer or insurer',
  configChange: 'Changing configuration',
}

/** Template key to the level recorded for each event. */
export type TwoFactorPolicy = Readonly<Record<TwoFactorEvent, TwoFactorLevel>>

export const TWO_FACTOR_UNSET: TwoFactorPolicy = {
  signIn: TWO_FACTOR_LEVELS.off,
  sensitiveView: TWO_FACTOR_LEVELS.off,
  outwardSend: TWO_FACTOR_LEVELS.off,
  configChange: TWO_FACTOR_LEVELS.off,
}

/* ------------------------------------------------------------------ masters */

/**
 * A master type, plus the two things canvas flow 6 asks of it that the read
 * interface has no room for: which type it cascades from (Make to Model), and a
 * version that moves when its shape changes.
 */
export type ConfigMasterType = MasterType & {
  /** The parent type in a cascade. Null for a flat list. */
  readonly parentTypeId: string | null
  readonly version: number
}

export type MasterValueRevision = {
  readonly version: number
  readonly label: string
  readonly active: boolean
  readonly changedAt: string
  /** What the change was, in the words the screen wrote. */
  readonly note: string
}

/**
 * A master value. `key` is what every record stores, so it is immutable after
 * creation; the label is versioned, which is what lets an agency rename "Walk
 * in" to "Branch visit" without rewriting the records that chose it.
 */
export type ConfigMasterValue = MasterValue & {
  /** The parent value in a cascade — a Model's Make. Null for a flat list. */
  readonly parentValueId: string | null
  readonly version: number
  readonly revisions: readonly MasterValueRevision[]
}

/* ------------------------------------------------------------------- status */

export const CONFIG_STATUSES = ['idle', 'loading', 'ready', 'error'] as const
export type ConfigStatus = (typeof CONFIG_STATUSES)[number]
