/**
 * Is this schema one the platform will render? — the config author's lint.
 *
 * Everything after P-12 is configuration rather than code, which means the
 * mistakes after P-12 are configuration mistakes, and a configuration mistake
 * with no check is a screen that renders wrong at a client demo. This module is
 * where a bad schema is caught: `<SchemaForm>` refuses to render one with a
 * blocking problem and prints the list, `defineFormSchema` throws on one, and
 * the seed test asserts every shipped schema is clean.
 *
 * Three of the rules below are product invariants rather than hygiene:
 *
 *   - a roll-up's components must be typed money leaves (D3: Net is the sum of
 *     figures a person entered, never of other derived figures);
 *   - a roll-up can never be `required` (nobody can fill in a derived figure);
 *   - a condition may not read a money field (branching on an amount is where
 *     "if the premium is over X" enters a platform that records money).
 */
import { isGroupField, isRollUpField } from './schema'
import type { FormSchema, LeafFieldDef, VisibilityRule } from './schema'
import { reservedBreaches } from './reserved'

export const SCHEMA_PROBLEM_CODES = {
  noStages: 'no-stages',
  emptyStage: 'empty-stage',
  duplicateKey: 'duplicate-key',
  reservedMissing: 'reserved-missing',
  reservedKindChanged: 'reserved-kind-changed',
  conditionUnknownField: 'condition-unknown-field',
  conditionOnAmount: 'condition-on-amount',
  rollUpEmpty: 'rollup-empty',
  rollUpComponentUnknown: 'rollup-component-unknown',
  rollUpComponentNotTyped: 'rollup-component-not-typed',
  rollUpGstNotTyped: 'rollup-gst-not-typed',
  rollUpRequired: 'rollup-required',
  moneyFieldDecorated: 'money-field-decorated',
  choiceWithoutOptions: 'choice-without-options',
  cascadeWithoutTree: 'cascade-without-tree',
  emptyGroup: 'empty-group',
} as const

export type SchemaProblemCode =
  (typeof SCHEMA_PROBLEM_CODES)[keyof typeof SCHEMA_PROBLEM_CODES]

/**
 * Blocking or advisory.
 *
 * Blocking means the renderer refuses: a removed reserved field or a derived
 * amount is a fault that must not reach a screen at all. Advisory means the
 * form still works and somebody should look at it — a choice whose options
 * were meant to come from a master list that has not been configured yet, which
 * is exactly the state two of P-04's stored rows are in.
 */
export const PROBLEM_SEVERITIES = {
  blocking: 'blocking',
  advisory: 'advisory',
} as const

export type ProblemSeverity = (typeof PROBLEM_SEVERITIES)[keyof typeof PROBLEM_SEVERITIES]

const ADVISORY_CODES: readonly string[] = [SCHEMA_PROBLEM_CODES.choiceWithoutOptions]

function severityOf(code: SchemaProblemCode): ProblemSeverity {
  return ADVISORY_CODES.includes(code)
    ? PROBLEM_SEVERITIES.advisory
    : PROBLEM_SEVERITIES.blocking
}

export type SchemaProblem = {
  readonly code: SchemaProblemCode
  /** The field at fault, or null when the whole schema is. */
  readonly fieldKey: string | null
  readonly message: string
  readonly severity: ProblemSeverity
}

type FieldIndex = {
  /** Top-level fields by key: kind, and whether it is a typed money leaf. */
  readonly kinds: ReadonlyMap<string, string>
}

function conditionFields(rule: VisibilityRule): readonly string[] {
  if ('all' in rule) return rule.all.flatMap(conditionFields)
  if ('any' in rule) return rule.any.flatMap(conditionFields)
  return [rule.field]
}

/**
 * Decoration a money field may not carry.
 *
 * `<RecordOnlyAmount>` has no placeholder prop and no bounds by design: the
 * placeholder is a constant instruction ("Type the figure") precisely so that
 * no configured text can put a figure in front of somebody. A schema that tries
 * is rejected here rather than silently ignored, because silently ignored means
 * the author believes it worked.
 */
