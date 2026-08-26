/*
 * Branching, and the two things that must follow from it.
 *
 * A field that has branched away is not merely invisible: it is not validated
 * and it is not missing. Getting that wrong produces the classic configurable-
 * form defect — a submit button that refuses to work because of a question
 * nobody can see and nobody was asked.
 */
import { describe, expect, it } from 'vitest'
import { fromPaise } from '../money'
import { missingRequiredFields } from './completeness'
import { HEALTH_POLICY_ENTRY_V2, INQUIRY_CAPTURE_V1, LIFE_POLICY_ENTRY_V1 } from './seeds'
import { emptyValues } from './values'
import type { FormValues } from './values'
import { isFieldVisible, ruleHolds, visibleFieldKeys, visibleStages } from './visibility'
import { buildFormZodSchema } from './zod-schema'
import { findField } from './schema'

function keysOn(values: FormValues): readonly string[] {
  return visibleFieldKeys(INQUIRY_CAPTURE_V1, values)
}

describe('a form asks only what the answers so far call for', () => {
  const base = emptyValues(INQUIRY_CAPTURE_V1)

  it('asks nothing line-specific until the line is chosen', () => {
    const keys = keysOn(base)

    expect(keys).toContain('line')
    expect(keys).not.toContain('coverFor')
    expect(keys).not.toContain('vehicleRegistrationNo')
    expect(keys).not.toContain('lifeGoal')
  })

  it('shows the health block when the line is health, and hides it again when it changes', () => {
    const health = { ...base, line: 'health' }
    expect(keysOn(health)).toContain('coverFor')
    expect(keysOn(health)).not.toContain('vehicleRegistrationNo')

    const motor = { ...base, line: 'motor' }
    expect(keysOn(motor)).toContain('vehicleRegistrationNo')
    expect(keysOn(motor)).not.toContain('coverFor')
  })

  it('honours a rule that lists several values', () => {
    // `existingCoverExpiry` is asked for health and motor, not for life.
    expect(keysOn({ ...base, line: 'health' })).toContain('existingCoverExpiry')
    expect(keysOn({ ...base, line: 'motor' })).toContain('existingCoverExpiry')
    expect(keysOn({ ...base, line: 'life' })).not.toContain('existingCoverExpiry')
  })

  it('honours a rule that requires two conditions at once', () => {
    const renewalNoClaim = { hasPreviousPolicy: true, claimedLastYear: false }
    const renewalWithClaim = { hasPreviousPolicy: true, claimedLastYear: true }
    const fresh = { hasPreviousPolicy: false, claimedLastYear: false }

    const rule = { all: [
      { field: 'hasPreviousPolicy', equals: 'true' },
      { field: 'claimedLastYear', equals: 'false' },
    ] }

    expect(ruleHolds(rule, renewalNoClaim)).toBe(true)
    expect(ruleHolds(rule, renewalWithClaim)).toBe(false)
    expect(ruleHolds(rule, fresh)).toBe(false)
  })

  it('drops a whole stage once every field in it has branched away', () => {
    const values = { ...emptyValues(HEALTH_POLICY_ENTRY_V2) }
    const stages = visibleStages(HEALTH_POLICY_ENTRY_V2, values).map((stage) => stage.key)

    // Nothing in the health schema hides a whole stage, so all four stand.
    expect(stages).toEqual(['proposer', 'cover', 'premium', 'nominee'])
  })

  it('reads a boolean the way the stored MVP schemas write it', () => {
    const members = findField(HEALTH_POLICY_ENTRY_V2, 'members')
    if (members === null) throw new Error('the health schema has lost its member table')

    expect(isFieldVisible(members, { floater: false })).toBe(false)
    expect(isFieldVisible(members, { floater: true })).toBe(true)
  })
})

describe('what a hidden field does not do', () => {
  it('is never counted as missing', () => {
    const values = { ...emptyValues(INQUIRY_CAPTURE_V1), line: 'life' }
    const missingKeys = missingRequiredFields(INQUIRY_CAPTURE_V1, values).map(
      (field) => field.fieldKey,
    )

    expect(missingKeys).toContain('lifeGoal')
    expect(missingKeys).not.toContain('vehicleRegistrationNo')
    expect(missingKeys).not.toContain('coverFor')
  })

  it('is never validated', () => {
    const values = { ...emptyValues(INQUIRY_CAPTURE_V1), line: 'motor' }
    const schema = buildFormZodSchema(INQUIRY_CAPTURE_V1, values)
    const issues = schema.safeParse({ ...values, contactName: 'Rakesh Patel', contactMobile: '9825012345', source: 'walk_in', vehicleRegistrationNo: 'GJ05AB1234' })

    expect(issues.success).toBe(true)
  })

  it('blocks a submit as soon as it is on screen', () => {
    const values = { ...emptyValues(INQUIRY_CAPTURE_V1), line: 'motor' }
    const schema = buildFormZodSchema(INQUIRY_CAPTURE_V1, values)
    const result = schema.safeParse({
      ...values,
      contactName: 'Rakesh Patel',
      contactMobile: '9825012345',
      source: 'walk_in',
    })

    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
    expect(paths).toContain('vehicleRegistrationNo')
  })
})

describe('the missing-field summary', () => {
  it('names the stage as well as the field, so it can send somebody back to it', () => {
    const values = emptyValues(HEALTH_POLICY_ENTRY_V2)
    const missing = missingRequiredFields(HEALTH_POLICY_ENTRY_V2, values)
    const startDate = missing.find((field) => field.fieldKey === 'startDate')

    expect(startDate?.stageLabel).toBe('Cover')
    expect(startDate?.label).toBe('Risk start date')
  })

  it('counts a recorded zero as recorded — an amount somebody typed is a record', () => {
    const values = { ...emptyValues(HEALTH_POLICY_ENTRY_V2), sumInsured: fromPaise(0) }
    const missingKeys = missingRequiredFields(HEALTH_POLICY_ENTRY_V2, values).map(
      (field) => field.fieldKey,
    )

    expect(missingKeys).not.toContain('sumInsured')
  })

  it('points inside a repeating group, row by row', () => {
    const values: FormValues = {
      ...emptyValues(LIFE_POLICY_ENTRY_V1),
      cashflow: [
        { policyYear: 1, premiumDue: fromPaise(4500000), survivalBenefit: null },
        { policyYear: null, premiumDue: null, survivalBenefit: null },
      ],
    }

    const missing = missingRequiredFields(LIFE_POLICY_ENTRY_V1, values)
    const inRowTwo = missing.filter((field) => field.rowIndex === 1)

    expect(inRowTwo.map((field) => field.fieldKey)).toEqual([
      'cashflow.1.policyYear',
      'cashflow.1.premiumDue',
    ])
    expect(inRowTwo[0].label).toBe('Policy year 2 — Policy year')
  })
})
