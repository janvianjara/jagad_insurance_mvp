/**
 * Version pinning — the part that makes configuration portable over years.
 *
 * Canvas 6.2: "old records keep their original schema". A policy captured in
 * 2026 under version 1 must still render as it was captured after an admin has
 * published versions 2 and 3, because the alternative is a record whose fields
 * appear, vanish and change meaning depending on when you open it — and an
 * audit trail nobody can trust.
 *
 * The mechanism is two functions and one rule:
 *
 *   - a record stores `schemaId` + `schemaVersion` (`pinSchema`) the moment it
 *     is created, and never re-pins;
 *   - reading it resolves that exact version out of the catalogue
 *     (`resolveFormSchema` with a version), where superseded versions are kept
 *     with `active: false` rather than deleted;
 *   - `<SchemaForm>` refuses to render a record against a schema whose version
 *     is not the pinned one. Refusing is the point: showing today's form over
 *     last year's record is the silent failure this whole file prevents.
 *
 * A new record takes the active schema — the highest active version, with a
 * product-specific schema winning over the fallback for the same object.
 */
import type { FormSchema } from './schema'

export type SchemaRef = {
  readonly objectKey: string
  /** A product-specific schema wins; null or absent asks for the fallback. */
  readonly productId?: string | null
  /** The pinned version. Absent or null means "whatever is live now". */
  readonly version?: number | null
}

/** What a record stores so it can be re-rendered exactly as it was captured. */
export type SchemaPin = {
  readonly schemaId: string
  readonly schemaVersion: number
}

export function pinSchema(schema: FormSchema): SchemaPin {
  return { schemaId: schema.id, schemaVersion: schema.version }
}

export function schemaMatchesPin(schema: FormSchema, pin: SchemaPin): boolean {
  return schema.id === pin.schemaId && schema.version === pin.schemaVersion
}

function byVersionDescending(a: FormSchema, b: FormSchema): number {
  return b.version - a.version
}

/**
 * The schema a screen should render.
 *
 * Order of preference: the product's own schema, then the object's fallback.
 * With a version pinned, `active` is ignored on purpose — a superseded version
 * is precisely what an old record needs, and refusing to serve it because it is
 * no longer live would break the promise this module exists to keep.
 */
export function resolveFormSchema(
  catalogue: readonly FormSchema[],
  ref: SchemaRef,
): FormSchema | null {
  const forObject = catalogue.filter((schema) => schema.objectKey === ref.objectKey)
  if (forObject.length === 0) return null

  const productId = ref.productId ?? null
  const preferred =
    productId === null ? [] : forObject.filter((schema) => schema.productId === productId)
  const fallback = forObject.filter((schema) => schema.productId === null)

  const version = ref.version ?? null
  if (version !== null) {
    const pinned =
      preferred.find((schema) => schema.version === version) ??
      fallback.find((schema) => schema.version === version) ??
      forObject.find((schema) => schema.version === version)
    return pinned ?? null
  }

  // Precedence before recency: a product with a schema of its own is never
  // served the generic one because the generic one was published later.
  const own = preferred.filter((schema) => schema.active).sort(byVersionDescending)
  if (own.length > 0) return own[0]

  const generic = fallback.filter((schema) => schema.active).sort(byVersionDescending)
  return generic.at(0) ?? null
}

/** The schema for a stored record — its pin, resolved. Null when it is gone. */
export function resolvePinnedSchema(
  catalogue: readonly FormSchema[],
  pin: SchemaPin,
): FormSchema | null {
  return catalogue.find((schema) => schemaMatchesPin(schema, pin)) ?? null
}

/** Every version of one object, newest first — what a version picker lists. */
export function schemaVersions(
  catalogue: readonly FormSchema[],
  objectKey: string,
): readonly FormSchema[] {
  return catalogue
    .filter((schema) => schema.objectKey === objectKey)
    .slice()
    .sort(byVersionDescending)
}
