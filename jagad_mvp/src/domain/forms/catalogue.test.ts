/*
 * Version pinning — canvas 6.2's "old records keep their original schema".
 *
 * The scenario these assertions describe is the one that happens for real: an
 * admin adds a nominee stage in May, and in September somebody opens a policy
 * captured in February. What they must see is February's form.
 */
import { describe, expect, it } from 'vitest'
import {
  pinSchema,
  resolveFormSchema,
  resolvePinnedSchema,
  schemaMatchesPin,
  schemaVersions,
} from './catalogue'
import { HEALTH_POLICY_ENTRY_V1, HEALTH_POLICY_ENTRY_V2, SEED_FORM_SCHEMAS } from './seeds'
import type { FormSchema } from './schema'

/** A product-specific schema for the same object, to test precedence. */
const PRODUCT_SPECIFIC: FormSchema = {
  ...HEALTH_POLICY_ENTRY_V2,
  id: 'frm-policy-health-optima-v1',
  productId: 'prd-he-ops',
  version: 1,
  publishedAt: '2026-06-02T05:00:00.000Z',
}

const CATALOGUE = [...SEED_FORM_SCHEMAS, PRODUCT_SPECIFIC]

describe('a new record takes the live schema', () => {
  it('resolves the highest active version when nothing is pinned', () => {
    const resolved = resolveFormSchema(CATALOGUE, { objectKey: 'policy_entry_health' })

    expect(resolved?.id).toBe(HEALTH_POLICY_ENTRY_V2.id)
    expect(resolved?.version).toBe(2)
  })

  it('prefers a product-specific schema over the fallback', () => {
    const resolved = resolveFormSchema(CATALOGUE, {
      objectKey: 'policy_entry_health',
      productId: 'prd-he-ops',
    })

    expect(resolved?.id).toBe(PRODUCT_SPECIFIC.id)
  })

  it('falls back when the product has no schema of its own', () => {
    const resolved = resolveFormSchema(CATALOGUE, {
      objectKey: 'policy_entry_health',
      productId: 'prd-unknown',
    })

    expect(resolved?.id).toBe(HEALTH_POLICY_ENTRY_V2.id)
  })

  it('returns nothing rather than a wrong form for an object it does not know', () => {
    expect(resolveFormSchema(CATALOGUE, { objectKey: 'endorsement' })).toBeNull()
  })
})

describe('an old record renders the schema it was captured with', () => {
  it('resolves the pinned version even though it is no longer live', () => {
    const february = { objectKey: 'policy_entry_health', version: 1 }
    const resolved = resolveFormSchema(CATALOGUE, february)

    expect(resolved?.id).toBe(HEALTH_POLICY_ENTRY_V1.id)
    expect(resolved?.active).toBe(false)
  })

  it('renders February s stages, not May s', () => {
    const pinned = resolveFormSchema(CATALOGUE, { objectKey: 'policy_entry_health', version: 1 })
    const live = resolveFormSchema(CATALOGUE, { objectKey: 'policy_entry_health' })

    const pinnedStages = pinned?.stages.map((stage) => stage.key) ?? []
    const liveStages = live?.stages.map((stage) => stage.key) ?? []

    expect(pinnedStages).toEqual(['proposer', 'cover', 'premium'])
    expect(liveStages).toEqual(['proposer', 'cover', 'premium', 'nominee'])
    expect(pinnedStages).not.toContain('nominee')
  })

  it('round-trips the pin a record stores', () => {
    const pin = pinSchema(HEALTH_POLICY_ENTRY_V1)

    expect(pin).toEqual({ schemaId: 'frm-policy-health-v1', schemaVersion: 1 })
    expect(resolvePinnedSchema(CATALOGUE, pin)?.id).toBe(HEALTH_POLICY_ENTRY_V1.id)
    expect(schemaMatchesPin(HEALTH_POLICY_ENTRY_V2, pin)).toBe(false)
  })

  it('reports a pin it can no longer honour rather than substituting one', () => {
    const gone = { schemaId: 'frm-policy-health-v0', schemaVersion: 0 }

    expect(resolvePinnedSchema(CATALOGUE, gone)).toBeNull()
  })

  it('lists every version of an object, newest first', () => {
    expect(
      schemaVersions(CATALOGUE, 'policy_entry_health').map((schema) => schema.id),
    ).toEqual([
      HEALTH_POLICY_ENTRY_V2.id,
      HEALTH_POLICY_ENTRY_V1.id,
      PRODUCT_SPECIFIC.id,
    ])
  })
})
