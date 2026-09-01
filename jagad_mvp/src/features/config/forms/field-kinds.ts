/**
 * The kind vocabulary the builder offers, and the two operations over it that
 * are not components — kept out of `FieldEditor.tsx` so that file exports only
 * components and fast refresh keeps working.
 */

import { COMPOSITE_FIELD_KINDS, LEAF_FIELD_KINDS, isGroupField, isRollUpField } from '../../../domain/forms'
import type { FieldKind, FormFieldDef, VisibilityRule } from '../../../domain/forms'
import type { IconName } from '../../../ui/Icon'
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

/**
 * The mark that stands for a kind, everywhere a kind is shown: the palette card
 * somebody adds a field from, and the row that field becomes. One map, so the
 * two can never disagree about what an amount looks like. Sprite symbols only —
 * this product has no emoji in it.
 */
export const KIND_ICONS: Readonly<Record<FieldKind, IconName>> = {
  text: 'edit',
  textarea: 'doc',
  number: 'chart',
  money: 'coin',
  date: 'calendar',
  select: 'chevron-down',
  boolean: 'check',
  file: 'upload',
  cascade: 'folder',
  rollup: 'spark',
  group: 'grid',
}

/**
 * What a kind is for, in one line, on the card that adds it.
 *
 * The amount and roll-up lines are the two that matter: both say, on the card
 * itself, that the platform records money and does not produce it (D3). Somebody
 * choosing a control is the earliest moment that can be said, and the cheapest.
 */
export const KIND_BLURBS: Readonly<Record<FieldKind, string>> = {
  text: 'One line. A name, a registration, a policy number.',
  textarea: 'Several lines. A remark, an address, a reason.',
  number: 'A count or a term. Never money.',
  money: 'An amount, typed from a document. No default, ever.',
  date: 'A single date.',
  select: 'One of a list — typed here, or a master list.',
  boolean: 'A yes or a no.',
  file: 'An attachment.',
  cascade: 'Dependent lists. Configured as a cascading master.',
  rollup: 'Net = the amounts you tick. Final = Net + the GST somebody typed.',
  group: 'A row that repeats — members, nominees, vehicles.',
}

/**
 * The label a new field of this kind is born with, before anybody renames it.
 * The parenthetical on "Roll-up (derived)" is dropped — it qualifies the kind on
 * the card, and would read as part of the field's name on the form.
 */
export function newFieldLabel(kind: FieldKind): string {
  return `New ${KIND_LABELS[kind].replace(/\s*\(.*\)$/, '').toLowerCase()}`
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
