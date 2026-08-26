/**
 * What a schema-driven form holds while somebody is filling it in.
 *
 * The shape is deliberately narrow. A value is a scalar, a cascade path, a set
 * of attachments or the rows of a repeating group — and money is a `Money`,
 * never a number, so an amount cannot arrive here as a float that already lost
 * precision.
 *
 * Unrecorded is `null`, everywhere, and it is not zero. The distinction is the
 * one `<RecordOnlyAmount>` exists to protect and every function here preserves
 * it: an empty premium box means nobody has typed the figure yet, and a form
 * that treated it as 0 would be asserting a total no one gave it.
 */
import { fromPaise, isMoney } from '../money'
import type { Money } from '../money'
import { isGroupField, isLeafField, isRollUpField } from './schema'
import type { FormSchema, LeafFieldDef } from './schema'

/** An attachment as this layer needs it: a `File` satisfies it structurally. */
export type FormFileRef = {
  readonly name: string
  readonly size: number
}

export type FormScalar = string | number | boolean | Money | null

/** One row of a repeating group. Rows hold leaves, so rows hold scalars. */
export type FormRow = { readonly [key: string]: FormScalar | readonly string[] | undefined }

export type FormValue =
  | FormScalar
  | readonly string[]
  | readonly FormFileRef[]
  | readonly FormRow[]

export type FormValues = { readonly [key: string]: FormValue | undefined }

/**
 * The blank a stage starts from.
 *
 * Every field gets an entry, because a control that switches from undefined to
 * a value halfway through is a control that switches from uncontrolled to
 * controlled, and React says so loudly. Blank is `null` for scalars, `[]` for
 * the plural kinds — and a roll-up gets nothing at all, since a derived figure
 * is not a value anybody holds.
 */
export function emptyFieldValue(field: LeafFieldDef): FormValue {
  switch (field.kind) {
    case 'boolean':
      return false
    case 'cascade':
    case 'file':
      return []
    default:
      return null
  }
}

export function emptyValues(schema: FormSchema): FormValues {
  const values: Record<string, FormValue> = {}

  for (const stage of schema.stages) {
    for (const field of stage.fields) {
      if (isRollUpField(field)) continue
      if (isGroupField(field)) {
        values[field.key] = []
        continue
      }
      values[field.key] = emptyFieldValue(field)
    }
  }

  return values
}

/** A blank row for a repeating group — same rule, one level down. */
export function emptyRow(fields: readonly LeafFieldDef[]): FormRow {
  const row: Record<string, FormScalar | readonly string[]> = {}
  for (const field of fields) {
    const blank = emptyFieldValue(field)
    row[field.key] = Array.isArray(blank) ? (blank as readonly string[]) : (blank as FormScalar)
  }
  return row
}

/**
 * Whether a value counts as unfilled.
 *
 * `false` on a checkbox is unfilled — a required consent that nobody ticked is
 * exactly the case the word "required" exists for. A recorded zero amount is
 * NOT unfilled: somebody typed 0, and that is a record.
 */
export function isBlank(value: FormValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'boolean') return value === false
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * A value as the text a visibility rule compares against.
 *
 * Booleans read as `'true'` / `'false'`, which is the shape the stored MVP
 * schemas already use (`visibleWhen: { field: 'floater', equals: 'true' }`), so
 * a published row keeps branching exactly as it did.
 */
export function conditionText(value: FormValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    // A cascade path compares on its deepest chosen node: the variant, not the make.
    const parts = value as readonly unknown[]
    const last = parts.at(-1)
    return typeof last === 'string' ? last : ''
  }
  return ''
}

/** A recorded amount, or null. Anything that is not `Money` is not an amount. */
export function readMoney(value: FormValue | undefined): Money | null {
  return isMoney(value) ? value : null
}

/**
 * Revives an amount that has been through JSON — a restored draft.
 *
 * `Money` is a branded object, and the brand is a phantom: it survives a round
 * trip through `JSON.stringify` as `{ paise, currency }` and nothing else. This
 * rebuilds it through `fromPaise`, which throws on anything fractional, so a
 * tampered draft cannot smuggle a float into the ledger.
 */
export function reviveMoney(value: unknown): Money | null {
  if (value === null || typeof value !== 'object') return null
  const candidate = value as { paise?: unknown; currency?: unknown }
  if (typeof candidate.paise !== 'number') return null
  if (candidate.currency !== 'INR') return null
  return fromPaise(candidate.paise, 'INR')
}

/** The leaf fields of a schema, keyed — the lookup every codec here needs. */
export function leafFieldsByKey(schema: FormSchema): ReadonlyMap<string, LeafFieldDef> {
  const map = new Map<string, LeafFieldDef>()
  for (const stage of schema.stages) {
    for (const field of stage.fields) {
      if (isLeafField(field)) map.set(field.key, field)
    }
  }
  return map
}
