/**
 * Draft safety — charter U6: a session timeout must never cost somebody their
 * typing.
 *
 * The codec is here, in the framework-free layer, and the storage is in
 * `components/SchemaForm/draft-store.ts`. That split is not ceremony: it means
 * "the draft survived the timeout" is a test that runs without a browser, and
 * that swapping localStorage for a server-side draft later touches one adapter
 * rather than the rules.
 *
 * What a draft is NOT allowed to do is quietly change a record. So:
 *
 *   - it carries the schema id and version it was typed under, and a restore
 *     against a different version says so rather than pretending;
 *   - a key the schema no longer has is dropped and NAMED, never silently
 *     re-inserted into a record whose shape has moved on;
 *   - attachments cannot be serialised, so their fields are listed as
 *     detached — "re-attach the RC copy" is honest, a silently empty file box
 *     is not.
 */
import { isMoney } from '../money'
import { isGroupField, isLeafField, isRollUpField } from './schema'
import type { FormSchema, GroupFieldDef, LeafFieldDef } from './schema'
import { reviveMoney } from './values'
import type { FormRow, FormValue, FormValues } from './values'

/** Bumped only if the stored shape below changes; an older format is discarded. */
export const DRAFT_FORMAT = 1

const DRAFT_KEY_PREFIX = 'jagad.form-draft'

/**
 * One draft per entity, which is what "keyed by entity id" means: the policy
 * being entered, the inquiry being taken. Two people on two records never
 * collide, and reopening the same record finds the same typing.
 */
export function draftKey(objectKey: string, entityId: string): string {
  return `${DRAFT_KEY_PREFIX}:${objectKey}:${entityId}`
}

export type FormDraft = {
  readonly format: number
  readonly objectKey: string
  readonly entityId: string
  readonly schemaId: string
  readonly schemaVersion: number
  readonly savedAt: string
  readonly values: Record<string, unknown>
  /** Fields whose attachments could not be kept. The UI asks for them again. */
  readonly detachedFileFields: readonly string[]
}

function encodeLeaf(field: LeafFieldDef, value: FormValue | undefined): unknown {
  if (value === undefined) return null
  if (field.kind === 'file') return null
  if (isMoney(value)) return { paise: value.paise, currency: value.currency }
  return value
}

function encodeRow(group: GroupFieldDef, row: FormRow): Record<string, unknown> {
  const encoded: Record<string, unknown> = {}
  for (const child of group.fields) {
    encoded[child.key] = encodeLeaf(child, row[child.key])
  }
  return encoded
}

/** The values as JSON-safe data, plus the list of what could not be kept. */
export function encodeDraft(
  schema: FormSchema,
  entityId: string,
  values: FormValues,
  savedAt: string,
): FormDraft {
  const encoded: Record<string, unknown> = {}
  const detached: string[] = []

  for (const stage of schema.stages) {
    for (const field of stage.fields) {
      // A roll-up is derived; storing it would be storing arithmetic as if it
      // were evidence, and restoring it would be worse.
      if (isRollUpField(field)) continue

      if (isGroupField(field)) {
        const rows = values[field.key]
        encoded[field.key] = Array.isArray(rows)
          ? (rows as readonly FormRow[]).map((row) => encodeRow(field, row))
          : []
        continue
      }

      const value = values[field.key]
      if (field.kind === 'file' && Array.isArray(value) && value.length > 0) {
        detached.push(field.key)
      }
      encoded[field.key] = encodeLeaf(field, value)
    }
  }

  return {
    format: DRAFT_FORMAT,
    objectKey: schema.objectKey,
    entityId,
    schemaId: schema.id,
    schemaVersion: schema.version,
    savedAt,
    values: encoded,
    detachedFileFields: detached,
  }
}

export type DraftRestore = {
  readonly savedAt: string
  readonly values: FormValues
  /** Keys the draft held that this schema no longer has. Named, not swallowed. */
  readonly droppedFieldKeys: readonly string[]
  readonly detachedFileFields: readonly string[]
  /** True when the draft was typed under a different version of the schema. */
  readonly schemaChanged: boolean
}

function decodeLeaf(field: LeafFieldDef, raw: unknown): FormValue {
  if (raw === null || raw === undefined) {
    return field.kind === 'boolean' ? false : field.kind === 'cascade' ? [] : null
  }

  switch (field.kind) {
    case 'money':
      return reviveMoney(raw)
    case 'number':
      return typeof raw === 'number' ? raw : null
    case 'boolean':
      return raw === true
    case 'cascade':
      return Array.isArray(raw) ? raw.filter((part) => typeof part === 'string') : []
    case 'file':
      // Attachments never survive a draft; the field asks for them again.
      return []
    default:
      return typeof raw === 'string' ? raw : null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A stored draft, read back against the schema in front of it.
 *
 * Returns null when there is nothing usable — a different entity, an older
 * format, corrupt JSON. Never throws: a broken draft must not stop somebody
 * opening the record, it must only stop pretending it can help.
 */
export function decodeDraft(
  schema: FormSchema,
  entityId: string,
  raw: unknown,
): DraftRestore | null {
  if (!isRecord(raw)) return null
  if (raw.format !== DRAFT_FORMAT) return null
  if (raw.objectKey !== schema.objectKey || raw.entityId !== entityId) return null
  if (!isRecord(raw.values)) return null

  const stored = raw.values
  const values: Record<string, FormValue> = {}
  const known = new Set<string>()

  for (const stage of schema.stages) {
    for (const field of stage.fields) {
      if (isRollUpField(field)) continue
      known.add(field.key)

      if (isGroupField(field)) {
        const rows = stored[field.key]
        values[field.key] = Array.isArray(rows)
          ? rows.filter(isRecord).map((row) => {
              const decoded: Record<string, unknown> = {}
              for (const child of field.fields) decoded[child.key] = decodeLeaf(child, row[child.key])
              return decoded as FormRow
            })
          : []
        continue
      }

      if (isLeafField(field)) values[field.key] = decodeLeaf(field, stored[field.key])
    }
  }

  const dropped = Object.keys(stored).filter((key) => !known.has(key))
  const detached = Array.isArray(raw.detachedFileFields)
    ? raw.detachedFileFields.filter((key): key is string => typeof key === 'string')
    : []

  return {
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    values,
    droppedFieldKeys: dropped,
    detachedFileFields: detached,
    schemaChanged: raw.schemaId !== schema.id || raw.schemaVersion !== schema.version,
  }
}
