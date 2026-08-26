/**
 * Branching — resolving a schema's conditions against what has been typed.
 *
 * Pure, and deliberately so: "does the NCB block appear when the previous
 * policy toggle is on" is a question the test suite should be able to ask
 * without mounting React, and every branch in the seed schemas is asked that
 * way in `visibility.test.ts`.
 *
 * A hidden field is not merely invisible. It is not validated, it is not
 * counted as missing, and it never blocks a submit — a form that refuses to
 * submit because of a field nobody can see is the oldest bug in configurable
 * forms.
 */
import { conditionText, isBlank } from './values'
import type { FormValues } from './values'
import type { FormFieldDef, FormSchema, FormStage, VisibilityRule } from './schema'

/** Whether a condition holds for the values currently in the form. */
export function ruleHolds(rule: VisibilityRule, values: FormValues): boolean {
  if ('all' in rule) return rule.all.every((inner) => ruleHolds(inner, values))
  if ('any' in rule) return rule.any.some((inner) => ruleHolds(inner, values))

  const value = values[rule.field]
  if ('isFilled' in rule) return !isBlank(value)
  if ('oneOf' in rule) return rule.oneOf.includes(conditionText(value))
  return conditionText(value) === rule.equals
}

export function isFieldVisible(field: FormFieldDef, values: FormValues): boolean {
  return field.visibleWhen === null ? true : ruleHolds(field.visibleWhen, values)
}

export function isStageVisible(stage: FormStage, values: FormValues): boolean {
  const rule = stage.visibleWhen ?? null
  return rule === null ? true : ruleHolds(rule, values)
}

/** The fields of a stage that a person can see right now, in schema order. */
export function visibleFields(stage: FormStage, values: FormValues): readonly FormFieldDef[] {
  return stage.fields.filter((field) => isFieldVisible(field, values))
}

/**
 * The stages a person walks right now.
 *
 * A stage whose every field has branched away is dropped too: an empty step in
 * a wizard is a step that reads as a mistake.
 */
export function visibleStages(schema: FormSchema, values: FormValues): readonly FormStage[] {
  return schema.stages.filter(
    (stage) => isStageVisible(stage, values) && visibleFields(stage, values).length > 0,
  )
}

/** Keys of every visible field, group children excluded — rows carry their own. */
export function visibleFieldKeys(schema: FormSchema, values: FormValues): readonly string[] {
  return visibleStages(schema, values).flatMap((stage) =>
    visibleFields(stage, values).map((field) => field.key),
  )
}
