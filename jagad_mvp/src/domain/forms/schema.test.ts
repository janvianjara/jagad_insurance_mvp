/*
 * What a schema may and may not say.
 *
 * These are the product invariants expressed as assertions rather than as
 * comments: an amount cannot be computed, a reserved field cannot be removed,
 * and a form cannot branch on money. Every one of them is hostile on purpose —
 * a future change that loosens the vocabulary has to break one of these to land.
 */
import { describe, expect, it } from 'vitest'
import { defineFormSchema } from './define'
import { GROUP_FIELD_PROPS, LEAF_FIELD_PROPS, ROLLUP_FIELD_PROPS } from './field-surface'
import { RESERVED_FIELDS, reservedBreaches, reservedFieldsFor } from './reserved'
import type { FormSchema } from './schema'
import { SCHEMA_PROBLEM_CODES, assertValidFormSchema, validateFormSchema } from './validate'
import { HEALTH_POLICY_ENTRY_V2 } from './seeds'

/**
 * Every way a codebase spells "we worked this number out for you", borrowed
 * from the D3 test that guards `<RecordOnlyAmount>`. A schema property matching
 * this is a configuration path to an auto-filled amount.
 */
const COMPUTATION_WORDS =
  /default|suggest|calculat|comput|derive|prefill|pre-fill|preset|estimate|initial|fallback|formula|expression|percent|rate|multiplier|divis|recommend/i

function codes(schema: FormSchema): readonly string[] {
  return validateFormSchema(schema).map((problem) => problem.code)
}

/** A schema with one stage of whatever fields a test needs. */
function schemaOf(fields: FormSchema['stages'][number]['fields'], objectKey = 'test_object'): FormSchema {
  return {
    id: 'frm-test-v1',
    objectKey,
    productId: null,
    version: 1,
    publishedAt: '2026-01-05T04:30:00.000Z',
    active: true,
    stages: [{ key: 'only', label: 'Only', fields }],
  }
}

const AMOUNT = {
  key: 'basePremium',
  label: 'Base premium',
  kind: 'money',
  required: true,
  visibleWhen: null,
  masterTypeId: null,
} as const

