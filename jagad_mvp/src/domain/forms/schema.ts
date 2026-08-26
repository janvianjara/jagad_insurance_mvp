/**
 * The form schema vocabulary — plan §6 (`SchemaForm`), canvas flow 6.2.
 *
 * This is the portability heart: policy entry, endorsement, claim intimation,
 * KYC and inquiry are one renderer with different data, so what a schema can
 * SAY is the product decision and this file is where it is made. Every kind of
 * field an agency will ever configure has to be expressible here, and — just as
 * important — the things the product forbids have to be inexpressible.
 *
 * Two absences are load-bearing:
 *
 *   1. There is no default, no prefill and no expression node anywhere in the
 *      vocabulary. A schema author cannot write "this amount comes from that
 *      one" because the grammar has no way to write it (D3). The only
 *      arithmetic in the language is `RollUpFieldDef`, whose two derived rows
 *      are exactly Net = sum of typed components and Final = Net + GST — the
 *      contract of `<RollUp>`, and nothing else.
 *   2. There is no `reserved` flag on a field. Reserved-ness belongs to the
 *      platform, not to the person editing the schema, so it lives in
 *      `reserved.ts` where a config author cannot switch it off. See that file.
 *
 * Relationship to `src/data/repo/config.ts`: the stored `FormSchema` there is
 * the row an admin publishes, and this type is a strict SUPERSET of it — every
 * stored schema is already a valid schema here, with no adapter and no copy.
 * `stored-schema.test.ts` proves that with the compiler. The superset adds the
 * composite kinds (roll-up, repeating group), the richer conditions and the
 * per-kind option payloads that the MVP row type does not yet carry.
 */

/** The leaf kinds: one value, one control. The first seven are the stored set. */
export const LEAF_FIELD_KINDS = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  money: 'money',
  date: 'date',
  select: 'select',
  boolean: 'boolean',
  file: 'file',
  cascade: 'cascade',
} as const

export type LeafFieldKind = (typeof LEAF_FIELD_KINDS)[keyof typeof LEAF_FIELD_KINDS]

/** The composite kinds: a field made of other fields, or of other fields' figures. */
export const COMPOSITE_FIELD_KINDS = {
  rollup: 'rollup',
  group: 'group',
} as const

export type CompositeFieldKind =
  (typeof COMPOSITE_FIELD_KINDS)[keyof typeof COMPOSITE_FIELD_KINDS]

export type FieldKind = LeafFieldKind | CompositeFieldKind

/**
 * A condition on another field's value.
 *
 * `{ field, equals }` is the stored MVP shape and stays first, so a published
 * row lands here unchanged. The rest are the branching the seed schemas
 * actually need: premium mode drives payment term, line of business drives
 * which cover block appears.
 *
 * A condition may never reference a money field or a roll-up — see
 * `validate.ts`. Branching on an amount is how "if the premium is over X"
 * creeps into a platform that records money rather than reasoning about it.
 */
export type VisibilityRule =
  | { readonly field: string; readonly equals: string }
  | { readonly field: string; readonly oneOf: readonly string[] }
  | { readonly field: string; readonly isFilled: true }
  | { readonly all: readonly VisibilityRule[] }
  | { readonly any: readonly VisibilityRule[] }

export type FieldOption = {
  readonly value: string
  readonly label: string
}

/** One node of a cascade — make, then model, then variant. */
export type CascadeNodeDef = {
  readonly value: string
  readonly label: string
  readonly children?: readonly CascadeNodeDef[]
}

export type CascadeDef = {
  /** One label per level; the depth of the tree must match its length. */
  readonly levels: readonly string[]
  readonly nodes: readonly CascadeNodeDef[]
}

/**
 * What every field carries, in the order the stored row carries it. Keeping
 * these five required (rather than optional-with-defaults) is what makes a
 * stored `FormFieldDef` assignable to this type without a conversion step.
 */
export type FieldDefBase = {
  readonly key: string
  readonly label: string
  readonly required: boolean
  /** Absent — `null` — means always shown. */
  readonly visibleWhen: VisibilityRule | null
  /** Names a master list; the options are fetched, never inlined in the schema. */
  readonly masterTypeId: string | null
  readonly hint?: string
}