function moneyDecoration(field: LeafFieldDef): readonly string[] {
  const decorated: string[] = []
  if (field.placeholder !== undefined) decorated.push('placeholder')
  if (field.min !== undefined) decorated.push('min')
  if (field.max !== undefined) decorated.push('max')
  if (field.options !== undefined) decorated.push('options')
  if (field.masterTypeId !== null) decorated.push('masterTypeId')
  return decorated
}

type Draft = Omit<SchemaProblem, 'severity'>

function checkLeaf(field: LeafFieldDef, problems: Draft[]): void {
  if (field.kind === 'money') {
    const decorated = moneyDecoration(field)
    if (decorated.length > 0) {
      problems.push({
        code: SCHEMA_PROBLEM_CODES.moneyFieldDecorated,
        fieldKey: field.key,
        message: `Amount field "${field.key}" carries ${decorated.join(', ')}. An amount is typed from a document; nothing may suggest a figure or bound it.`,
      })
    }
  }

  if (field.kind === 'select' && field.options === undefined && field.masterTypeId === null) {
    problems.push({
      code: SCHEMA_PROBLEM_CODES.choiceWithoutOptions,
      fieldKey: field.key,
      message: `Choice field "${field.key}" has neither inline options nor a master list.`,
    })
  }

  if (field.kind === 'cascade') {
    const cascade = field.cascade
    if (cascade === undefined || cascade.levels.length === 0 || cascade.nodes.length === 0) {
      problems.push({
        code: SCHEMA_PROBLEM_CODES.cascadeWithoutTree,
        fieldKey: field.key,
        message: `Cascade field "${field.key}" needs levels and a tree of nodes.`,
      })
    }
  }
}

function checkConditions(
  key: string,
  rule: VisibilityRule | null,
  index: FieldIndex,
  problems: Draft[],
): void {
  if (rule === null) return

  for (const referenced of conditionFields(rule)) {
    const kind = index.kinds.get(referenced)
    if (kind === undefined) {
      problems.push({
        code: SCHEMA_PROBLEM_CODES.conditionUnknownField,
        fieldKey: key,
        message: `"${key}" branches on "${referenced}", which this schema does not contain.`,
      })
      continue
    }
    if (kind === 'money' || kind === 'rollup') {
      problems.push({
        code: SCHEMA_PROBLEM_CODES.conditionOnAmount,
        fieldKey: key,
        message: `"${key}" branches on the amount "${referenced}". A form may not reason about money it was given (D3).`,
      })
    }
  }
}

