/**
 * A zod schema, generated from a form schema — plan §7 ("Schemas generated from
 * SKU definitions at runtime").
 *
 * Generated against the CURRENT values, not against the definition alone,
 * because visibility is part of validity: a health declaration that has branched
 * away is not an unanswered question. The renderer regenerates this as the form
 * changes, which is cheap and keeps one truth about what is being asked.
 *
 * zod is v4 here (`zod@4.4.3`): `z.looseObject` is the passthrough object, error
 * messages are the `error` parameter, and issues arrive as `error.issues` with a
 * `path` of keys and indices. None of that matches v3 from memory — it was read
 * off `node_modules/zod/v4` before this file was written.
 *
 * **Every base constructor below carries `error`, and that is load-bearing.** An
 * untouched control holds `null`, so the TYPE check fails before any `.min`,
 * `.regex` or `.refine` runs — and a message attached only to the refinement
 * never gets the chance to speak. What reached the screen instead was zod's own
 * default, `Invalid input: expected string, received null`, which is a sentence
 * written for whoever wrote the schema and not for the person filling the form
 * in. Putting `missing` on the constructor is what makes the empty case say
 * "Premium mode is needed before this can be saved."
 */
import { z } from 'zod'
import { isMoney } from '../money'
import { isGroupField, isRollUpField } from './schema'
import type { FormSchema, GroupFieldDef, LeafFieldDef } from './schema'
import type { FormValues } from './values'
import { isFieldVisible, visibleStages } from './visibility'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** An optional value: absent, cleared, or never touched. All three are fine. */
function optional(inner: z.ZodType): z.ZodType {
  return z.union([inner, z.literal(''), z.null(), z.undefined()])
}

function leafSchema(field: LeafFieldDef): z.ZodType {
  const missing = `${field.label} is needed before this can be saved.`

  switch (field.kind) {
    case 'money': {
      // Not a number: an amount is `Money`, integer paise, built by
      // `<RecordOnlyAmount>` from what somebody typed. A bare number reaching
      // this point is a float that has already lost precision.
      const amount = z.custom<unknown>((value) => isMoney(value), {
        error: `${field.label} must be a recorded amount.`,
      })
      return field.required ? amount : optional(amount)
    }

    case 'number': {
      let numeric = z.number({ error: missing })
      if (field.min !== undefined) numeric = numeric.min(field.min)
      if (field.max !== undefined) numeric = numeric.max(field.max)
      return field.required ? numeric : optional(numeric)
    }

    case 'boolean': {
      const flag = z.boolean({ error: missing })
      // A required checkbox means ticked — a consent nobody gave is not consent.
      return field.required ? flag.refine((value) => value, { error: missing }) : flag
    }

    case 'date': {
      const date = z
        .string({ error: missing })
        .regex(ISO_DATE, { error: `${field.label} must be a date.` })
      return field.required ? date : optional(date)
    }

    case 'cascade': {
      const depth = field.cascade?.levels.length ?? 0
      const path = z.array(z.string().min(1), { error: missing })
      return field.required
        ? path.min(depth, { error: `${field.label} needs a choice at every level.` })
        : path
    }

    case 'file': {
      const files = z.array(z.unknown(), { error: missing })
      return field.required ? files.min(1, { error: missing }) : files
    }

    case 'select': {
      const values = field.options?.map((option) => option.value)
      const choice =
        values === undefined || values.length === 0
          ? z.string({ error: missing }).min(1, { error: missing })
          : z.string({ error: missing }).refine((value) => values.includes(value), {
              error: `${field.label} is not one of the configured choices.`,
            })
      return field.required ? choice : optional(choice)
    }

    default: {
      let text = z.string({ error: missing })
      if (field.maxLength !== undefined) text = text.max(field.maxLength)
      return field.required ? text.min(1, { error: missing }) : optional(text)
    }
  }
}

function rowSchema(group: GroupFieldDef, row: FormValues): z.ZodType {
  const shape: Record<string, z.ZodType> = {}
  for (const child of group.fields) {
    if (!isFieldVisible(child, row)) continue
    shape[child.key] = leafSchema(child)
  }
  return z.looseObject(shape)
}

function groupSchema(group: GroupFieldDef, value: unknown): z.ZodType {
  const rows = Array.isArray(value) ? (value as readonly FormValues[]) : []
  // Each row is validated against its own branch state, so two rows of the same
  // group can legitimately ask for different things.
  const perRow = rows.map((row) => rowSchema(group, row))
  const minimum = group.required ? Math.max(1, group.minRows ?? 1) : (group.minRows ?? 0)

  return z
    .array(z.unknown())
    .min(minimum, { error: `${group.label} needs at least ${minimum} row.` })
    .superRefine((rowValues, ctx) => {
      rowValues.forEach((row, index) => {
        const schema = perRow[index] ?? rowSchema(group, (row ?? {}) as FormValues)
        const result = schema.safeParse(row)
        if (result.success) return
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: 'custom', path: [index, ...issue.path], message: issue.message })
        }
      })
    })
}

export type ZodBuildOptions = {
  /** Validate only these stages — how "next" gates one step without the rest. */
  readonly stageKeys?: readonly string[]
}

/**
 * The validator for a form as it currently stands.
 *
 * Roll-ups are absent from the shape, and that absence is the statement: a
 * derived figure is never a value in the record, so there is nothing to
 * validate and nothing anyone could submit into it.
 */
export function buildFormZodSchema(
  schema: FormSchema,
  values: FormValues,
  options: ZodBuildOptions = {},
): z.ZodType {
  const shape: Record<string, z.ZodType> = {}
  const wanted = options.stageKeys

  for (const stage of visibleStages(schema, values)) {
    if (wanted !== undefined && !wanted.includes(stage.key)) continue

    for (const field of stage.fields) {
      if (isRollUpField(field)) continue
      if (!isFieldVisible(field, values)) continue

      shape[field.key] = isGroupField(field)
        ? groupSchema(field, values[field.key])
        : leafSchema(field)
    }
  }

  // Loose, not strip: the values object carries the fields of stages a person
  // has branched away from, and a draft that silently dropped them would lose
  // typing the moment somebody flipped a toggle back and forth.
  return z.looseObject(shape)
}
