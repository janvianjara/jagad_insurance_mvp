import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_FORBIDDEN_CLASSES,
  assistantForbiddenFields,
  classOf,
  DATA_CLASSES,
  ENTITY_NAMES,
  FIELD_CLASSES,
  fieldsOf,
  fieldsWithClass,
  isDataClass,
} from './dataclass'
import type { AssertFullyClassified, Classified } from './dataclass'

describe('the registry', () => {
  it('classifies every field of every seeded entity', () => {
    for (const entity of ENTITY_NAMES) {
      const fields = fieldsOf(entity)
      expect(fields.length).toBeGreaterThan(0)

      for (const field of fields) {
        expect(isDataClass(classOf(entity, field))).toBe(true)
      }
    }
  })

  it('covers the seven M0 entities', () => {
    expect(ENTITY_NAMES).toEqual([
      'Customer',
      'Member',
      'Policy',
      'Document',
      'Inquiry',
      'Quotation',
      'Deal',
    ])
  })

  it('names the four classes from the plan', () => {
    expect(DATA_CLASSES).toEqual(['operational', 'contact', 'sensitive', 'document-content'])
  })
})

describe('the Assistant boundary this registry feeds', () => {
  it('classes the masked Aadhaar as sensitive, not contact', () => {
    expect(classOf('Customer', 'aadhaarLast4')).toBe('sensitive')
    expect(classOf('Member', 'aadhaarLast4')).toBe('sensitive')
    expect(classOf('Customer', 'aadhaarNumber')).toBe('sensitive')
  })

  it('classes health data as sensitive, so it cannot reach the projection', () => {
    expect(classOf('Member', 'healthDeclaration')).toBe('sensitive')
    expect(classOf('Member', 'diagnosis')).toBe('sensitive')
    expect(classOf('Member', 'preExistingConditions')).toBe('sensitive')
  })

  it('separates document presence from document content', () => {
    expect(classOf('Document', 'isPresent')).toBe('operational')
    expect(classOf('Document', 'reviewState')).toBe('operational')
    expect(classOf('Document', 'extractedText')).toBe('document-content')
    expect(classOf('Document', 'fileUrl')).toBe('document-content')
  })

  it('keeps names and mobiles readable, because the Assistant cannot work without them', () => {
    expect(classOf('Customer', 'fullName')).toBe('contact')
    expect(classOf('Customer', 'mobile')).toBe('contact')
    expect(classOf('Inquiry', 'contactMobile')).toBe('contact')
  })

  it('keeps the money story operational — the Assistant reads amounts, never computes them', () => {
    expect(classOf('Policy', 'finalPremium')).toBe('operational')
    expect(classOf('Policy', 'netPremium')).toBe('operational')
    expect(classOf('Quotation', 'finalPayablePremium')).toBe('operational')
  })

  it('lists the forbidden fields per entity for P-05 to assert against', () => {
    expect(assistantForbiddenFields('Customer')).toEqual([
      'aadhaarNumber',
      'aadhaarLast4',
      'panNumber',
      'bankAccountNumber',
      'bankIfsc',
    ])
    expect(assistantForbiddenFields('Deal')).toEqual([])
  })

  it('is an allow-list problem, not a deny-list one: every entity has an operational core', () => {
    for (const entity of ENTITY_NAMES) {
      expect(fieldsWithClass(entity, 'operational').length).toBeGreaterThan(0)
    }
  })

  it('names both forbidden classes', () => {
    expect([...ASSISTANT_FORBIDDEN_CLASSES]).toEqual(['sensitive', 'document-content'])
  })
})

describe('classification is enforced by the compiler, not by review', () => {
  it('accepts an entity type whose every field is classified', () => {
    type Deal = {
      id: string
      systemNo: string
      status: string
      quotationId: string
      customerId: string
      ownerId: string
      agentId: string
      subAgentId: string
      agencyId: string
      lineItems: unknown[]
      createdAt: string
      consumedByPolicyId: string
    }

    const classified: AssertFullyClassified<'Deal', Deal> = true
    expect(classified).toBe(true)
  })

  it('rejects an entity type carrying an unclassified field', () => {
    type DealWithLeak = { id: string; proposerBankAccount: string }

    // @ts-expect-error — proposerBankAccount is not classified on Deal, so this
    // assignment fails to compile. That failure is the control: a new field
    // cannot reach an entity without a data class.
    const classified: AssertFullyClassified<'Deal', DealWithLeak> = true
    expect(classified).toBe(true)
  })

  it('requires an entity type to cover every classified field', () => {
    const shape: Classified<'Member'> = Object.fromEntries(
      fieldsOf('Member').map((field) => [field, null]),
    ) as Classified<'Member'>

    expect(Object.keys(shape).sort()).toEqual(Object.keys(FIELD_CLASSES.Member).sort())
  })
})
