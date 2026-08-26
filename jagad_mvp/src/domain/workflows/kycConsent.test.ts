import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { reasonOf } from './machine'
import {
  CONSENT_STATES,
  KYC_CONSENT_STATES,
  aadhaarMaskedToLast4,
  consentLinkCarriesNoSession,
  consentLinkIsTokenisedAndExpiring,
  consentMachine,
  containsFullAadhaar,
  everyExtractionConfirmed,
  issueConsentLink,
  kycMachine,
  maskAadhaarToLast4,
} from './kycConsent'
import type { ConsentContext, KycContext } from './kycConsent'

const NOW = new Date('2026-08-26T09:00:00.000Z')

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function kycContext(overrides: Partial<KycContext> = {}): KycContext {
  return {
    now: NOW,
    requiredDocuments: ['aadhaar', 'pan'],
    presentDocuments: ['aadhaar', 'pan'],
    extractedFields: [
      { name: 'aadhaarLast4', value: '4417', confirmed: true },
      { name: 'panNumber', value: 'ABCPD1234K', confirmed: true },
    ],
    aadhaarLast4: '4417',
    ...overrides,
  }
}

function consentContext(overrides: Partial<ConsentContext> = {}): ConsentContext {
  return {
    now: NOW,
    link: issueConsentLink('cnst_9f3a2b71c4d8e6f05a1b2c3d', new Date('2026-08-29T09:00:00.000Z')),
    ...overrides,
  }
}

describe('Aadhaar masking', () => {
  it('masks Aadhaar to last-4 on extraction', () => {
    expect(maskAadhaarToLast4('4321 8765 4417')).toBe('4417')
    expect(maskAadhaarToLast4('4321-8765-4417')).toBe('4417')
    expect(maskAadhaarToLast4('432187654417')).toBe('4417')
  })

  it('refuses to store the full number anywhere on the record', () => {
    const verdict = aadhaarMaskedToLast4(kycContext({ aadhaarFull: '432187654417' }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('last four digits')
  })

  it('catches a full Aadhaar still sitting in an extracted field', () => {
    expect(containsFullAadhaar('4321 8765 4417')).toBe(true)
    expect(containsFullAadhaar('4417')).toBe(false)

    const verdict = aadhaarMaskedToLast4(
      kycContext({
        extractedFields: [{ name: 'aadhaarNumber', value: '4321 8765 4417', confirmed: true }],
      }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('aadhaarNumber')
  })

  it('refuses a stored value that is not exactly four digits', () => {
    expect(aadhaarMaskedToLast4(kycContext({ aadhaarLast4: '84417' })).ok).toBe(false)
    expect(aadhaarMaskedToLast4(kycContext()).ok).toBe(true)
  })
})

describe('KYC completion', () => {
  it('fires the credentials recipe automatically on completion', () => {
    const { bus, seen } = recordingBus()
    const outcome = kycMachine.transition(
      KYC_CONSENT_STATES.partial,
      KYC_CONSENT_STATES.complete,
      kycContext(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['kyc.completed', 'credentials.generated', 'message.sent'])
  })

  it('offers no route to complete that skips the credentials recipe', () => {
    for (const from of [KYC_CONSENT_STATES.pending, KYC_CONSENT_STATES.partial]) {
      const edge = kycMachine.transitions[from]?.complete
      expect(edge?.alsoEmits).toContain('credentials.generated')
    }
  })

  it('will not complete while a required document is missing', () => {
    const verdict = kycMachine.canTransition(
      KYC_CONSENT_STATES.partial,
      KYC_CONSENT_STATES.complete,
      kycContext({ presentDocuments: ['aadhaar'] }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('pan')
  })

  it('will not complete while an extraction is unconfirmed, because OCR never silent-commits', () => {
    const unconfirmed = kycContext({
      extractedFields: [{ name: 'panNumber', value: 'ABCPD1234K', confirmed: false }],
    })

    expect(everyExtractionConfirmed(unconfirmed).ok).toBe(false)
    expect(kycMachine.canTransition(KYC_CONSENT_STATES.partial, KYC_CONSENT_STATES.complete, unconfirmed).ok).toBe(false)
  })
})

describe('consent link', () => {
  it('is tokenised, expiring, and carries no session', () => {
    const link = issueConsentLink('cnst_9f3a2b71c4d8e6f05a1b2c3d', new Date('2026-08-29T09:00:00.000Z'))

    expect(link.carriesSession).toBe(false)
    expect(link.grantsPortalAccess).toBe(false)
    expect(link.expiresAt).toBe('2026-08-29T09:00:00.000Z')
    expect(consentLinkIsTokenisedAndExpiring(consentContext()).ok).toBe(true)
    expect(consentLinkCarriesNoSession(consentContext()).ok).toBe(true)
  })

  it('refuses a short token, because a guessable link is an open door', () => {
    const verdict = consentLinkIsTokenisedAndExpiring(
      consentContext({ link: { ...issueConsentLink('short', new Date('2026-08-29T09:00:00.000Z')) } }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('token')
  })

  it('refuses a link that would carry a session or portal access', () => {
    const withSession = consentLinkCarriesNoSession(
      consentContext({
        link: { ...consentContext().link!, carriesSession: true },
      }),
    )
    const withPortal = consentLinkCarriesNoSession(
      consentContext({
        link: { ...consentContext().link!, grantsPortalAccess: true },
      }),
    )

    expect(withSession.ok).toBe(false)
    expect(reasonOf(withSession)).toContain('no session')
    expect(withPortal.ok).toBe(false)
  })

  it('refuses a submission after the link expires and marks it expired instead', () => {
    const stale = consentContext({
      link: issueConsentLink('cnst_9f3a2b71c4d8e6f05a1b2c3d', new Date('2026-08-20T09:00:00.000Z')),
    })

    expect(consentMachine.canTransition(CONSENT_STATES.linkIssued, CONSENT_STATES.submitted, stale).ok).toBe(false)
    expect(consentMachine.canTransition(CONSENT_STATES.linkIssued, CONSENT_STATES.expired, stale).ok).toBe(true)
  })

  it('accepts a submission while the link is live', () => {
    const { bus, seen } = recordingBus()
    const outcome = consentMachine.transition(
      CONSENT_STATES.linkIssued,
      CONSENT_STATES.submitted,
      consentContext(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['consent.submitted'])
  })
})
