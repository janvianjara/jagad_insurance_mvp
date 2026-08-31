import { describe, expect, it } from 'vitest'
import { KYC_CONSENT_STATES } from '../workflows'
import {
  KYC_BLOCKERS,
  REQUIREMENT_OUTCOMES,
  deriveCustomerState,
  kycStateReason,
} from './customerState'
import type { CustomerFacts, DocumentFact } from './customerState'

const NOW = new Date('2026-08-30T09:00:00.000Z')

const CHECKLIST = [
  { key: 'Aadhaar card', docType: 'aadhaar' },
  { key: 'PAN card', docType: 'pan' },
  { key: 'Passport photograph', docType: 'photo' },
] as const

function document(overrides: Partial<DocumentFact> & Pick<DocumentFact, 'docType'>): DocumentFact {
  return {
    isPresent: true,
    reviewState: 'verified',
    expiresAt: null,
    ...overrides,
  }
}

function facts(overrides: Partial<CustomerFacts> = {}): CustomerFacts {
  return {
    now: NOW,
    requirements: [...CHECKLIST],
    documents: CHECKLIST.map((item) => document({ docType: item.docType })),
    receipts: [],
    policies: [],
    aadhaarLast4Present: true,
    ...overrides,
  }
}

describe('a complete file is one where everything asked for is actually on file', () => {
  it('completes when every requirement is met and the record carries the masked Aadhaar', () => {
    const derived = deriveCustomerState(facts())

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.complete)
    expect(derived.blockers).toEqual([])
    expect(derived.outstanding).toEqual([])
    expect(derived.completenessScore).toBe(100)
  })

  it('counts a submitted document as on file, and says how many are verified', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar', reviewState: 'verified' }),
          document({ docType: 'pan', reviewState: 'submitted' }),
          document({ docType: 'photo', reviewState: 'submitted' }),
        ],
      }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.complete)
    expect(derived.satisfiedCount).toBe(3)
    expect(derived.verifiedCount).toBe(1)
    expect(kycStateReason(derived)).toContain('1 verified')
  })

  it('refuses to complete without the masked Aadhaar the record is supposed to carry', () => {
    const derived = deriveCustomerState(facts({ aadhaarLast4Present: false }))

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.partial)
    expect(derived.blockers).toContain(KYC_BLOCKERS.aadhaarMissing)
  })
})

describe('the drift the audit reported cannot be represented', () => {
  it('reads pending, not complete, when nothing at all is on file', () => {
    const derived = deriveCustomerState(
      facts({ documents: [], aadhaarLast4Present: false }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.pending)
    expect(derived.outstanding).toEqual(['Aadhaar card', 'PAN card', 'Passport photograph'])
    expect(derived.completenessScore).toBe(0)
  })

  it('names what is missing rather than asserting a state', () => {
    const derived = deriveCustomerState(
      facts({ documents: [document({ docType: 'aadhaar' })] }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.partial)
    expect(kycStateReason(derived)).toBe('Not on file: PAN card, Passport photograph.')
  })

  it('an empty checklist can never complete a file, because nobody decided what it needs', () => {
    // The old guard compared two caller-supplied lists, so passing no
    // requirements satisfied it vacuously and walked straight to complete.
    const derived = deriveCustomerState(facts({ requirements: [], documents: [] }))

    expect(derived.kycState).not.toBe(KYC_CONSENT_STATES.complete)
    expect(derived.blockers).toContain(KYC_BLOCKERS.noChecklist)
    expect(kycStateReason(derived)).toContain('No document checklist is configured')
  })
})

describe('completeness decays, because it is recomputed rather than remembered', () => {
  it('falls back when a document is rejected on review, with no transition invoked', () => {
    const before = deriveCustomerState(facts())
    expect(before.kycState).toBe(KYC_CONSENT_STATES.complete)

    const after = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan', reviewState: 'rejected' }),
          document({ docType: 'photo' }),
        ],
      }),
    )

    expect(after.kycState).toBe(KYC_CONSENT_STATES.partial)
    expect(after.rejected).toEqual(['PAN card'])
    expect(after.outstanding).toEqual([])
    expect(after.blockers).toContain(KYC_BLOCKERS.documentsRejected)
  })

  it('stops counting a document once its expiry has passed', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan' }),
          document({ docType: 'photo', expiresAt: '2026-08-29T00:00:00.000Z' }),
        ],
      }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.partial)
    expect(derived.outstanding).toEqual(['Passport photograph'])
  })

  it('counts a document awaiting review as on file, because §9 asks for presence', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan' }),
          document({ docType: 'photo', reviewState: 'awaiting' }),
        ],
      }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.complete)
    expect(derived.verifiedCount).toBe(2)
  })

  it('a verdict this module has never heard of satisfies nothing', () => {
    // Failing closed is the only safe direction: a vault that gains a state
    // tomorrow must not silently complete files today.
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan' }),
          document({ docType: 'photo', reviewState: 'quarantined' }),
        ],
      }),
    )

    expect(derived.outstanding).toEqual(['Passport photograph'])
  })

  it('does not count a document flagged absent even when a row exists for it', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan' }),
          document({ docType: 'photo', isPresent: false }),
        ],
      }),
    )

    expect(derived.outstanding).toEqual(['Passport photograph'])
  })
})

describe('lines the vault has no type for are answered at the desk', () => {
  it('a receipt satisfies a checklist line with no matching document type', () => {
    const derived = deriveCustomerState(
      facts({
        requirements: [...CHECKLIST, { key: 'Address proof', docType: null }],
        receipts: [{ key: 'Address proof' }],
      }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.complete)
    expect(derived.requirements).toContainEqual({
      key: 'Address proof',
      outcome: REQUIREMENT_OUTCOMES.received,
    })
  })

  it('a fresh copy recorded at the desk clears an earlier rejection', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [
          document({ docType: 'aadhaar' }),
          document({ docType: 'pan', reviewState: 'rejected' }),
          document({ docType: 'photo' }),
        ],
        receipts: [{ key: 'PAN card' }],
      }),
    )

    expect(derived.kycState).toBe(KYC_CONSENT_STATES.complete)
    expect(derived.rejected).toEqual([])
  })
})

describe('a record that contradicts itself raises an alarm, not a nudge', () => {
  it('reports a live policy held against an incomplete KYC file', () => {
    const derived = deriveCustomerState(
      facts({ documents: [], aadhaarLast4Present: false, policies: [{ status: 'issued' }] }),
    )

    expect(derived.hasLivePolicy).toBe(true)
    expect(derived.integrityAlarms).toHaveLength(1)
    expect(derived.integrityAlarms[0]).toContain('live policy')
  })

  it('stays quiet when a complete file holds a live policy', () => {
    const derived = deriveCustomerState(facts({ policies: [{ status: 'issued' }] }))

    expect(derived.integrityAlarms).toEqual([])
  })

  it('does not treat a draft or a lapsed policy as cover in force', () => {
    const derived = deriveCustomerState(
      facts({
        documents: [],
        aadhaarLast4Present: false,
        policies: [{ status: 'draft' }, { status: 'lapsed' }],
      }),
    )

    expect(derived.hasLivePolicy).toBe(false)
    expect(derived.integrityAlarms).toEqual([])
  })
})
