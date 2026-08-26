/**
 * Session — plan §7's "Current user, active role, resolved permission set,
 * density, theme. Zustand slice, hydrated once at boot. Feeds `can()`."
 *
 * The store holds the *resolved* user, not a user id and a template key: every
 * nav item, route guard, toolbar button and bulk action calls `can(user, ...)`,
 * and a store that made each of them look a template up would be a store that
 * let two of them disagree. Hydration resolves the template once; switching
 * accounts swaps a whole resolved user.
 *
 * Role switching is account switching. The prototype's persona switcher in the
 * rail footer is not a debug affordance here — a single-tenant agency has eight
 * staff accounts and a demo walks all of them — so it is modelled as the ordinary
 * act of being a different signed-in person, which is also what makes the nav and
 * the guards prove themselves.
 */

import { create } from 'zustand'
import type { PermissionTemplate, User } from '../../domain/permissions'
import { STARTER_TEMPLATES } from '../../domain/permissions'
import type { StaffUser } from '../../data/repo'

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/** One signed-in-able account: the resolved user plus what the switcher shows. */
export type SessionAccount = {
  readonly user: User
  readonly email: string
  /** The sentence under the name in the rail footer, from the staff record. */
  readonly roleLabel: string
}

export type SessionState = {
  /** False until `hydrate` has run. Guards render a wait rather than a denial. */
  readonly ready: boolean
  readonly user: User | null
  readonly accounts: readonly SessionAccount[]
  readonly density: Density

  hydrate(accounts: readonly SessionAccount[], activeUserId?: string): void
  switchAccount(userId: string): void
  setDensity(density: Density): void
  reset(): void
}

const TEMPLATES: Readonly<Record<string, PermissionTemplate>> = STARTER_TEMPLATES

/**
 * Resolves a staff record into the shape `can()` evaluates.
 *
 * An unknown template key does not fall back to something permissive. It falls
 * back to a template that grants nothing, so a typo in configuration shows up as
 * an empty rail rather than as an accidental admin.
 */
const NOTHING: PermissionTemplate = {
  key: 'unknown',
  label: 'No permissions resolved',
  grants: {},
  scopes: {},
  dataClasses: ['operational', 'contact'],
}

export function resolveAccount(staff: StaffUser): SessionAccount {
  const template = TEMPLATES[staff.templateKey] ?? NOTHING

  const user: User = {
    id: staff.id,
    name: staff.name,
    templateKey: staff.templateKey,
    template,
    ...(staff.teamId === null ? {} : { teamId: staff.teamId }),
    ...(staff.agentId === null ? {} : { agentId: staff.agentId }),
    ...(staff.parentAgentId === null ? {} : { parentAgentId: staff.parentAgentId }),
  }

  return { user, email: staff.email, roleLabel: staff.roleLabel }
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ready: false,
  user: null,
  accounts: [],
  density: 'comfortable',

  hydrate(accounts, activeUserId) {
    const active = accounts.find((account) => account.user.id === activeUserId) ?? accounts[0]
    set({ ready: true, accounts, user: active?.user ?? null })
  },

  switchAccount(userId) {
    const next = get().accounts.find((account) => account.user.id === userId)
    if (!next) return
    set({ user: next.user })
  },

  setDensity(density) {
    set({ density })
  },

  reset() {
    set({ ready: false, user: null, accounts: [], density: 'comfortable' })
  },
}))

/** The account record for whoever is signed in, for the rail footer. */
export function activeAccount(state: SessionState): SessionAccount | null {
  if (!state.user) return null
  return state.accounts.find((account) => account.user.id === state.user?.id) ?? null
}
