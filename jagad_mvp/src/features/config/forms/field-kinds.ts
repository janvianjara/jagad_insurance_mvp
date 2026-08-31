/**
 * The kind vocabulary the builder offers, and the two operations over it that
 * are not components — kept out of `FieldEditor.tsx` so that file exports only
 * components and fast refresh keeps working.
 */

import { COMPOSITE_FIELD_KINDS, LEAF_FIELD_KINDS, isGroupField, isRollUpField } from '../../../domain/forms'
import type { FieldKind, FormFieldDef, VisibilityRule } from '../../../domain/forms'
import type { SelectOption } from '../../../ui/form'
import { newField } from './schema-draft'

/**
 * The kinds the builder offers for a new field.
 *
 * `cascade` is absent on purpose rather than by omission: a cascade's option
 * tree is a cascading master (Make, then Model, then Variant) configured on
 * `/config/masters`, and a tree typed into this drawer would be a second copy of
 * a list the agency already maintains. An existing cascade is shown and its
 * level names are editable.
 */
export const OFFERED_KINDS: readonly FieldKind[] = [
  LEAF_FIELD_KINDS.text,
  LEAF_FIELD_KINDS.textarea,
  LEAF_FIELD_KINDS.number,
  LEAF_FIELD_KINDS.money,
  LEAF_FIELD_KINDS.date,
  LEAF_FIELD_KINDS.select,
  LEAF_FIELD_KINDS.boolean,
  LEAF_FIELD_KINDS.file,
  COMPOSITE_FIELD_KINDS.rollup,
  COMPOSITE_FIELD_KINDS.group,
]

export const KIND_LABELS: Readonly<Record<FieldKind, string>> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  money: 'Amount',
  date: 'Date',
  select: 'Choice',
  boolean: 'Yes / no',
  file: 'Attachment',
  cascade: 'Cascade',
  rollup: 'Roll-up (derived)',
  group: 'Repeating group',
}

export function kindOptions(kinds: readonly FieldKind[]): readonly SelectOption[] {
  return kinds.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))
}

/**
 * What every field carries, whatever its kind. Patched through one function so
 * a union of eleven shapes stays a union rather than becoming eleven branches
 * at every call site.
 */
type BasePatch = {
  readonly label?: string
  readonly required?: boolean
  readonly visibleWhen?: VisibilityRule | null
  readonly hint?: string | undefined
}

export function patchBase(field: FormFieldDef, patch: BasePatch): FormFieldDef {
  if (isRollUpField(field)) {
    // A roll-up is never required: a derived figure is not something a person
    // can fill in, and the validator says so in those words.
    return { ...field, ...patch, required: false }
  }
  if (isGroupField(field)) return { ...field, ...patch }
  return { ...field, ...patch }
}

/** Moves a field to another kind, keeping what still applies and nothing else. */
export function changeKind(field: FormFieldDef, kind: FieldKind): FormFieldDef {
  return patchBase(newField(kind, field.label, field.key), {
    visibleWhen: field.visibleWhen,
    required: kind === COMPOSITE_FIELD_KINDS.rollup ? false : field.required,
    hint: field.hint,
  })
}