/** Every way a schema can be wrong, in the order a reader meets them. */
export function validateFormSchema(schema: FormSchema): readonly SchemaProblem[] {
  const problems: Omit<SchemaProblem, 'severity'>[] = []

  if (schema.stages.length === 0) {
    problems.push({
      code: SCHEMA_PROBLEM_CODES.noStages,
      fieldKey: null,
      message: 'A schema needs at least one stage.',
    })
  }

  const kinds = new Map<string, string>()
  const seen = new Set<string>()

  for (const stage of schema.stages) {
    if (stage.fields.length === 0) {
      problems.push({
        code: SCHEMA_PROBLEM_CODES.emptyStage,
        fieldKey: null,
        message: `Stage "${stage.key}" has no fields.`,
      })
    }
    for (const field of stage.fields) {
      if (seen.has(field.key)) {
        problems.push({
          code: SCHEMA_PROBLEM_CODES.duplicateKey,
          fieldKey: field.key,
          message: `Field key "${field.key}" appears more than once. A key is how a record names a value; two of them means one overwrites the other.`,
        })
      }
      seen.add(field.key)
      kinds.set(field.key, field.kind)
    }
  }

  const index: FieldIndex = { kinds }

  for (const breach of reservedBreaches(schema)) {
    problems.push(
      breach.reason === 'missing'
        ? {
            code: SCHEMA_PROBLEM_CODES.reservedMissing,
            fieldKey: breach.field.key,
            message: `Reserved field "${breach.field.key}" has been removed or renamed. ${breach.field.because}`,
          }
        : {
            code: SCHEMA_PROBLEM_CODES.reservedKindChanged,
            fieldKey: breach.field.key,
            message: `Reserved field "${breach.field.key}" is a ${breach.foundKind}, which the platform cannot read. ${breach.field.because}`,
          },
    )
  }

  for (const stage of schema.stages) {
    checkConditions(stage.key, stage.visibleWhen ?? null, index, problems)

    for (const field of stage.fields) {
      checkConditions(field.key, field.visibleWhen, index, problems)

      if (isRollUpField(field)) {
        if (field.required) {
          problems.push({
            code: SCHEMA_PROBLEM_CODES.rollUpRequired,
            fieldKey: field.key,
            message: `Roll-up "${field.key}" is marked required. A derived figure is not something a person can fill in.`,
          })
        }
        if (field.components.length === 0) {
          problems.push({
            code: SCHEMA_PROBLEM_CODES.rollUpEmpty,
            fieldKey: field.key,
            message: `Roll-up "${field.key}" sums nothing. Net is the sum of typed components; with none there is no Net.`,
          })
        }
        for (const component of field.components) {
          const kind = kinds.get(component)
          if (kind === undefined) {
            problems.push({
              code: SCHEMA_PROBLEM_CODES.rollUpComponentUnknown,
              fieldKey: field.key,
              message: `Roll-up "${field.key}" sums "${component}", which this schema does not contain.`,
            })
            continue
          }
          if (kind !== 'money') {
            problems.push({
              code: SCHEMA_PROBLEM_CODES.rollUpComponentNotTyped,
              fieldKey: field.key,
              message: `Roll-up "${field.key}" sums "${component}", a ${kind}. Every component of a roll-up is an amount a person typed (D3).`,
            })
          }
        }
        if (field.gstField !== null && kinds.get(field.gstField) !== 'money') {
          problems.push({
            code: SCHEMA_PROBLEM_CODES.rollUpGstNotTyped,
            fieldKey: field.key,
            message: `Roll-up "${field.key}" reads GST from "${field.gstField}", which is not a typed amount. Final is Net plus a GST figure somebody entered.`,
          })
        }
        continue
      }

      if (isGroupField(field)) {
        if (field.fields.length === 0) {
          problems.push({
            code: SCHEMA_PROBLEM_CODES.emptyGroup,
            fieldKey: field.key,
            message: `Repeating group "${field.key}" has no fields.`,
          })
        }
        // A row's conditions read the row first and the form second, which is
        // how "sum assured shows once a rider is chosen" works inside one row.
        const rowIndex: FieldIndex = {
          kinds: new Map([
            ...kinds,
            ...field.fields.map((child) => [child.key, child.kind] as const),
          ]),
        }
        const rowKeys = new Set<string>()
        for (const child of field.fields) {
          checkConditions(child.key, child.visibleWhen, rowIndex, problems)
          if (rowKeys.has(child.key)) {
            problems.push({
              code: SCHEMA_PROBLEM_CODES.duplicateKey,
              fieldKey: `${field.key}.${child.key}`,
              message: `Field key "${child.key}" appears twice inside "${field.key}".`,
            })
          }
          rowKeys.add(child.key)
          checkLeaf(child, problems)
        }
        continue
      }

      checkLeaf(field, problems)
    }
  }

  return problems.map((problem) => ({ ...problem, severity: severityOf(problem.code) }))
}

/** The problems that stop a schema being rendered at all. */
export function blockingProblems(schema: FormSchema): readonly SchemaProblem[] {
  return validateFormSchema(schema).filter(
    (problem) => problem.severity === PROBLEM_SEVERITIES.blocking,
  )
}

/** The same check as a gate: returns the schema, or throws naming every fault. */
export function assertValidFormSchema(schema: FormSchema): FormSchema {
  const problems = blockingProblems(schema)
  if (problems.length === 0) return schema

  const detail = problems.map((problem) => `  - [${problem.code}] ${problem.message}`).join('\n')
  throw new Error(`Form schema "${schema.id}" cannot be rendered:\n${detail}`)
}
