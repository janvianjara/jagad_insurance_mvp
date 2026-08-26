/**
 * The configuration working set — plan §7's "feature drafts: Zustand slice per
 * feature", holding what canvas flow 6 calls the system itself.
 *
 * Why a store and not repository writes: the MVP's `ConfigRepository` is a read
 * interface (`src/data/repo/config.ts`) served by a mock adapter, and P-10a is
 * not the step that invents a write API for the whole data layer. So the screens
 * read through the repository exactly like every other screen — no fixture is
 * imported anywhere — and hold the edits here, in one slice, behind mutations
 * named after the act they perform. When a write API lands, each mutation below
 * gains an `await repositories.config.…` and the screens do not change.
 *
 * Three rules are enforced here rather than in the screens, because a screen can
 * forget and a store cannot:
 *
 *   1. A starter template is never mutated. `cloneTemplateFrom` is the only way
 *      to get an editable template, and `saveTemplate` refuses a row that is not
 *      editable.
 *   2. A master value's `key` is immutable. Records store the key; renaming is a
 *      new revision of the label, which is what makes the rename safe.
 *   3. Anything that changes what a person may see republishes the session, so
 *      the rail and the guards move with the configuration that decides them.
 */

import { create } from 'zustand'
import type { ConfigRepository, InquiryCategory, Team } from '../../../data/repo'
import type { PermissionTemplate } from '../../../domain/permissions'
import type {
  ConfigMasterType,
  ConfigMasterValue,
  ConfigStatus,
  ConfigTemplate,
  ConfigUser,
  TwoFactorEvent,
  TwoFactorLevel,
  TwoFactorPolicy,
} from './config-types'
import { TWO_FACTOR_UNSET } from './config-types'
import { cloneTemplate, starterLibrary } from './permission-template'
import { syncSession } from './session-sync'

/* ------------------------------------------------------------------ helpers */

/** The key a record will store. Immutable once written, so it is written once. */
export function masterKeyFrom(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function idFrom(prefix: string, ...parts: readonly string[]): string {
  const tail = parts
    .map((part) => part.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase())
    .filter((part) => part.length > 0)
    .join('-')
  return `${prefix}-${tail}`
}

function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function now(): string {
  return new Date().toISOString()
}

/* ------------------------------------------------------------------- state */

export type MasterValueInput = {
  readonly masterTypeId: string
  readonly label: string
  /** Only honoured on creation; a value's key never changes afterwards. */
  readonly key?: string
  readonly parentValueId?: string | null
}

export type MasterTypeInput = {
  /** Absent when creating. */
  readonly id?: string
  readonly label: string
  readonly key?: string
  readonly parentTypeId: string | null
}

export type ConfigState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  /**
   * Bumped by every mutation. `<WorkQueue>` loads through `useResource`, whose
   * key is the URL — correct for a queue over a repository, and blind to a store
   * that changed underneath it. A configuration screen therefore remounts its
   * queue on this number, which costs nothing precisely because the URL owns
   * filter, sort, page and selection: the remounted queue comes back looking at
   * exactly what it was looking at.
   */
  readonly revision: number

  readonly templates: readonly ConfigTemplate[]
  readonly users: readonly ConfigUser[]
  readonly teams: readonly Team[]
  readonly categories: readonly InquiryCategory[]
  readonly masterTypes: readonly ConfigMasterType[]
  readonly masterValues: readonly ConfigMasterValue[]
  readonly twoFactor: Readonly<Record<string, TwoFactorPolicy>>

  hydrate(config: ConfigRepository): Promise<void>
  reset(): void

  upsertUser(user: ConfigUser): void
  assignTemplate(userId: string, templateKey: string): void
  setUserActive(userId: string, active: boolean): void
  deleteUser(userId: string): void

  cloneTemplateFrom(sourceKey: string): string | null
  saveTemplate(template: ConfigTemplate): void
  deleteTemplate(key: string): void

  setTwoFactor(templateKey: string, event: TwoFactorEvent, level: TwoFactorLevel): void

  saveMasterType(input: MasterTypeInput): string
  addMasterValue(input: MasterValueInput): ConfigMasterValue | null
  renameMasterValue(valueId: string, label: string): void
  setMasterValueActive(valueId: string, active: boolean): void
  deleteMasterValue(valueId: string): void
}

