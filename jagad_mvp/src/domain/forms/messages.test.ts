/*
 * What an unanswered question says out loud.
 *
 * A control nobody has touched holds `null`, so zod's TYPE check fails before
 * any `.min`, `.regex` or `.refine` gets to run — and a message attached only to
 * the refinement never speaks. What reached the policy-entry screen instead was
 * zod's own default:
 *
 *     Invalid input: expected string, received null
 *
 * That is a sentence written for whoever wrote the schema. The person filling
 * the form in has been handed a bug report about their own blank field.
 *
 * These tests hold the fix at the level it was made: not "the premium mode field
 * says the right thing" but "no field of any kind can leak a library's internal
 * vocabulary". The sweep at the bottom is the one that matters, because the
 * defect was never about one field — it was about five branches of one switch,
 * and only one of them had been noticed.
 */
import { describe, expect, it } from 'vitest'
import { SEED_FORM_SCHEMAS } from './seeds'
import { findField, isGroupField, isRollUpField } from './schema'
import type { FormSchema, LeafFieldDef } from './schema'
import { emptyValues } from './values'
import type { FormValues } from './values'
import { visibleFieldKeys } from './visibility'
import { buildFormZodSchema } from './zod-schema'

/**
 * Vocabulary that belongs to zod, to JavaScript or to the schema author, and
 * never to somebody entering a policy. Matched case-insensitively against every
 * message a blank form produces.
 */
const NOT_FOR_A_PERSON = [
  'invalid input',
  'expected string',
  'expected number',
  'expected array',
  'expected boolean',
  'received null',
  'received undefined',
  'nan',
  'undefined',
  'zod',
]

/** Every message a completely blank form produces. */
function messagesOnBlank(schema: FormSchema): readonly string[] {
  const values = emptyValues(schema)
  const result = buildFormZodSchema(schema, values).safeParse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

/** Leaf fields on the schema's top level, which is where the reported bug was. */
function leaves(schema: FormSchema): readonly LeafFieldDef[] {
  return schema.stages
    .flatMap((stage) => stage.fields)
    .filter((field) => !isGroupField(field) && !isRollUpField(field)) as readonly LeafFieldDef[]
}

describe('an unanswered required field says what a person can act on', () => {
  it('names the field and what to do, rather than reporting a type mismatch', () => {
    // The exact field from the report: a required select, untouched, on the
    // health policy-entry form.
    const schema = SEED_FORM_SCHEMAS.find((candidate) =>
      leaves(candidate).some((field) => field.key === 'premiumMode' && field.required),
    )
    expect(schema, 'no seed schema carries a required premiumMode select').toBeDefined()

    const values = emptyValues(schema!)
    const result = buildFormZodSchema(schema!, values).safeParse(values)
    expect(result.success).toBe(false)

    const issue = result.success
      ? undefined
      : result.error.issues.find((candidate) => candidate.path.includes('premiumMode'))
    const field = findField(schema!, 'premiumMode')

    /*
     * "submitted", not "saved". Policy entry can always be saved part-finished
     * through "Save what is recorded"; a required field only blocks the submit.
     */
    expect(issue?.message).toBe(`${field?.label} is needed before this can be submitted.`)
  })

  it('leaks no library vocabulary from any field of any kind, on any seed schema', () => {
    // The sweep. The defect was five branches of one switch — select, date,
    // cascade, file and boolean all built their base type without a message —
    // and only the select was reported. This is what would have caught the
    // other four.
    const leaked: string[] = []

    for (const schema of SEED_FORM_SCHEMAS) {
      for (const message of messagesOnBlank(schema)) {
        const lower = message.toLowerCase()
        const hit = NOT_FOR_A_PERSON.find((word) => lower.includes(word))
        if (hit) leaked.push(`${schema.id}: "${message}" (matched "${hit}")`)
      }
    }

    expect(leaked, leaked.join('\n')).toEqual([])
  })

  it('says something for every required field a blank form is actually asking', () => {
    // A message that exists but never reaches the screen is the same defect
    // wearing a different hat, so this checks the count as well as the wording:
    // every visible required leaf must produce an issue.
    for (const schema of SEED_FORM_SCHEMAS) {
      const values: FormValues = emptyValues(schema)
      const visible = new Set(visibleFieldKeys(schema, values))
      const required = leaves(schema).filter((field) => field.required && visible.has(field.key))

      const result = buildFormZodSchema(schema, values).safeParse(values)
      const complained = new Set(
        result.success ? [] : result.error.issues.map((issue) => String(issue.path[0] ?? '')),
      )

      for (const field of required) {
        expect(
          complained.has(field.key),
          `${schema.id}: required field "${field.key}" is blank and the form says nothing about it`,
        ).toBe(true)
      }
    }
  })
})
