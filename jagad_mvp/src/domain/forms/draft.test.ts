/*
 * Charter U6 at the codec level: what a draft keeps, and what it admits it
 * cannot keep.
 *
 * The component test mounts a form, types, throws the session away and mounts
 * it again. These are the same promise one layer down, where the awkward cases
 * live: a `Money` that has been through JSON, an attachment that cannot be, and
 * a schema that changed under a draft somebody left open overnight.
 */
import { describe, expect, it } from 'vitest'
import { fromPaise, isMoney } from '../money'
import { decodeDraft, draftKey, encodeDraft } from './draft'
import { HEALTH_POLICY_ENTRY_V1, HEALTH_POLICY_ENTRY_V2 } from './seeds'
import { emptyValues } from './values'
import type { FormValues } from './values'

const ENTITY = 'POL-DRAFT-0219'

const TYPED: FormValues = {
  ...emptyValues(HEALTH_POLICY_ENTRY_V2),
  fullName: 'Rakesh Patel',
  mobile: '9825012345',
  sumInsured: fromPaise(1000000000),
  basePremium: fromPaise(1248500),
  gstAmount: fromPaise(224730),
  floater: true,
  members: [
    { memberName: 'Rakesh Patel', memberRelationship: 'self', memberDateOfBirth: '1979-03-11' },
    { memberName: 'Nita Patel', memberRelationship: 'spouse', memberDateOfBirth: '1982-07-02' },
  ],
  nomineeName: 'Nita Patel',
}

function roundTrip(values: FormValues, into = HEALTH_POLICY_ENTRY_V2) {
  const encoded = encodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, values, '2026-08-26T09:12:00.000Z')
  // Through JSON on purpose: that is what localStorage does to it.
  return decodeDraft(into, ENTITY, JSON.parse(JSON.stringify(encoded)))
}

describe('a draft is keyed by the record it belongs to', () => {
  it('gives two records two keys', () => {
    expect(draftKey('policy_entry_health', 'POL-DRAFT-0219')).not.toBe(
      draftKey('policy_entry_health', 'POL-DRAFT-0224'),
    )
  })

  it('refuses a draft stored under another record', () => {
    const encoded = encodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, TYPED, '2026-08-26T09:12:00.000Z')

    expect(decodeDraft(HEALTH_POLICY_ENTRY_V2, 'POL-DRAFT-0224', encoded)).toBeNull()
  })

  it('refuses anything that is not a draft rather than throwing', () => {
    expect(decodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, 'not json at all')).toBeNull()
    expect(decodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, { format: 99 })).toBeNull()
    expect(decodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, null)).toBeNull()
  })
})

describe('what survives the round trip', () => {
  it('keeps the typing', () => {
    const restored = roundTrip(TYPED)

    expect(restored?.values.fullName).toBe('Rakesh Patel')
    expect(restored?.values.floater).toBe(true)
    expect(restored?.savedAt).toBe('2026-08-26T09:12:00.000Z')
  })

  it('rebuilds an amount as Money, not as a number', () => {
    const restored = roundTrip(TYPED)
    const amount = restored?.values.basePremium

    expect(isMoney(amount)).toBe(true)
    expect(amount).toEqual(fromPaise(1248500))
  })

  it('keeps every row of a repeating group, in order', () => {
    const rows = roundTrip(TYPED)?.values.members

    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(2)
    expect((rows as Record<string, unknown>[])[1].memberName).toBe('Nita Patel')
  })

  it('never stores a derived figure', () => {
    const encoded = encodeDraft(HEALTH_POLICY_ENTRY_V2, ENTITY, TYPED, '2026-08-26T09:12:00.000Z')

    expect(Object.keys(encoded.values)).not.toContain('finalPremium')
  })
})

describe('what a draft admits it cannot keep', () => {
  it('names the attachments that have to be added again', () => {
    const withFile: FormValues = {
      ...TYPED,
      // A `File` cannot be serialised; only its shape reaches the codec.
      nomineeName: 'Nita Patel',
    }
    const encoded = encodeDraft(
      { ...HEALTH_POLICY_ENTRY_V2, stages: [
        ...HEALTH_POLICY_ENTRY_V2.stages,
        {
          key: 'documents',
          label: 'Documents',
          fields: [
            { key: 'proposalCopy', label: 'Proposal copy', kind: 'file', required: true, visibleWhen: null, masterTypeId: null },
          ],
        },
      ] },
      ENTITY,
      { ...withFile, proposalCopy: [{ name: 'proposal.pdf', size: 12000 }] },
      '2026-08-26T09:12:00.000Z',
    )

    expect(encoded.detachedFileFields).toEqual(['proposalCopy'])
    expect(encoded.values.proposalCopy).toBeNull()
  })

  it('drops what a changed schema no longer has, and says which', () => {
    // Typed under version 2, reopened under version 1: the nominee stage is gone.
    const restored = roundTrip(TYPED, HEALTH_POLICY_ENTRY_V1)

    expect(restored?.schemaChanged).toBe(true)
    expect(restored?.droppedFieldKeys).toContain('nomineeName')
    expect(restored?.values.nomineeName).toBeUndefined()
    // Everything version 1 still has is untouched.
    expect(restored?.values.fullName).toBe('Rakesh Patel')
  })

  it('says nothing changed when nothing did', () => {
    expect(roundTrip(TYPED)?.schemaChanged).toBe(false)
    expect(roundTrip(TYPED)?.droppedFieldKeys).toEqual([])
  })
})
