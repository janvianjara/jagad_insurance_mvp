/**
 * The far side of the sign-in door — plan §11.1.
 *
 * `/login` and `/login/2fa` carry no session at mount, and the route map says so
 * in a comment that only a chunk boundary can keep true. So everything that
 * assumes a signed-in world lives in this one module, and the two screens reach
 * it through `await import('./auth-desk')` at the moment a person actually
 * signs in. The session store, the permission evaluator, the navigation model
 * and the configuration store are all on this side of that import;
 * `auth-isolation.test.ts` walks the screens' static graphs and fails if any of
 * them leaks across.
 *
 * Three jobs, and they are all reads of something that already exists:
 *
 *   1. **The two-factor policy.** P-10a built an enforcement matrix in
 *      `/config/users` and nothing enforced it. This module reads it, so whether
 *      a person is challenged is decided by configuration an admin can change on
 *      screen rather than by a branch in a component.
 *   2. **The demo account list.** The staff accounts, resolved far enough to say
 *      what each role lands on — `landingFor` answers that, and answering it
 *      here means the row and the redirect cannot disagree.
 *   3. **Entering the session.** Exactly what `boot.ts` does at start-up, with
 *      one difference: the account that was signed in to is the active one.
 */

import { landingFor } from '../../app/navigation'
import { resolveAccount, useSessionStore } from '../../app/store'
import type { StaffUser } from '../../data/repo'
import { useConfigStore } from '../config/shared/config-store'
import {
  TWO_FACTOR_EVENT_LABELS,
  TWO_FACTOR_LEVELS,
  TWO_FACTOR_LEVEL_LABELS,
  TWO_FACTOR_UNSET,
} from '../config/shared/config-types'
import type { TwoFactorLevel } from '../config/shared/config-types'

/**
 * What the agency asks for at sign in, per starter template, until an admin says
 * otherwise.
 *
 * The matrix in `/config/users` starts empty, which would make every account
 * walk straight in and the policy screen a decoration. These are the defaults
 * the product ships with — the templates that reach money, configuration or the
 * whole book are challenged, the templates scoped to a person's own customers
 * are not — and they are written INTO the configuration store the first time a
 * sign-in screen reads it. An admin therefore sees them on the policy matrix,
 * can change any of them there, and the next sign-in obeys the change. Nothing
 * here overrides a policy that has already been recorded.
 */
export const SIGN_IN_POLICY_DEFAULTS: Readonly<Record<string, TwoFactorLevel>> = {
  admin: TWO_FACTOR_LEVELS.required,
  salesManager: TWO_FACTOR_LEVELS.required,
  backOffice: TWO_FACTOR_LEVELS.required,
  claims: TWO_FACTOR_LEVELS.optional,
  renewals: TWO_FACTOR_LEVELS.optional,
  agent: TWO_FACTOR_LEVELS.off,
  subAgent: TWO_FACTOR_LEVELS.off,
}

/** The matrix's three readings, as a badge on an account row says them. */
const ROW_LABELS: Readonly<Record<TwoFactorLevel, string>> = {
  off: 'No code',
  optional: 'Code offered',
  required: 'Code required',
}

/** The second factor this build would ask for. Recorded, never sent (FR-18). */
export const SECOND_FACTOR_LABEL = 'a six-digit authenticator code'

export type SignInFactor = {
  readonly level: TwoFactorLevel
  /** "Required" / "Offered" / "Not asked for", as the matrix words it. */
  readonly levelLabel: string
  /** The same reading, short enough for a badge on an account row. */
  readonly shortLabel: string
  /** "Sign in" — the matrix column this reading came from. */
  readonly eventLabel: string
  readonly factorLabel: string
  readonly challenges: boolean
}

/**
 * Writes the shipped defaults into the configuration store, once, for any
 * template whose policy nobody has recorded. Idempotent: a template that already
 * has a policy — because an admin set one, or because this ran before — is left
 * exactly as it is.
 */
export function seedSignInPolicy(): void {
  for (const [templateKey, level] of Object.entries(SIGN_IN_POLICY_DEFAULTS)) {
    const state = useConfigStore.getState()
    if (state.twoFactor[templateKey]) continue
    state.setTwoFactor(templateKey, 'signIn', level)
  }
}

/** What the enforcement matrix says about signing in on this template. */
export function signInFactorFor(templateKey: string): SignInFactor {
  seedSignInPolicy()
  const policy = useConfigStore.getState().twoFactor[templateKey] ?? TWO_FACTOR_UNSET
  const level = policy.signIn

  return {
    level,
    levelLabel: TWO_FACTOR_LEVEL_LABELS[level],
    shortLabel: ROW_LABELS[level],
    eventLabel: TWO_FACTOR_EVENT_LABELS.signIn,
    factorLabel: SECOND_FACTOR_LABEL,
    challenges: level === TWO_FACTOR_LEVELS.required,
  }
}

export type DemoAccount = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly mobile: string
  readonly roleLabel: string
  readonly templateKey: string
  /** Where signing in as this person lands, straight from `landingFor`. */
  readonly landing: string
  readonly factor: SignInFactor
}

/** The active staff accounts, with what each one lands on and is asked for. */
export function demoAccounts(staff: readonly StaffUser[]): readonly DemoAccount[] {
  return staff
    .filter((person) => person.active)
    .map((person) => {
      const { user } = resolveAccount(person)
      return {
        id: person.id,
        name: person.name,
        email: person.email,
        mobile: person.mobile,
        roleLabel: person.roleLabel,
        templateKey: person.templateKey,
        landing: landingFor(user),
        factor: signInFactorFor(person.templateKey),
      }
    })
}

/**
 * Hydrates the session the way boot does, with one account made active, and
 * gives back the route that account lands on.
 *
 * Every active staff record goes into `accounts`, not just the one signing in:
 * the rail footer's switcher is the same list, and a session hydrated with one
 * account would leave the walkthrough unable to move to the next person.
 */
export function enterSession(staff: readonly StaffUser[], userId: string): string | null {
  const accounts = staff.filter((person) => person.active).map(resolveAccount)
  const account = accounts.find((entry) => entry.user.id === userId)
  if (!account) return null

  useSessionStore.getState().hydrate(accounts, userId)
  return landingFor(account.user)
}

/** Drops the session and everything resolved with it. The sign-out half. */
export function leaveSession(): void {
  useSessionStore.getState().reset()
}
