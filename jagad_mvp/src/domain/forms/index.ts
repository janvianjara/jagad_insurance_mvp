/**
 * The form engine's domain half — plan §6 `SchemaForm`, canvas flow 6.2.
 *
 * Everything here is pure TypeScript: no React, no storage, no rendering. That
 * is what lets "the NCB block appears when the previous policy toggle is on",
 * "the draft survived the timeout" and "the January record renders January's
 * schema" be tested without mounting anything.
 *
 * `src/components/SchemaForm/` is the other half, and it is thin by design.
 */
export {
  COMPOSITE_FIELD_KINDS,
  LEAF_FIELD_KINDS,
  allFields,
  findField,
  isGroupField,
  isLeafField,
  isRollUpField,
} from './schema'
export type {
  CascadeDef,
  CascadeNodeDef,
  CompositeFieldKind,
  FieldDefBase,
  FieldKind,
  FieldOption,
  FormFieldDef,
  FormSchema,
  FormStage,
  GroupFieldDef,
  LeafFieldDef,
  LeafFieldKind,
  RollUpFieldDef,
  VisibilityRule,
} from './schema'

export { GROUP_FIELD_PROPS, LEAF_FIELD_PROPS, ROLLUP_FIELD_PROPS } from './field-surface'

export { RESERVED_FIELDS, reservedBreaches, reservedFieldsFor } from './reserved'
export type { ReservedBreach, ReservedField, ReservedObjectKey } from './reserved'

export {
  conditionText,
  emptyFieldValue,
  emptyRow,
  emptyValues,
  isBlank,
  leafFieldsByKey,
  readMoney,
  reviveMoney,
} from './values'
export type { FormFileRef, FormRow, FormScalar, FormValue, FormValues } from './values'

export { isFieldVisible, isStageVisible, ruleHolds, visibleFieldKeys, visibleFields, visibleStages } from './visibility'

export { isComplete, missingRequiredFields } from './completeness'
export type { MissingField } from './completeness'

export {
  PROBLEM_SEVERITIES,
  SCHEMA_PROBLEM_CODES,
  assertValidFormSchema,
  blockingProblems,
  validateFormSchema,
} from './validate'
export type { ProblemSeverity, SchemaProblem, SchemaProblemCode } from './validate'

export { buildFormZodSchema } from './zod-schema'
export type { ZodBuildOptions } from './zod-schema'

export { defineFormSchema } from './define'

export {
  pinSchema,
  resolveFormSchema,
  resolvePinnedSchema,
  schemaMatchesPin,
  schemaVersions,
} from './catalogue'
export type { SchemaPin, SchemaRef } from './catalogue'

export { DRAFT_FORMAT, decodeDraft, draftKey, encodeDraft } from './draft'
export type { DraftRestore, FormDraft } from './draft'

export {
  HEALTH_POLICY_ENTRY_V1,
  HEALTH_POLICY_ENTRY_V2,
  INQUIRY_CAPTURE_V1,
  KYC_CAPTURE_V1,
  LIFE_POLICY_ENTRY_V1,
  MOTOR_POLICY_ENTRY_V1,
  SEED_FORM_SCHEMAS,
} from './seeds'