describe('the vocabulary has no way to express a computed amount', () => {
  it('has no property on any field that means "work this out"', () => {
    const everyProp = [...LEAF_FIELD_PROPS, ...ROLLUP_FIELD_PROPS, ...GROUP_FIELD_PROPS]
    const offenders = everyProp.filter((name) => COMPUTATION_WORDS.test(name))

    expect(offenders).toEqual([])
  })

  it('offers exactly two derived figures, and both are additions of typed ones', () => {
    // The roll-up's whole surface: which typed leaves to add, and which typed
    // leaf holds GST. Nothing else — no rate, no formula, no source field.
    expect(ROLLUP_FIELD_PROPS).toContain('components')
    expect(ROLLUP_FIELD_PROPS).toContain('gstField')
    expect(ROLLUP_FIELD_PROPS).toHaveLength(9)
  })

  it('rejects a roll-up whose component is not an amount somebody typed', () => {
    const problems = codes(
      schemaOf([
        { key: 'term', label: 'Term', kind: 'number', required: false, visibleWhen: null, masterTypeId: null },
        {
          key: 'finalPremium',
          label: 'Final premium',
          kind: 'rollup',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          components: ['term'],
          gstField: null,
        },
      ]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.rollUpComponentNotTyped)
  })

  it('rejects a roll-up that sums another roll-up', () => {
    const problems = codes(
      schemaOf([
        AMOUNT,
        {
          key: 'netPremium',
          label: 'Net',
          kind: 'rollup',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          components: ['basePremium'],
          gstField: null,
        },
        {
          key: 'finalPremium',
          label: 'Final',
          kind: 'rollup',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          components: ['netPremium'],
          gstField: null,
        },
      ]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.rollUpComponentNotTyped)
  })

  it('rejects a GST that is itself derived', () => {
    const problems = codes(
      schemaOf([
        AMOUNT,
        {
          key: 'gstAmount',
          label: 'GST',
          kind: 'rollup',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          components: ['basePremium'],
          gstField: null,
        },
        {
          key: 'finalPremium',
          label: 'Final',
          kind: 'rollup',
          required: false,
          visibleWhen: null,
          masterTypeId: null,
          components: ['basePremium'],
          gstField: 'gstAmount',
        },
      ]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.rollUpGstNotTyped)
  })

  it('refuses to mark a derived figure required — nobody can fill one in', () => {
    const problems = codes(
      schemaOf([
        AMOUNT,
        {
          key: 'finalPremium',
          label: 'Final',
          kind: 'rollup',
          required: true,
          visibleWhen: null,
          masterTypeId: null,
          components: ['basePremium'],
          gstField: null,
        },
      ]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.rollUpRequired)
  })

  it('refuses a placeholder or a bound on an amount — both put a figure in front of a person', () => {
    const problems = codes(
      schemaOf([{ ...AMOUNT, placeholder: '12,500', max: 100000 }]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.moneyFieldDecorated)
  })

  it('refuses to branch on an amount', () => {
    const problems = codes(
      schemaOf([
        AMOUNT,
        {
          key: 'approvalNote',
          label: 'Approval note',
          kind: 'text',
          required: false,
          visibleWhen: { field: 'basePremium', equals: '50000' },
          masterTypeId: null,
        },
      ]),
    )

    expect(problems).toContain(SCHEMA_PROBLEM_CODES.conditionOnAmount)
  })
})

describe('reserved system fields cannot be removed', () => {
  it('names a reason for every reserved field — a rule nobody can explain is a rule that gets dropped', () => {
    for (const [objectKey, fields] of Object.entries(RESERVED_FIELDS)) {
      for (const field of fields) {
        expect(field.because.length, `${objectKey}.${field.key}`).toBeGreaterThan(20)
        expect(field.kinds.length, `${objectKey}.${field.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('reports the reserved field a schema dropped, and why it mattered', () => {
    const withoutExpiry: FormSchema = {
      ...HEALTH_POLICY_ENTRY_V2,
      stages: HEALTH_POLICY_ENTRY_V2.stages.map((stage) => ({
        ...stage,
        fields: stage.fields.filter((field) => field.key !== 'expiryDate'),
      })),
    }

    const breaches = reservedBreaches(withoutExpiry)
    expect(breaches).toHaveLength(1)
    expect(breaches[0].field.key).toBe('expiryDate')
    expect(breaches[0].reason).toBe('missing')
    expect(codes(withoutExpiry)).toContain(SCHEMA_PROBLEM_CODES.reservedMissing)
    expect(() => assertValidFormSchema(withoutExpiry)).toThrow(/renewal/i)
  })

  it('treats a rename as a removal', () => {
    const renamed: FormSchema = {
      ...HEALTH_POLICY_ENTRY_V2,
      stages: HEALTH_POLICY_ENTRY_V2.stages.map((stage) => ({
        ...stage,
        fields: stage.fields.map((field) =>
          field.key === 'startDate' ? { ...field, key: 'riskStart' } : field,
        ),
      })),
    }

    expect(reservedBreaches(renamed).map((breach) => breach.field.key)).toEqual(['startDate'])
  })

  it('treats a change of kind as a removal — the platform reads the concept, not the box', () => {
    const retyped: FormSchema = {
      ...HEALTH_POLICY_ENTRY_V2,
      stages: HEALTH_POLICY_ENTRY_V2.stages.map((stage) => ({
        ...stage,
        fields: stage.fields.map((field) =>
          field.key === 'expiryDate'
            ? { ...field, kind: 'text' as const, maxLength: 10 }
            : field,
        ),
      })),
    }

    const breaches = reservedBreaches(retyped)
    expect(breaches[0].reason).toBe('kind')
    expect(breaches[0].foundKind).toBe('text')
    expect(codes(retyped)).toContain(SCHEMA_PROBLEM_CODES.reservedKindChanged)
  })

  it('accepts either shape a reserved concept may legitimately take', () => {
    // `finalPremium` is a typed amount on the generic stored form and a roll-up
    // on the health form. Both are the final premium; neither is a removal.
    const kinds = reservedFieldsFor('policy_entry_health').find(
      (field) => field.key === 'finalPremium',
    )?.kinds

    expect(kinds).toContain('money')
    expect(kinds).toContain('rollup')
  })

  it('refuses the definition outright — at compile time and again at run time', () => {
    expect(() =>
      defineFormSchema(
        // @ts-expect-error - `panNumber` is reserved for kyc, and removing it must not compile.
        {
          id: 'frm-kyc-broken-v1',
          objectKey: 'kyc',
          productId: null,
          version: 1,
          publishedAt: '2026-01-05T04:30:00.000Z',
          active: true,
          stages: [
            {
              key: 'identity',
              label: 'Identity',
              fields: [
                {
                  key: 'aadhaarLast4',
                  label: 'Aadhaar last 4',
                  kind: 'text',
                  required: true,
                  visibleWhen: null,
                  masterTypeId: null,
                },
                {
                  key: 'addressLine',
                  label: 'Address',
                  kind: 'textarea',
                  required: true,
                  visibleWhen: null,
                  masterTypeId: null,
                },
              ],
            },
          ],
        },
      ),
    ).toThrow(/panNumber/)
  })
})

describe('schema hygiene', () => {
  it('rejects two fields with the same key — one would overwrite the other', () => {
    expect(codes(schemaOf([AMOUNT, { ...AMOUNT, label: 'Again' }]))).toContain(
      SCHEMA_PROBLEM_CODES.duplicateKey,
    )
  })

  it('rejects a choice with nothing to choose from', () => {
    expect(
      codes(
        schemaOf([
          { key: 'mode', label: 'Mode', kind: 'select', required: true, visibleWhen: null, masterTypeId: null },
        ]),
      ),
    ).toContain(SCHEMA_PROBLEM_CODES.choiceWithoutOptions)
  })

  it('rejects a condition on a field the schema does not contain', () => {
    expect(
      codes(
        schemaOf([
          {
            key: 'note',
            label: 'Note',
            kind: 'text',
            required: false,
            visibleWhen: { field: 'ghost', equals: 'yes' },
            masterTypeId: null,
          },
        ]),
      ),
    ).toContain(SCHEMA_PROBLEM_CODES.conditionUnknownField)
  })
})
