/**
 * The form-schema working set — decision D1 ("the whole system is
 * configuration, not code") at the one place it is most visible.
 *
 * Why a store and not repository writes, for the third time: `ConfigRepository`
 * is a read interface served by a mock adapter, and inventing a write API for
 * the data layer is not this step's job. So the builder reads through the
 * repository exactly like every other screen — no fixture is imported anywhere —
 * and holds its edits here, behind two mutations named after the act they
 * perform. Each gains an `await repositories.config.…` the day a write API
 * lands, and no screen changes.
 *
 * Both mutations run `blockingProblems` before they write. The builder already
 * refuses to offer a broken change, but a screen can forget and a store cannot,
 * and the two rules that matter most here — a reserved field is never removed,
 * an amount is never derived — are exactly the ones a second check is cheap
 * insurance against.
 *
 * The catalogue is the stored rows plus P-12's seeds. The stored row type
 * cannot yet hold a roll-up or a repeating group (see `src/domain/forms/seeds`),
 * and a builder that could not show the agency its own health form would be a
 * builder that hides the half of the grammar this screen exists to explain.
 */

import { create } from 'zustand'
import { SEED_FORM_SCHEMAS, blockingProblems, reservedFieldsFor } from '../../../domain/forms'
import type { FormSchema, FormStage, LeafFieldDef, SchemaProblem } from '../../../domain/forms'
import type { ConfigRepository } from '../../../data/repo'
import type { ConfigStatus } from '../shared'

/** What a write answers with. Refusal carries the validator's own sentences. */
export type SchemaWriteOutcome =
  | { readonly ok: true; readonly schemaId: string }
  | { readonly ok: false; readonly problems: readonly SchemaProblem[] }

function now(): string {
  return new Date().toISOString()
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** Every row of one object-and-product lineage, newest version first. */
export function lineageOf(
  schemas: readonly FormSchema[],
  schema: FormSchema,
): readonly FormSchema[] {
  return schemas
    .filter(
      (candidate) =>
        candidate.objectKey === schema.objectKey && candidate.productId === schema.productId,
    )
    .toSorted((a, b) => b.version - a.version)
}

export function schemaById(
  schemas: readonly FormSchema[],
  id: string,
): FormSchema | null {
  return schemas.find((schema) => schema.id === id) ?? null
}

export type FormsState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  /** Bumped by every mutation; the screen remounts its queue on it. */
  readonly revision: number
  readonly schemas: readonly FormSchema[]

  hydrate(config: ConfigRepository): Promise<void>
  reset(): void

  /** Rewrites this version in place. Refuses a draft the renderer would reject. */
  saveStages(schemaId: string, stages: readonly FormStage[]): SchemaWriteOutcome
  /**
   * Publishes the draft as the next version of the same lineage and supersedes
   * the live one. Superseded is not deleted: records pin the version they were
   * captured under, and the promise only holds while that row survives.
   */
  publishVersion(schemaId: string, stages: readonly FormStage[]): SchemaWriteOutcome
  /**
   * Authors a new schema at version 1.
   *
   * D1 says the whole system is configuration rather than code, and that promise
   * is only half kept if a person can edit the forms somebody else seeded but
   * never author one. The new schema starts with the reserved fields its object
   * requires, in one stage, because a schema without them cannot be saved and
   * starting from a refusal teaches nothing.
   */
  createSchema(input: NewSchemaInput): CreateSchemaOutcome
}

export type NewSchemaInput = {
  readonly objectKey: string
  readonly productId: string | null
}

export type CreateSchemaOutcome =
  | { readonly ok: true; readonly schema: FormSchema }
  | { readonly ok: false; readonly reason: string }

const EMPTY = {
  status: 'idle' as ConfigStatus,
  error: null,
  revision: 0,
  schemas: [] as readonly FormSchema[],
}

/**
 * A reserved entry states which kinds are allowed, and the first of those can be
 * `rollup` or `group` - shapes that carry their own required members. A new form
 * opens on the first LEAF kind instead, which is always a legal starting point;
 * the builder lets the person move it to a rollup afterwards if the registry
 * permits one.
 */
