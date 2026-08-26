/**
 * What is still missing — charter U6's other half.
 *
 * Draft safety is not only "your typing survived the timeout"; it is also
 * "here is exactly what is left". This produces that list: every required field
 * a person can currently see and has not filled, named by its stage so the
 * summary can send them straight back to it.
 *
 * Roll-ups never appear here. A derived figure is not something anyone can
 * fill, so calling it missing would be blaming a person for arithmetic.
 */
import { isGroupField, isRollUpField } from './schema'
import type { FormSchema, GroupFieldDef } from './schema'
import { isBlank } from './values'
import type { FormRow, FormValues } from './values'
import { isFieldVisible, visibleStages } from './visibility'

export type MissingField = {
  readonly stageKey: string
  readonly stageLabel: string
  readonly fieldKey: string
  /** What the summary prints — a group row says which row it means. */
  readonly label: string
  /** Row index inside a repeating group, or null for a top-level field. */
  readonly rowIndex: number | null
}

function rows(value: unknown): readonly FormRow[] {
  return Array.isArray(value) ? (value as readonly FormRow[]) : []
}

function missingInsideGroup(
  group: GroupFieldDef,
  value: unknown,
  stageKey: string,
  stageLabel: string,
): readonly MissingField[] {
  const found: MissingField[] = []
  const groupRows = rows(value)

  if (group.required && groupRows.length === 0) {
    return [
      { stageKey, stageLabel, fieldKey: group.key, label: group.label, rowIndex: null },
    ]
  }

  const minimum = group.minRows ?? 0
  if (groupRows.length < minimum) {
    found.push({
      stageKey,
      stageLabel,
      fieldKey: group.key,
      label: `${group.label} — at least ${minimum} to record`,
      rowIndex: null,
    })
  }

  groupRows.forEach((row, index) => {
    for (const field of group.fields) {
      if (!field.required) continue
      // A row's own conditions read the row, not the form: a rider's sum
      // assured depends on the rider chosen in that row.
      if (!isFieldVisible(field, row as FormValues)) continue
      if (!isBlank(row[field.key])) continue
      found.push({
        stageKey,
        stageLabel,
        fieldKey: `${group.key}.${index}.${field.key}`,
        label: `${group.rowLabel ?? group.label} ${index + 1} — ${field.label}`,
        rowIndex: index,
      })
    }
  })

  return found
}

/** Every required, visible, unfilled field, in the order a person meets them. */
export function missingRequiredFields(
  schema: FormSchema,
  values: FormValues,
): readonly MissingField[] {
  const missing: MissingField[] = []

  for (const stage of visibleStages(schema, values)) {
    for (const field of stage.fields) {
      if (isRollUpField(field)) continue
      if (!isFieldVisible(field, values)) continue

      if (isGroupField(field)) {
        missing.push(...missingInsideGroup(field, values[field.key], stage.key, stage.label))
        continue
      }

      if (!field.required) continue
      if (!isBlank(values[field.key])) continue
      missing.push({
        stageKey: stage.key,
        stageLabel: stage.label,
        fieldKey: field.key,
        label: field.label,
        rowIndex: null,
      })
    }
  }

  return missing
}

/** Nothing visible and required is unfilled. Not the same as "valid". */
export function isComplete(schema: FormSchema, values: FormValues): boolean {
  return missingRequiredFields(schema, values).length === 0
}