/**
 * A leaf field.
 *
 * The per-kind payloads are optional properties on one object rather than a
 * discriminated union of nine members, and that is deliberate: the stored row's
 * `kind` is a union of seven, and only this shape lets a published row be a
 * schema here directly. The cost is that "a select with no options" is
 * representable, so `validateFormSchema` catches it — a runtime check with a
 * test, rather than a type that would have cost the alignment.
 *
 * Note what is not here: no `defaultValue`, no `suggested`, no `computedFrom`.
 * `field-surface.ts` mirrors this key list under a `satisfies` check and its
 * test fails the build if a computation word ever appears among them.
 */
export type LeafFieldDef = FieldDefBase & {
  readonly kind: LeafFieldKind
  /** Inline options. A select uses these or `masterTypeId`, never neither. */
  readonly options?: readonly FieldOption[]
  readonly cascade?: CascadeDef
  /** Bounds for `number` only — a count of members, a policy term in years. */
  readonly min?: number
  readonly max?: number
  readonly maxLength?: number
  /** `accept` and `multiple` for `file`. */
  readonly accept?: string
  readonly multiple?: boolean
  /** Never allowed on `money`: a figure shown in an amount box is a suggestion. */
  readonly placeholder?: string
}

/**
 * The roll-up: the only arithmetic the vocabulary can express.
 *
 * `components` names money leaves a person typed, and Net is their sum.
 * `gstField` names the typed GST leaf, and Final is Net plus it. There is no
 * third operation, no rate and no coefficient, and there is nowhere to put one:
 * a schema author who wants "Final = Net x 1.18" has no property to write it in.
 * `<RollUp>` renders it read-only, so the figure can never be mistaken for one
 * somebody entered.
 */
export type RollUpFieldDef = FieldDefBase & {
  readonly kind: 'rollup'
  /** Keys of typed `money` leaves in the same schema. Net is their sum. */
  readonly components: readonly string[]
  /** Key of the typed GST leaf, or null — then Final stays unrecorded, not zero. */
  readonly gstField: string | null
}

/**
 * A repeating group: rows of leaves. The LI cashflow table, riders, nominees.
 *
 * Rows hold leaves only. A roll-up inside a row, or a group inside a group,
 * would be aggregation across rows wearing a costume — and cross-row totals are
 * exactly the money the product refuses to compute.
 */
export type GroupFieldDef = FieldDefBase & {
  readonly kind: 'group'
  readonly fields: readonly LeafFieldDef[]
  readonly minRows?: number
  readonly maxRows?: number
  /** "Add a policy year" — the button's words belong to the schema, not the code. */
  readonly addLabel?: string
  /** "Policy year" — the per-row heading, numbered by the renderer. */
  readonly rowLabel?: string
}

export type FormFieldDef = LeafFieldDef | RollUpFieldDef | GroupFieldDef

export type FormStage = {
  readonly key: string
  readonly label: string
  readonly fields: readonly FormFieldDef[]
  readonly description?: string
  /** A whole stage can branch away — a motor form has no health declaration. */
  readonly visibleWhen?: VisibilityRule | null
}

/**
 * A published schema.
 *
 * `version` is the number a record pins. An old record renders under the
 * version it was captured with, never under today's — see `catalogue.ts`, which
 * is the mechanism that makes that promise keepable years later.
 */
export type FormSchema = {
  readonly id: string
  /** What is being captured: `policy_entry_health`, `inquiry`, `kyc`. */
  readonly objectKey: string
  /** A product-specific schema wins over the fallback for the same object. */
  readonly productId: string | null
  readonly version: number
  readonly stages: readonly FormStage[]
  readonly publishedAt: string
  /** False for a superseded version. Superseded is not deleted: records pin it. */
  readonly active: boolean
  readonly title?: string
}

export function isRollUpField(field: FormFieldDef): field is RollUpFieldDef {
  return field.kind === COMPOSITE_FIELD_KINDS.rollup
}

export function isGroupField(field: FormFieldDef): field is GroupFieldDef {
  return field.kind === COMPOSITE_FIELD_KINDS.group
}

export function isLeafField(field: FormFieldDef): field is LeafFieldDef {
  return !isRollUpField(field) && !isGroupField(field)
}

/** Every field of a schema in reading order, group children included. */
export function allFields(schema: FormSchema): readonly FormFieldDef[] {
  return schema.stages.flatMap((stage) => stage.fields)
}

/** The field with this key, at the top level of any stage. */
export function findField(schema: FormSchema, key: string): FormFieldDef | null {
  for (const stage of schema.stages) {
    for (const field of stage.fields) {
      if (field.key === key) return field
    }
  }
  return null
}
