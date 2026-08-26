/**
 * The property surface of a field definition, as data.
 *
 * Borrowed wholesale from `components/guardrails/record-only-props.ts`, because
 * the trap it sets is the one this vocabulary needs most. "A schema cannot
 * express a computed amount" is a claim, and a claim nobody can run is a
 * comment. The literals below are checked against `keyof` their types with
 * `satisfies`, so they fail to compile if a property is missing from them AND
 * fail to compile if a name here is not a real property.
 *
 * `field-surface.test.ts` then asserts that no name in them matches the
 * vocabulary of computation — default, suggest, derive, formula, rate,
 * percentage, multiplier. Adding `defaultValue` to `LeafFieldDef` means adding
 * it here, which turns that test red. That is the trap, and it is the point.
 */
import type { GroupFieldDef, LeafFieldDef, RollUpFieldDef } from './schema'

const LEAF_SURFACE = {
  key: true,
  label: true,
  required: true,
  visibleWhen: true,
  masterTypeId: true,
  hint: true,
  kind: true,
  options: true,
  cascade: true,
  min: true,
  max: true,
  maxLength: true,
  accept: true,
  multiple: true,
  placeholder: true,
} satisfies Record<keyof LeafFieldDef, true>

const ROLLUP_SURFACE = {
  key: true,
  label: true,
  required: true,
  visibleWhen: true,
  masterTypeId: true,
  hint: true,
  kind: true,
  components: true,
  gstField: true,
} satisfies Record<keyof RollUpFieldDef, true>

const GROUP_SURFACE = {
  key: true,
  label: true,
  required: true,
  visibleWhen: true,
  masterTypeId: true,
  hint: true,
  kind: true,
  fields: true,
  minRows: true,
  maxRows: true,
  addLabel: true,
  rowLabel: true,
} satisfies Record<keyof GroupFieldDef, true>

export const LEAF_FIELD_PROPS = Object.keys(LEAF_SURFACE) as Array<keyof LeafFieldDef>
export const ROLLUP_FIELD_PROPS = Object.keys(ROLLUP_SURFACE) as Array<keyof RollUpFieldDef>
export const GROUP_FIELD_PROPS = Object.keys(GROUP_SURFACE) as Array<keyof GroupFieldDef>
