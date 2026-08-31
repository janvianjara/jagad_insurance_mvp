/**
 * The draft a person edits before anything is written — pure, so every rule the
 * builder enforces can be asserted without mounting a screen.
 *
 * Two absences are load-bearing here, and they are the same two the grammar
 * itself is built on (`src/domain/forms/schema.ts`):
 *
 *   1. `newField` produces no `defaultValue`, no `placeholder` on money and no
 *      expression of any kind, because there is no such property to produce. A
 *      builder that offered "this amount comes from that one" would have to
 *      invent a node the renderer cannot read (D3).
 *   2. Nothing here can remove a reserved field. `removeField` refuses by key,
 *      the screen offers no control for one, and `validateFormSchema` catches a
 *      draft that got there some other way. Three refusals, none of them the
 *      schema's own — reserved-ness belongs to the platform.
 */

import { isGroupField, isLeafField, isRollUpField, reservedFieldsFor } from '../../../domain/forms'
import type {
  FieldKind,
  FormFieldDef,
  FormStage,
  LeafFieldDef,
  ReservedField,
  VisibilityRule,
} from '../../../domain/forms'

/* ------------------------------------------------------------------- naming */

/** The key a record will store. Written once, at creation, and never again. */
export function draftKeyFrom(label: string, taken: readonly string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('') || 'field'

  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}${suffix}`)) suffix += 1
  return `${base}${suffix}`
}

/** `policy_entry_health` reads as "Policy entry health" in a column. */
export function objectLabel(objectKey: string): string {
  const words = objectKey.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/* ------------------------------------------------------------------ reading */

export function allDraftFields(stages: readonly FormStage[]): readonly FormFieldDef[] {
  return stages.flatMap((stage) => stage.fields)
}

export function draftFieldKeys(stages: readonly FormStage[]): readonly string[] {
  return stages.flatMap((stage) =>
    stage.fields.flatMap((field) =>
      isGroupField(field)
        ? [field.key, ...field.fields.map((child) => child.key)]
        : [field.key],
    ),
  )
}

/**
 * The typed money leaves a roll-up may sum, and the typed GST leaf it may add.
 *
 * Only `money` leaves, and only top-level ones. A roll-up over a roll-up would
 * be a derived figure feeding a derived figure, and a roll-up over a repeating
 * group's rows would be a cross-row total — both are money this platform
 * records rather than computes.
 */
export function moneyLeafKeys(stages: readonly FormStage[]): readonly string[] {
  return allDraftFields(stages)
    .filter((field) => isLeafField(field) && field.kind === 'money')
    .map((field) => field.key)
}

/**
 * The fields a condition may read.
 *
 * Amounts are absent by rule rather than by oversight: `validateFormSchema`
 * rejects a schema that branches on a money field or a roll-up, because "if the
 * premium is over X" is how reasoning about money enters a platform that only
 * records it. Groups and files are absent because neither has a value a
 * condition can compare.
 */
export function conditionSourceKeys(
  stages: readonly FormStage[],
  exceptKey: string,
): readonly string[] {
  return allDraftFields(stages)
    .filter(
      (field) =>
        field.key !== exceptKey &&
        isLeafField(field) &&
        field.kind !== 'money' &&
        field.kind !== 'file',
    )
    .map((field) => field.key)
}

export function labelsByKey(stages: readonly FormStage[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    stages.flatMap((stage) =>
      stage.fields.flatMap((field) =>
        isGroupField(field)
          ? [
              [field.key, field.label] as const,
              ...field.fields.map((child) => [child.key, child.label] as const),
            ]
          : [[field.key, field.label] as const],
      ),
    ),
  )
}

/**
 * A cheap signature of everything the renderer reads once, on mount: the stages
 * it walks, the controls it builds and the conditions it resolves. The preview
 * remounts when this changes and re-renders when only wording does.
 */
export function structureSignature(stages: readonly FormStage[]): string {
  return stages
    .map((stage) => {
      const fields = stage.fields
        .map((field) => {
          const condition = field.visibleWhen === null ? '' : JSON.stringify(field.visibleWhen)
          const children = isGroupField(field)
            ? field.fields.map((child) => `${child.key}:${child.kind}`).join(',')
            : isRollUpField(field)
              ? `${field.components.join('+')}|${field.gstField ?? ''}`
              : ''
          return `${field.key}:${field.kind}:${field.required}:${condition}:${children}`
        })
        .join(';')
      const stageCondition = stage.visibleWhen ? JSON.stringify(stage.visibleWhen) : ''
      return `${stage.key}[${stageCondition}]{${fields}}`
    })
    .join('||')
}

export function conditionCount(stages: readonly FormStage[]): number {
  return stages.reduce(
    (total, stage) =>
      total +
      (stage.visibleWhen ? 1 : 0) +
      stage.fields.filter((field) => field.visibleWhen !== null).length,
    0,
  )
}

/* ----------------------------------------------------------------- reserved */

export function reservedFieldFor(
  objectKey: string,
  fieldKey: string,
): ReservedField | null {
  return reservedFieldsFor(objectKey).find((entry) => entry.key === fieldKey) ?? null
}

/** Whether a stage may be dropped, and — when it may not — the sentence to show. */
export function stageRemovalRefusal(
  objectKey: string,
  stage: FormStage,
): string | null {
  const held = stage.fields
    .map((field) => reservedFieldFor(objectKey, field.key))
    .filter((entry): entry is ReservedField => entry !== null)

  if (held.length === 0) return null
  return `"${stage.label}" holds ${held.map((entry) => `"${entry.key}"`).join(', ')}, which the platform reads by name. Move ${held.length === 1 ? 'it' : 'them'} to another stage before removing this one.`
}

/* ----------------------------------------------------------------- creating */

/**
 * A blank field of a given kind.
 *
 * Read what is not set. A money leaf gets no placeholder and no bounds, because
 * `validateFormSchema` rejects both and because a figure shown in an amount box
 * is a suggestion. A roll-up is never `required` and starts summing nothing,
 * which is a fault the validator names until somebody says what it sums. And no
 * kind gets a default, because the grammar has nowhere to put one.
 */
export function newField(kind: FieldKind, label: string, key: string): FormFieldDef {
  const base = { key, label: label.trim() || key, visibleWhen: null, masterTypeId: null }

  if (kind === 'rollup') {
    return { ...base, kind, required: false, components: [], gstField: null }
  }
  if (kind === 'group') {
    return { ...base, kind, required: false, fields: [], rowLabel: 'Row', addLabel: 'Add a row' }
  }
  // A new choice carries neither options nor a master list, and the validator
  // says so as an advisory until one is chosen — which is the honest state, and
  // exactly the state two of the stored rows are already in.
  return { ...base, kind, required: false }
}

export function newStage(label: string, taken: readonly string[]): FormStage {
  return { key: draftKeyFrom(label, taken), label: label.trim() || 'New stage', fields: [] }
}

/* ------------------------------------------------------------------ writing */

function move<T>(rows: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta
  if (index < 0 || target < 0 || target >= rows.length) return rows
  const next = [...rows]
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  return next
}

export function addStage(stages: readonly FormStage[], label: string): readonly FormStage[] {
  return [...stages, newStage(label, stages.map((stage) => stage.key))]
}

export function patchStage(
  stages: readonly FormStage[],
  stageKey: string,
  patch: Partial<Omit<FormStage, 'key' | 'fields'>>,
): readonly FormStage[] {
  return stages.map((stage) => (stage.key === stageKey ? { ...stage, ...patch } : stage))
}

export function removeStage(
  stages: readonly FormStage[],
  stageKey: string,
): readonly FormStage[] {
  return stages.filter((stage) => stage.key !== stageKey)
}

export function moveStage(
  stages: readonly FormStage[],
  stageKey: string,
  delta: number,
): readonly FormStage[] {
  return move(stages, stages.findIndex((stage) => stage.key === stageKey), delta)
}

export function addField(
  stages: readonly FormStage[],
  stageKey: string,
  field: FormFieldDef,
): readonly FormStage[] {
  return stages.map((stage) =>
    stage.key === stageKey ? { ...stage, fields: [...stage.fields, field] } : stage,
  )
}

export function replaceField(
  stages: readonly FormStage[],
  stageKey: string,
  fieldKey: string,
  next: FormFieldDef,
): readonly FormStage[] {
  return stages.map((stage) =>
    stage.key === stageKey
      ? { ...stage, fields: stage.fields.map((field) => (field.key === fieldKey ? next : field)) }
      : stage,
  )
}

/**
 * Drops a field — unless the platform reads it by name.
 *
 * The builder never renders a control that would call this with a reserved key.
 * The check is here anyway: the domain refuses removal three ways precisely
 * because a screen is the layer most likely to forget, and this is the screen.
 */
export function removeField(
  stages: readonly FormStage[],
  objectKey: string,
  stageKey: string,
  fieldKey: string,
): readonly FormStage[] {
  if (reservedFieldFor(objectKey, fieldKey) !== null) return stages
  return stages.map((stage) =>
    stage.key === stageKey
      ? { ...stage, fields: stage.fields.filter((field) => field.key !== fieldKey) }
      : stage,
  )
}

export function moveField(
  stages: readonly FormStage[],
  stageKey: string,
  fieldKey: string,
  delta: number,
): readonly FormStage[] {
  return stages.map((stage) =>
    stage.key === stageKey
      ? {
          ...stage,
          fields: move(stage.fields, stage.fields.findIndex((field) => field.key === fieldKey), delta),
        }
      : stage,
  )
}

/* ------------------------------------------------- group rows (leaves only) */

export function addGroupChild(
  stages: readonly FormStage[],
  stageKey: string,
  groupKey: string,
  child: LeafFieldDef,
): readonly FormStage[] {
  return stages.map((stage) =>
    stage.key === stageKey
      ? {
          ...stage,
          fields: stage.fields.map((field) =>
            field.key === groupKey && isGroupField(field)
              ? { ...field, fields: [...field.fields, child] }
              : field,
          ),
        }
      : stage,
  )
}

export function removeGroupChild(
  stages: readonly FormStage[],
  stageKey: string,
  groupKey: string,
  childKey: string,
): readonly FormStage[] {
  return stages.map((stage) =>
    stage.key === stageKey
      ? {
          ...stage,
          fields: stage.fields.map((field) =>
            field.key === groupKey && isGroupField(field)
              ? { ...field, fields: field.fields.filter((child) => child.key !== childKey) }
              : field,
          ),
        }
      : stage,
  )
}

/* --------------------------------------------------------------- conditions */

/** The one condition shape the builder writes: one field, one value. */
export function equalsRule(field: string, equals: string): VisibilityRule {
  return { field, equals }
}

/** How a condition reads in a row summary. Nested rules are shown as a count. */
export function ruleSummary(
  rule: VisibilityRule | null,
  labels: Readonly<Record<string, string>>,
): string {
  if (rule === null) return 'Always shown'
  if ('all' in rule) return `Shown when all of ${rule.all.length} conditions hold`
  if ('any' in rule) return `Shown when any of ${rule.any.length} conditions hold`
  const name = labels[rule.field] ?? rule.field
  if ('isFilled' in rule) return `Shown once "${name}" is filled`
  if ('oneOf' in rule) return `Shown when "${name}" is one of ${rule.oneOf.join(', ')}`
  return `Shown when "${name}" is "${rule.equals}"`
}

/** Whether the builder can edit this rule in place, or only show and clear it. */
export function isSimpleRule(
  rule: VisibilityRule | null,
): rule is { readonly field: string; readonly equals: string } {
  return rule !== null && !('all' in rule) && !('any' in rule) && 'equals' in rule
}
