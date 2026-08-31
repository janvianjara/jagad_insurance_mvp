import { describe, expect, it } from 'vitest'

import {
  AMENDABLE_ENTITIES,
  AMEND_POLICIES,
  DISCARDABLE_ENTITIES,
  DISCARD_REASONS,
  ERASE_VERDICTS,
  RETAINED_ENTITIES,
  RETENTION_OBLIGATIONS,
  SUPPRESSIONS,
  amendDetail,
  amendVerdict,
  amendableFields,
  assessErasure,
  changedFields,
  discardVerdict,
  isDiscardReason,
  isDiscarded,
  mayEchoValue,
  restoreVerdict,
} from './amend'
import type { AmendContext } from './amend'

/**
 * The correction rules, tested where they live.
 *
 * Everything here is a refusal, and every refusal is asserted on its sentence
 * rather than on a boolean: the sentence is what a person reads on the screen,
 * and a guard that refuses for the wrong stated reason is a guard that will be
 * argued with rather than obeyed.
 */

function ctx(over: Partial<AmendContext> = {}): AmendContext {
  return {
    entity: 'Inquiry',
    reason: 'Taken down wrong on the call.',
    changes: { contactMobile: '9825110099' },
    before: { contactMobile: '9825110001' },
    issued: false,
    ...over,
  }
}

describe('the allow-list is an allow-list', () => {
  it('names every amendable entity and gives each a non-empty list', () => {
    for (const entity of AMENDABLE_ENTITIES) {
      expect(amendableFields(entity).length).toBeGreaterThan(0)
    }
  })

  it('never lists identity, provenance or a lifecycle field anywhere', () => {
    for (const entity of AMENDABLE_ENTITIES) {
      const fields = amendableFields(entity)
      expect(fields).not.toContain('id')
      expect(fields).not.toContain('systemNo')
      expect(fields).not.toContain('createdAt')
      expect(fields).not.toContain(AMEND_POLICIES[entity].lifecycleField)
    }
  })

  it('never lists an identity, bank or health field anywhere', () => {
    const suspicious = /(aadhaar|^pan$|panNumber|bankAccount|bankIfsc|health|diagnosis|remark)/i
    for (const entity of AMENDABLE_ENTITIES) {
      for (const field of amendableFields(entity)) {
        expect(`${entity}.${field}`).not.toMatch(suspicious)
      }
    }
  })

  it('declares every money field as one of the entity own fields', () => {
    for (const entity of AMENDABLE_ENTITIES) {
      for (const field of AMEND_POLICIES[entity].money) {
        expect(amendableFields(entity)).toContain(field)
      }
    }
  })

  it('keeps the address state correctable while the claim state is not', () => {
    // The same word, two meanings. A blanket refusal of "state" would block
    // correcting a customer's address; a blanket allowance would let somebody
    // set a claim's state behind the machine's back.
    expect(amendableFields('Customer')).toContain('state')
    expect(amendableFields('Claim')).not.toContain('state')
  })
})

