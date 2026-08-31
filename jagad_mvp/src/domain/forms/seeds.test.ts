/*
 * The seeds, and the relationship between this vocabulary and the stored one.
 *
 * The second half is the important half. `src/data/repo/config.ts` already
 * defines a `FormSchema` that P-04 seeded six rows against, and this engine
 * would be worth very little if it could not render them. It can: the domain
 * type is a strict superset, so a published row IS a schema here — no adapter,
 * no copy, no second shape to keep in step. The compiler check below fails the
 * build if that ever stops being true.
 */
import { describe, expect, it } from 'vitest'
import type { FormSchema as StoredFormSchema } from '../../data/repo/config'
import { FORM_SCHEMAS } from '../../data/fixtures/config-seed'
import { resolveFormSchema } from './catalogue'
import { reservedBreaches } from './reserved'
import type { FormSchema } from './schema'
import { SEED_FORM_SCHEMAS } from './seeds'
import { blockingProblems, validateFormSchema } from './validate'
import { missingRequiredFields } from './completeness'
import { emptyValues } from './values'

/**
 * The alignment, checked by the compiler rather than asserted in prose: every
 * stored row satisfies the domain type. If someone widens the stored row in a
 * way this engine cannot render, this line stops compiling.
 */
type StoredRowsAreSchemas = StoredFormSchema extends FormSchema ? true : never
const alignment: StoredRowsAreSchemas = true

describe('the schemas P-04 already stores', () => {
  it('are valid schemas for this renderer, unmodified', () => {
    expect(alignment).toBe(true)

    for (const stored of FORM_SCHEMAS) {
      // Blocking problems only: two stored rows carry a choice whose options
      // were meant to come from a master list nobody has configured yet, which
      // is a configuration gap rather than a schema the platform cannot render.
      const problems = blockingProblems(stored)
      expect(problems, `${stored.id}: ${problems.map((p) => p.message).join(' | ')}`).toEqual([])
    }
  })

  it('keep every reserved field the platform reads by name', () => {
    for (const stored of FORM_SCHEMAS) {
      expect(reservedBreaches(stored), stored.id).toEqual([])
    }
  })

  it('resolve by version out of one catalogue with the seeds beside them', () => {
    const catalogue: readonly FormSchema[] = [...FORM_SCHEMAS, ...SEED_FORM_SCHEMAS]

    // The stored pair: version 1 is superseded, version 2 is live.
    expect(resolveFormSchema(catalogue, { objectKey: 'policy_entry' })?.version).toBe(2)
    expect(resolveFormSchema(catalogue, { objectKey: 'policy_entry', version: 1 })?.id).toBe(
      'frm-policy-entry-v1',
    )
    expect(resolveFormSchema(catalogue, { objectKey: 'kyc' })?.id).toBe('frm-kyc-v1')
  })
})

describe('the seed schemas', () => {
  it('cover the entry forms P-12 owes the build, and the requirement forms P-18d adds', () => {
    expect(SEED_FORM_SCHEMAS.map((schema) => schema.objectKey)).toEqual([
      'policy_entry_health',
      'policy_entry_health',
      'policy_entry_motor',
      'policy_entry_life',
      'inquiry',
      'kyc',
      // FR-06.16: one key per line, so each keeps a single live version.
      'inquiry_requirement_health',
      'inquiry_requirement_motor',
    ])
  })

  it('are every one of them renderable, with nothing left even advisory', () => {
    for (const schema of SEED_FORM_SCHEMAS) {
      const problems = validateFormSchema(schema)
      expect(problems, `${schema.id}: ${problems.map((p) => p.message).join(' | ')}`).toEqual([])
    }
  })

  it('have unique ids and one live version per object', () => {
    const ids = SEED_FORM_SCHEMAS.map((schema) => schema.id)
    expect(new Set(ids).size).toBe(ids.length)

    const liveByObject = new Map<string, number>()
    for (const schema of SEED_FORM_SCHEMAS.filter((entry) => entry.active)) {
      liveByObject.set(schema.objectKey, (liveByObject.get(schema.objectKey) ?? 0) + 1)
    }
    expect([...liveByObject.values()].every((count) => count === 1)).toBe(true)
  })

  it('ask for nothing on a blank form that a person cannot see', () => {
    for (const schema of SEED_FORM_SCHEMAS) {
      const blank = emptyValues(schema)
      for (const field of missingRequiredFields(schema, blank)) {
        expect(field.stageKey, `${schema.id}.${field.fieldKey}`).not.toBe('')
      }
    }
  })

  it('records the life cashflow as transcription, never as a projection', () => {
    const life = SEED_FORM_SCHEMAS.find((schema) => schema.objectKey === 'policy_entry_life')
    const cashflow = life?.stages
      .flatMap((stage) => stage.fields)
      .find((field) => field.key === 'cashflow')

    expect(cashflow?.kind).toBe('group')
    // No roll-up reads the rows: there is no property that could name them.
    const rollUps = life?.stages
      .flatMap((stage) => stage.fields)
      .filter((field) => field.kind === 'rollup')
    for (const rollUp of rollUps ?? []) {
      if (rollUp.kind !== 'rollup') continue
      expect(rollUp.components).not.toContain('cashflow')
    }
  })
})