const EMPTY = {
  status: 'idle' as ConfigStatus,
  error: null,
  revision: 0,
  templates: starterLibrary(),
  users: [],
  teams: [],
  categories: [],
  masterTypes: [],
  masterValues: [],
  twoFactor: {},
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  ...EMPTY,

  /**
   * Reads the whole configuration through the repository, once. Idempotent, so
   * every screen and every `<InlineMasterAdd>` can ask for it on mount without
   * coordinating.
   */
  async hydrate(config) {
    const state = get()
    if (state.status === 'loading' || state.status === 'ready') return
    set({ status: 'loading', error: null })

    try {
      const [users, teams, categories, masterTypes] = await Promise.all([
        config.users(),
        config.teams(),
        config.categories(),
        config.masterTypes(),
      ])

      const valueLists = await Promise.all(
        masterTypes.map((type) => config.masterValues(type.key)),
      )

      const timestamp = now()

      set({
        status: 'ready',
        error: null,
        revision: get().revision + 1,
        users: users.map((staff) => ({ ...staff, twoFactorEnrolled: false })),
        teams,
        categories,
        masterTypes: masterTypes.map((type) => ({ ...type, parentTypeId: null, version: 1 })),
        masterValues: valueLists.flat().map((value) => ({
          ...value,
          parentValueId: null,
          version: 1,
          revisions: [
            {
              version: 1,
              label: value.label,
              active: value.active,
              changedAt: timestamp,
              note: 'Seeded with the configuration.',
            },
          ],
        })),
      })
    } catch (cause) {
      set({
        status: 'error',
        error: cause instanceof Error ? cause : new Error('Configuration could not be read.'),
      })
    }
  },

  reset() {
    set({ ...EMPTY, templates: starterLibrary() })
  },

  /* ------------------------------------------------------------------ users */

  upsertUser(user) {
    const state = get()
    const exists = state.users.some((candidate) => candidate.id === user.id)
    const users = exists
      ? state.users.map((candidate) => (candidate.id === user.id ? user : candidate))
      : [...state.users, user]

    set({ users, revision: state.revision + 1 })
    syncSession(users, state.templates)
  },

  assignTemplate(userId, templateKey) {
    const state = get()
    if (!state.templates.some((template) => template.key === templateKey)) return

    const users = state.users.map((user) =>
      user.id === userId ? { ...user, templateKey } : user,
    )
    set({ users, revision: state.revision + 1 })
    syncSession(users, state.templates)
  },

  setUserActive(userId, active) {
    const state = get()
    const users = state.users.map((user) => (user.id === userId ? { ...user, active } : user))
    set({ users, revision: state.revision + 1 })
    syncSession(users, state.templates)
  },

  deleteUser(userId) {
    const state = get()
    const users = state.users.filter((user) => user.id !== userId)
    set({ users, revision: state.revision + 1 })
    syncSession(users, state.templates)
  },

  /* -------------------------------------------------------------- templates */

  cloneTemplateFrom(sourceKey) {
    const state = get()
    const source = state.templates.find((template) => template.key === sourceKey)
    if (!source) return null

    const clone = cloneTemplate(source, state.templates.map((template) => template.key))
    set({ templates: [...state.templates, clone], revision: state.revision + 1 })
    return clone.key
  },

  /** Refuses a starter outright: the library is seed data, not a mutable row. */
  saveTemplate(template) {
    const state = get()
    const current = state.templates.find((candidate) => candidate.key === template.key)
    if (!current || !current.editable) return

    const templates = state.templates.map((candidate) =>
      candidate.key === template.key ? template : candidate,
    )
    set({ templates, revision: state.revision + 1 })
    syncSession(state.users, templates)
  },

  deleteTemplate(key) {
    const state = get()
    const target = state.templates.find((template) => template.key === key)
    if (!target || !target.editable) return
    if (state.users.some((user) => user.templateKey === key)) return

    const templates = state.templates.filter((template) => template.key !== key)
    const twoFactor = { ...state.twoFactor }
    delete twoFactor[key]
    set({ templates, twoFactor, revision: state.revision + 1 })
  },

  setTwoFactor(templateKey, event, level) {
    const state = get()
    const current = state.twoFactor[templateKey] ?? TWO_FACTOR_UNSET
    set({
      twoFactor: { ...state.twoFactor, [templateKey]: { ...current, [event]: level } },
      revision: state.revision + 1,
    })
  },

  /* ---------------------------------------------------------------- masters */

  saveMasterType(input) {
    const state = get()

    if (input.id) {
      const masterTypes = state.masterTypes.map((type) =>
        type.id === input.id
          ? // The key stays: it is what `masterValues(key)` and every form field
            // asks for. Label and cascade are what an admin actually changes.
            { ...type, label: input.label, parentTypeId: input.parentTypeId, version: type.version + 1 }
          : type,
      )
      set({ masterTypes, revision: state.revision + 1 })
      return input.id
    }

    const key = input.key?.trim() || masterKeyFrom(input.label)
    const id = uniqueId(idFrom('mst', key), state.masterTypes.map((type) => type.id))

    set({
      revision: state.revision + 1,
      masterTypes: [
        ...state.masterTypes,
        { id, key, label: input.label.trim(), editable: true, parentTypeId: input.parentTypeId, version: 1 },
      ],
    })
    return id
  },

  addMasterValue(input) {
    const state = get()
    const type = state.masterTypes.find((candidate) => candidate.id === input.masterTypeId)
    if (!type) return null

    const label = input.label.trim()
    if (label === '') return null

    const key = (input.key?.trim() || masterKeyFrom(label)) || 'value'
    const siblings = state.masterValues.filter((value) => value.masterTypeId === type.id)
    if (siblings.some((value) => value.key === key)) return null

    const id = uniqueId(idFrom('msv', type.key, key), state.masterValues.map((value) => value.id))
    const created: ConfigMasterValue = {
      id,
      masterTypeId: type.id,
      key,
      label,
      sortOrder: siblings.length + 1,
      active: true,
      parentValueId: input.parentValueId ?? null,
      version: 1,
      revisions: [
        { version: 1, label, active: true, changedAt: now(), note: 'Added.' },
      ],
    }

    set({ masterValues: [...state.masterValues, created], revision: state.revision + 1 })
    return created
  },

  /**
   * Renames without touching the key, and records the previous wording as a
   * revision — canvas 6.2's "old records keep their original schema", applied to
   * the smallest configuration there is.
   */
  renameMasterValue(valueId, label) {
    const next = label.trim()
    if (next === '') return

    set({
      revision: get().revision + 1,
      masterValues: get().masterValues.map((value) => {
        if (value.id !== valueId || value.label === next) return value
        const version = value.version + 1
        return {
          ...value,
          label: next,
          version,
          revisions: [
            ...value.revisions,
            {
              version,
              label: next,
              active: value.active,
              changedAt: now(),
              note: `Renamed from "${value.label}".`,
            },
          ],
        }
      }),
    })
  },

  setMasterValueActive(valueId, active) {
    set({
      revision: get().revision + 1,
      masterValues: get().masterValues.map((value) => {
        if (value.id !== valueId || value.active === active) return value
        const version = value.version + 1
        return {
          ...value,
          active,
          version,
          revisions: [
            ...value.revisions,
            {
              version,
              label: value.label,
              active,
              changedAt: now(),
              note: active
                ? 'Reactivated. It is offered on forms again.'
                : 'Deactivated. Records that hold it are untouched; no new record can choose it.',
            },
          ],
        }
      }),
    })
  },

  /**
   * Removes the row outright. The screen decides whether that is allowed —
   * `master-usage.ts` answers the in-use question, and a value in use is
   * deactivated instead.
   */
  deleteMasterValue(valueId) {
    const state = get()
    set({
      masterValues: state.masterValues.filter((value) => value.id !== valueId),
      revision: state.revision + 1,
    })
  },
}))

/* ---------------------------------------------------------------- selectors */

export function templateByKey(
  state: ConfigState,
  key: string | null,
): ConfigTemplate | null {
  if (!key) return null
  return state.templates.find((template) => template.key === key) ?? null
}

export function usersOnTemplate(state: ConfigState, key: string): readonly ConfigUser[] {
  return state.users.filter((user) => user.templateKey === key)
}

export function valuesOfType(
  state: ConfigState,
  masterTypeId: string,
): readonly ConfigMasterValue[] {
  return state.masterValues
    .filter((value) => value.masterTypeId === masterTypeId)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
}

export function masterTypeByKey(
  state: ConfigState,
  key: string,
): ConfigMasterType | null {
  return state.masterTypes.find((type) => type.key === key) ?? null
}

export function policyFor(state: ConfigState, templateKey: string): TwoFactorPolicy {
  return state.twoFactor[templateKey] ?? TWO_FACTOR_UNSET
}

/** The template a user resolves to, for previews and for the library's counts. */
export function templateOf(state: ConfigState, user: ConfigUser): PermissionTemplate | null {
  return state.templates.find((template) => template.key === user.templateKey) ?? null
}
