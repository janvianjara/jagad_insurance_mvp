import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import {
  AMOUNT_SOURCES,
  ENDORSEMENT_STATES,
  ENDORSEMENT_TYPES,
  PREMIUM_FIELD_NAMES,
  changeFitsEndorsementScope,
  claimsInPeriodCheck,
  endorsementDeltaIsTyped,
  endorsementMachine,
  nonFinancialRendersNoPremiumFields,
  premiumFieldsFor,
  refundIsTypedInsurerFigure,
  versionCarriesBothEndorsementNumbers,
} from './endorsement'
import type { EndorsementContext } from './endorsement'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<EndorsementContext> = {}): EndorsementContext {
  return {
    type: ENDORSEMENT_TYPES.nonFinancial,
    renderedFields: ['nomineeName', 'addressLine'],
    changedFields: ['nomineeName'],
    scope: { permittedFields: ['nomineeName', 'addressLine', 'mobile', 'sumInsured'] },
    endorsementNo: 'END-0117',
    insurerEndorsementNo: 'HDF/END/2026/8841',
    newDocumentVersion: 2,
    priorVersionLocked: true,
    ...overrides,
  }
}

describe('non-financial endorsement', () => {
  it('renders no premium fields at all', () => {
    expect(premiumFieldsFor(ENDORSEMENT_TYPES.nonFinancial)).toEqual([])
    expect(nonFinancialRendersNoPremiumFields(context()).ok).toBe(true)

    for (const field of PREMIUM_FIELD_NAMES) {
      const verdict = nonFinancialRendersNoPremiumFields(
        context({ renderedFields: ['nomineeName', field] }),
      )
      expect(verdict.ok).toBe(false)
      expect(reasonOf(verdict)).toContain(field)
    }
  })

  it('carries no premium delta and no refund', () => {
    const withDelta = nonFinancialRendersNoPremiumFields(
      context({ delta: { amount: money(1_200), source: AMOUNT_SOURCES.typedFromInsurer } }),
    )

    expect(withDelta.ok).toBe(false)
    expect(reasonOf(withDelta)).toContain('no premium delta')
  })

  it('gives the financial and cancellation types their own money fields', () => {
    expect(premiumFieldsFor(ENDORSEMENT_TYPES.financial)).toContain('premiumDelta')
    expect(premiumFieldsFor(ENDORSEMENT_TYPES.cancellation)).toEqual(['refundAmount'])
  })

  it('submits a correction without ever touching a premium block', () => {
    const { bus, seen } = recordingBus()
    const outcome = endorsementMachine.transition(
      ENDORSEMENT_STATES.nonFinancial,
      ENDORSEMENT_STATES.submitted,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['endorsement.submitted'])
  })
})

describe('financial endorsement', () => {
  it('types the delta from the insurer advice rather than working it out', () => {
    const financial = context({
      type: ENDORSEMENT_TYPES.financial,
      delta: { amount: money(3_400), source: AMOUNT_SOURCES.typedFromInsurer, insurerReference: 'HDF/END/8841' },
    })

    expect(endorsementDeltaIsTyped(financial).ok).toBe(true)

    const derived = endorsementDeltaIsTyped({
      ...financial,
      delta: { amount: money(3_400), source: AMOUNT_SOURCES.derived },
    })
    expect(derived.ok).toBe(false)
    expect(reasonOf(derived)).toContain('never calculated')

    const empty = endorsementDeltaIsTyped({ ...financial, delta: undefined })
    expect(empty.ok).toBe(false)
  })

  it('fires the commission delta hook on approval', () => {
    const { bus, seen } = recordingBus()
    const outcome = endorsementMachine.transition(
      ENDORSEMENT_STATES.submitted,
      ENDORSEMENT_STATES.approved,
      context({ type: ENDORSEMENT_TYPES.financial }),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['endorsement.approved', 'commission.booked'])
  })
})