describe('an amend that should not happen', () => {
  it('is refused when the reason is blank', () => {
    const verdict = amendVerdict(ctx({ reason: '   ' }))
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('has to say why')
    expect(verdict.guard).toBe('amendCarriesAReason')
  })

  it('is refused when it names no field', () => {
    const verdict = amendVerdict(ctx({ changes: {}, before: {} }))
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.guard).toBe('amendNamesAField')
  })

  it('is refused when it changes nothing', () => {
    const verdict = amendVerdict(
      ctx({ changes: { contactMobile: '9825110001' }, before: { contactMobile: '9825110001' } }),
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('differs from what is already recorded')
    expect(verdict.guard).toBe('amendChangesSomething')
  })

  it('is refused on identity and provenance, each by name', () => {
    for (const field of ['id', 'systemNo', 'createdAt']) {
      const verdict = amendVerdict(ctx({ changes: { [field]: 'x' }, before: { [field]: 'y' } }))
      expect(verdict.ok).toBe(false)
      if (verdict.ok) continue
      expect(verdict.reason).toContain(field)
      expect(verdict.guard).toBe('amendTouchesNoIdentity')
    }
  })

  it('is refused on a status, with the sentence that sends you to the workflow', () => {
    const verdict = amendVerdict(ctx({ changes: { status: 'accepted' }, before: { status: 'new' } }))
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toBe(
      'A status changes through the workflow, not through a correction. Use the move that belongs to it, so the guards that protect the move actually run.',
    )
    expect(verdict.guard).toBe('amendTouchesNoLifecycleState')
  })

  it('is refused on a claim state, which is spelled differently and means the same', () => {
    const verdict = amendVerdict(
      ctx({ entity: 'Claim', changes: { state: 'settled' }, before: { state: 'intimated' } }),
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.guard).toBe('amendTouchesNoLifecycleState')
  })

  it('is refused on an Aadhaar in any form, masked included', () => {
    for (const field of ['aadhaarNumber', 'aadhaarLast4']) {
      const verdict = amendVerdict(
        ctx({ entity: 'Customer', changes: { [field]: '1234' }, before: { [field]: null } }),
      )
      expect(verdict.ok).toBe(false)
      if (verdict.ok) continue
      expect(verdict.reason).toContain('Aadhaar')
      expect(verdict.guard).toBe('amendTouchesNoAadhaar')
    }
  })

  it('is refused on a money field once the insurer has issued (D3)', () => {
    const verdict = amendVerdict(
      ctx({
        entity: 'Policy',
        issued: true,
        changes: { finalPremium: 1_250_000 },
        before: { finalPremium: 1_200_000 },
      }),
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('endorsement')
    expect(verdict.guard).toBe('amendTouchesNoIssuedMoney')
  })

  it('allows the same money field while the record is still being entered', () => {
    const verdict = amendVerdict(
      ctx({
        entity: 'Policy',
        issued: false,
        changes: { finalPremium: 1_250_000 },
        before: { finalPremium: null },
      }),
    )
    expect(verdict.ok).toBe(true)
  })

  it('is refused on an insurer number that is already set, and allowed on one that is not', () => {
    const set = amendVerdict(
      ctx({ entity: 'Policy', changes: { insurerNo: 'X' }, before: { insurerNo: 'OG-77' } }),
    )
    expect(set.ok).toBe(false)
    if (!set.ok) {
      expect(set.reason).toContain('came from the insurer')
      expect(set.guard).toBe('amendTouchesNoInsurerNumber')
    }

    const unset = amendVerdict(
      ctx({ entity: 'Policy', changes: { insurerNo: 'OG-77' }, before: { insurerNo: null } }),
    )
    expect(unset.ok).toBe(true)
  })

  it('is refused on anything the entity does not list, and the sentence says what is listed', () => {
    const verdict = amendVerdict(
      ctx({ entity: 'Deal', changes: { awardKey: 'k' }, before: { awardKey: 'j' } }),
    )
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('awardKey is not a correctable field on a Deal')
    expect(verdict.reason).toContain('agentId, subAgentId')
    expect(verdict.guard).toBe('amendStaysInsideTheAllowList')
  })
})

describe('what an amend writes into the audit event', () => {
  it('carries the reason, the fields and the before and after of an ordinary one', () => {
    const detail = amendDetail(ctx())

    expect(detail.reason).toBe('Taken down wrong on the call.')
    expect(detail.fields).toBe('contactMobile')
    expect(detail.fieldCount).toBe(1)
    expect(detail['before.contactMobile']).toBe('9825110001')
    expect(detail['after.contactMobile']).toBe('9825110099')
  })

  it('carries a money field by name only, and never its figure', () => {
    const detail = amendDetail(
      ctx({
        entity: 'Policy',
        changes: { finalPremium: 1_250_000 },
        before: { finalPremium: null },
      }),
    )

    expect(detail.fields).toBe('finalPremium')
    expect(detail['before.finalPremium']).toBeUndefined()
    expect(detail['after.finalPremium']).toBeUndefined()
    expect(Object.values(detail)).not.toContain(1_250_000)
  })

  it('counts only the fields that actually differ', () => {
    const unchanged = ctx({
      changes: { contactMobile: '9825110001', contactName: 'Rakesh Patel' },
      before: { contactMobile: '9825110001', contactName: 'Rakesh' },
    })
    expect(changedFields(unchanged)).toEqual(['contactName'])
    expect(amendDetail(unchanged).fieldCount).toBe(1)
  })

  it('refuses to echo any field whose name reads like identity, bank or health', () => {
    expect(mayEchoValue('Customer', 'mobile')).toBe(true)
    expect(mayEchoValue('Customer', 'aadhaarLast4')).toBe(false)
    expect(mayEchoValue('Customer', 'bankAccountNumber')).toBe(false)
    expect(mayEchoValue('Policy', 'netPremium')).toBe(false)
  })
})

describe('discard is narrow, soft and reversible', () => {
  it('covers the three pre-contractual entities and nothing else', () => {
    expect([...DISCARDABLE_ENTITIES]).toEqual(['Inquiry', 'Quotation', 'Deal'])
    for (const retained of RETAINED_ENTITIES) {
      expect(DISCARDABLE_ENTITIES).not.toContain(retained)
    }
  })

  it('recognises exactly the six reasons and refuses anything else', () => {
    for (const reason of Object.values(DISCARD_REASONS)) {
      expect(isDiscardReason(reason)).toBe(true)
    }
    expect(isDiscardReason('because_i_said_so')).toBe(false)

    const verdict = discardVerdict({
      entity: 'Inquiry',
      reason: 'because_i_said_so',
      note: null,
      alreadyDiscarded: false,
      downstream: null,
    })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.guard).toBe('discardCarriesARecognisedReason')
  })

  it('refuses a record something downstream points at, and names it', () => {
    const verdict = discardVerdict({
      entity: 'Deal',
      reason: DISCARD_REASONS.enteredInError,
      note: null,
      alreadyDiscarded: false,
      downstream: 'the policy POL-4388',
    })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toContain('the policy POL-4388')
    expect(verdict.guard).toBe('discardLeavesNothingStranded')
  })

  it('refuses a second discard and a restore of something live', () => {
    const twice = discardVerdict({
      entity: 'Inquiry',
      reason: DISCARD_REASONS.duplicate,
      note: null,
      alreadyDiscarded: true,
      downstream: null,
    })
    expect(twice.ok).toBe(false)

    const live = restoreVerdict({ entity: 'Inquiry', reason: 'Not a duplicate.', discarded: false })
    expect(live.ok).toBe(false)
    if (live.ok) return
    expect(live.guard).toBe('restoreFindsADiscardedRecord')
  })

  it('refuses a restore with no reason', () => {
    const verdict = restoreVerdict({ entity: 'Inquiry', reason: '  ', discarded: true })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.guard).toBe('restoreCarriesAReason')
  })

  it('reads a mark off a row, and reads its absence as live', () => {
    expect(isDiscarded({ id: 'inq-1' })).toBe(false)
    expect(isDiscarded({ id: 'inq-1', discard: null })).toBe(false)
    expect(
      isDiscarded({
        id: 'inq-1',
        discard: {
          reason: DISCARD_REASONS.duplicate,
          note: null,
          discardedBy: 'usr-a',
          discardedAt: '2026-08-26T09:30:00.000Z',
        },
      }),
    ).toBe(true)
  })
})