function leafFieldFor(key: string, kinds: readonly string[]): LeafFieldDef {
  const leaf = kinds.find((kind) => kind !== 'group' && kind !== 'rollup')
  return {
    key,
    label: labelFromKey(key),
    kind: (leaf ?? 'text') as LeafFieldDef['kind'],
    required: false,
    visibleWhen: null,
    masterTypeId: null,
  }
}

/** `contactName` reads as "Contact name" until somebody types better wording. */
function labelFromKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export const useFormsStore = create<FormsState>((set, get) => ({
  ...EMPTY,

  async hydrate(config) {
    const state = get()
    if (state.status === 'loading' || state.status === 'ready') return
    set({ status: 'loading', error: null })

    try {
      const stored = await config.formSchemas()
      set({
        status: 'ready',
        error: null,
        revision: get().revision + 1,
        // A stored row is already a valid schema for this renderer, with no
        // adapter and no copy — the superset relationship is the whole reason
        // the two sets can sit in one catalogue.
        schemas: [...stored, ...SEED_FORM_SCHEMAS],
      })
    } catch (cause) {
      set({
        status: 'error',
        error: cause instanceof Error ? cause : new Error('Form schemas could not be read.'),
      })
    }
  },

  reset() {
    set({ ...EMPTY })
  },

  createSchema({ objectKey, productId }) {
    const key = objectKey.trim()
    if (key === '') {
      return { ok: false, reason: 'Give the form an object key - what it captures.' }
    }

    const state = get()
    const clash = state.schemas.find(
      (schema) => schema.objectKey === key && schema.productId === productId && schema.active,
    )
    if (clash) {
      return {
        ok: false,
        reason: productId
          ? `${key} already has a live form for that product. Open it and publish a new version instead.`
          : `${key} already has a live form. Open it and publish a new version instead.`,
      }
    }

    // Seed with the reserved fields for this object. They cannot be removed
    // later, so putting them in at the start is the honest shape rather than a
    // blank stage that refuses to save.
    const reserved = reservedFieldsFor(key)
    const schema: FormSchema = {
      id: `sch-${key}-${productId ?? 'all'}-1`,
      objectKey: key,
      productId,
      version: 1,
      publishedAt: new Date().toISOString(),
      active: true,
      stages: [
        {
          key: 'details',
          label: 'Details',
          fields: reserved.map((field) => leafFieldFor(field.key, field.kinds)),
        },
      ],
    }

    set({ schemas: [...state.schemas, schema], revision: state.revision + 1 })
    return { ok: true, schema }
  },

  saveStages(schemaId, stages) {
    const state = get()
    const schema = schemaById(state.schemas, schemaId)
    if (!schema) {
      return { ok: false, problems: [] }
    }

    const next: FormSchema = { ...schema, stages }
    const problems = blockingProblems(next)
    if (problems.length > 0) return { ok: false, problems }

    set({
      revision: state.revision + 1,
      schemas: state.schemas.map((row) => (row.id === schemaId ? next : row)),
    })
    return { ok: true, schemaId }
  },

  publishVersion(schemaId, stages) {
    const state = get()
    const schema = schemaById(state.schemas, schemaId)
    if (!schema) {
      return { ok: false, problems: [] }
    }

    const lineage = lineageOf(state.schemas, schema)
    const version = Math.max(...lineage.map((row) => row.version)) + 1

    const candidate: FormSchema = {
      ...schema,
      id: uniqueId(
        `frm-${slug(schema.objectKey)}${schema.productId ? `-${slug(schema.productId)}` : ''}-v${version}`,
        state.schemas.map((row) => row.id),
      ),
      version,
      stages,
      publishedAt: now(),
      active: true,
    }

    const problems = blockingProblems(candidate)
    if (problems.length > 0) return { ok: false, problems }

    const lineageIds = new Set(lineage.map((row) => row.id))
    set({
      revision: state.revision + 1,
      schemas: [
        ...state.schemas.map((row) =>
          lineageIds.has(row.id) && row.active ? { ...row, active: false } : row,
        ),
        candidate,
      ],
    })
    return { ok: true, schemaId: candidate.id }
  },
}))