describe('cancellation and the claims-in-period check', () => {
  it('returns instantly against the platform own claim data', () => {
    const clear = claimsInPeriodCheck([])
    const withClaim = claimsInPeriodCheck([{ claimId: 'CLM-0412', occurredOn: '2026-03-14T00:00:00.000Z' }])

    expect(clear).toEqual({ refundEligible: true, claimIds: [] })
    expect(withClaim.refundEligible).toBe(false)
    expect(withClaim.claimIds).toEqual(['CLM-0412'])
  })

  it('routes a cancellation with a claim in the period to refund_not_eligible', () => {
    const { bus, seen } = recordingBus()
    const claimed = context({
      type: ENDORSEMENT_TYPES.cancellation,
      claimsInPeriod: [{ claimId: 'CLM-0412', occurredOn: '2026-03-14T00:00:00.000Z' }],
    })

    const blocked = endorsementMachine.transition(
      ENDORSEMENT_STATES.claimsCheck,
      ENDORSEMENT_STATES.refundNotEligible,
      claimed,
      { bus },
    )

    expect(blocked.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['endorsement.refund_blocked'])

    const refundAnyway = endorsementMachine.canTransition(
      ENDORSEMENT_STATES.claimsCheck,
      ENDORSEMENT_STATES.refundTyped,
      claimed,
    )
    expect(refundAnyway.ok).toBe(false)
    expect(reasonOf(refundAnyway)).toContain('CLM-0412')
  })

  it('types the refund from the insurer figure when the period is clear', () => {
    const clear = context({
      type: ENDORSEMENT_TYPES.cancellation,
      claimsInPeriod: [],
      refund: {
        amount: money(9_600),
        source: AMOUNT_SOURCES.typedFromInsurer,
        insurerReference: 'HDF/RFD/2026/771',
      },
    })

    expect(refundIsTypedInsurerFigure(clear).ok).toBe(true)
    expect(endorsementMachine.canTransition(ENDORSEMENT_STATES.claimsCheck, ENDORSEMENT_STATES.refundTyped, clear).ok).toBe(true)

    const proRated = refundIsTypedInsurerFigure({
      ...clear,
      refund: { amount: money(9_600), source: AMOUNT_SOURCES.derived, insurerReference: 'HDF/RFD/2026/771' },
    })
    expect(proRated.ok).toBe(false)
    expect(reasonOf(proRated)).toContain('short-period calculation')
  })

  it('still lets a refund-ineligible cancellation be submitted', () => {
    expect(
      endorsementMachine.canTransition(
        ENDORSEMENT_STATES.refundNotEligible,
        ENDORSEMENT_STATES.submitted,
        context({ type: ENDORSEMENT_TYPES.cancellation }),
      ).ok,
    ).toBe(true)
  })
})

describe('a change too large for an endorsement', () => {
  it('is refused with a guard that suggests a fresh issue', () => {
    const replacesInsured = changeFitsEndorsementScope(context({ replacesInsuredEntity: true }))
    const outOfScope = changeFitsEndorsementScope(
      context({ changedFields: ['productId', 'nomineeName'] }),
    )

    expect(replacesInsured.ok).toBe(false)
    expect(reasonOf(replacesInsured)).toContain('Issue a fresh policy instead')
    expect(outOfScope.ok).toBe(false)
    expect(reasonOf(outOfScope)).toContain('productId')
    expect(reasonOf(outOfScope)).toContain('Issue a fresh policy instead')
  })

  it('blocks the type_selected fork rather than letting the form open', () => {
    const verdict = endorsementMachine.canTransition(
      ENDORSEMENT_STATES.typeSelected,
      ENDORSEMENT_STATES.nonFinancial,
      context({ replacesInsuredEntity: true }),
    )

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.guard).toBe('changeFitsEndorsementScope')
  })
})

describe('policy versioning after approval', () => {
  it('records both endorsement numbers and locks the version it replaced', () => {
    expect(versionCarriesBothEndorsementNumbers(context()).ok).toBe(true)

    expect(versionCarriesBothEndorsementNumbers(context({ insurerEndorsementNo: undefined })).ok).toBe(false)
    expect(versionCarriesBothEndorsementNumbers(context({ endorsementNo: undefined })).ok).toBe(false)
    expect(versionCarriesBothEndorsementNumbers(context({ newDocumentVersion: 1 })).ok).toBe(false)
    expect(versionCarriesBothEndorsementNumbers(context({ priorVersionLocked: false })).ok).toBe(false)
  })

  it('emits policy.versioned once the new immutable version is written', () => {
    const { bus, seen } = recordingBus()
    const outcome = endorsementMachine.transition(
      ENDORSEMENT_STATES.approved,
      ENDORSEMENT_STATES.policyVersioned,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['policy.versioned'])
  })
})