describe('erasure answers, and never silently refuses', () => {
  it('retains under a named obligation where a live policy exists', () => {
    const assessment = assessErasure({
      livePolicyCount: 1,
      openClaimCount: 0,
      recordsInRetention: 3,
    })

    expect(assessment.verdict).toBe(ERASE_VERDICTS.retainedByObligation)
    expect(assessment.obligations).toEqual([RETENTION_OBLIGATIONS.livePolicy])
    expect(assessment.obligationNote).toContain('live insurance contract')
    expect(assessment.suppressed).toEqual([
      SUPPRESSIONS.marketing,
      SUPPRESSIONS.automatedReminders,
    ])
  })

  it('names both obligations when both apply', () => {
    const assessment = assessErasure({
      livePolicyCount: 2,
      openClaimCount: 1,
      recordsInRetention: 0,
    })
    expect(assessment.obligations).toEqual([
      RETENTION_OBLIGATIONS.livePolicy,
      RETENTION_OBLIGATIONS.openClaim,
    ])
  })

  it('is partial where nothing is live but records are still inside retention', () => {
    const assessment = assessErasure({
      livePolicyCount: 0,
      openClaimCount: 0,
      recordsInRetention: 2,
    })
    expect(assessment.verdict).toBe(ERASE_VERDICTS.partial)
    expect(assessment.obligations).toEqual([RETENTION_OBLIGATIONS.retentionPeriod])
    expect(assessment.suppressed.length).toBe(2)
  })

  it('erases only when the platform holds nothing that has to be kept', () => {
    const assessment = assessErasure({
      livePolicyCount: 0,
      openClaimCount: 0,
      recordsInRetention: 0,
    })
    expect(assessment.verdict).toBe(ERASE_VERDICTS.erased)
    expect(assessment.obligations).toEqual([])
    expect(assessment.obligationNote).toBe('')
    expect(assessment.suppressed).toEqual([])
  })

  it('has no verdict that means "no, and I am not telling you why"', () => {
    expect(Object.values(ERASE_VERDICTS)).toEqual(['erased', 'retained_by_obligation', 'partial'])
  })
})
