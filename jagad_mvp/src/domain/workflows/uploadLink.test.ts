import { describe, expect, it } from 'vitest'
import {
  UPLOAD_FORBIDDEN_DOC_TYPES,
  UPLOAD_LINK_LIMITS,
  issueUploadLink,
  recordUploadAccepted,
  recordUploadAttempt,
  revokeUploadLink,
  uploadIsAcceptable,
  uploadLinkExpiryFrom,
  uploadLinkHasCapacity,
  uploadLinkIsIssuable,
  uploadLinkIsOpen,
  uploadLinkNotExpired,
  uploadLinkNotRevoked,
  uploadLinkWithinAttemptLimit,
  uploadTypeIsAccepted,
} from './uploadLink'
import type { IssueUploadLinkInput, UploadLink } from './uploadLink'

const NOW = new Date('2026-08-30T09:00:00.000Z')
const TOKEN = 'a'.repeat(32)

function input(over: Partial<IssueUploadLinkInput> = {}): IssueUploadLinkInput {
  return {
    token: TOKEN,
    claimId: 'clm-0412',
    docTypes: ['discharge_summary'],
    issuedAt: NOW,
    expiresAt: uploadLinkExpiryFrom(NOW),
    ...over,
  }
}

function link(over: Partial<UploadLink> = {}): UploadLink {
  return { ...issueUploadLink(input()), ...over }
}

function reasonOf(result: { ok: boolean; reason?: string }): string {
  return result.ok ? '' : (result.reason ?? '')
}

describe('issuing an upload link', () => {
  it('builds a link that carries no session and no portal access', () => {
    const built = issueUploadLink(input())
    expect(built.carriesSession).toBe(false)
    expect(built.grantsPortalAccess).toBe(false)
    expect(built.usedUploads).toBe(0)
    expect(built.attempts).toBe(0)
    expect(built.revokedAt).toBeNull()
  })

  it('expires, and by default within the week', () => {
    const built = issueUploadLink(input())
    const days = (new Date(built.expiresAt).getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBe(UPLOAD_LINK_LIMITS.lifetimeDays)
  })

  it('refuses a short token, because a guessable link is not a link', () => {
    const verdict = uploadLinkIsIssuable(input({ token: 'abc' }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('unguessable')
  })

  it('refuses a link that accepts nothing', () => {
    expect(uploadLinkIsIssuable(input({ docTypes: [] })).ok).toBe(false)
  })

  it('refuses a link that never closes', () => {
    const verdict = uploadLinkIsIssuable(input({ expiresAt: NOW }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('permanent open door')
  })

  it.each(UPLOAD_FORBIDDEN_DOC_TYPES)(
    'refuses to collect %s on a claim link, and says where identity documents go',
    (docType) => {
      const verdict = uploadLinkIsIssuable(input({ docTypes: [docType] }))
      expect(verdict.ok).toBe(false)
      expect(reasonOf(verdict)).toContain('consent link')
    },
  )
})

describe('whether the page opens at all', () => {
  it('opens for a live link', () => {
    expect(uploadLinkIsOpen({ now: NOW, link: link() }).ok).toBe(true)
  })

  it('closes once the window has passed', () => {
    const stale = link({ expiresAt: new Date('2026-08-29T09:00:00.000Z').toISOString() })
    expect(uploadLinkNotExpired({ now: NOW, link: stale }).ok).toBe(false)
    expect(uploadLinkIsOpen({ now: NOW, link: stale }).ok).toBe(false)
  })

  it('closes once the desk withdraws it', () => {
    const withdrawn = revokeUploadLink(link(), NOW)
    expect(uploadLinkNotRevoked({ now: NOW, link: withdrawn }).ok).toBe(false)
  })

  it('closes once it has been opened too many times, and says nothing about why', () => {
    const hammered = link({ attempts: UPLOAD_LINK_LIMITS.maxAttempts })
    const verdict = uploadLinkWithinAttemptLimit({ now: NOW, link: hammered })
    expect(verdict.ok).toBe(false)
    // A rate limit that explains itself is a rate limit that teaches the guesser.
    expect(reasonOf(verdict)).toContain('try again shortly')
    expect(reasonOf(verdict)).not.toContain('token')
  })

  it('refuses a link that claims to carry a session', () => {
    expect(uploadLinkIsOpen({ now: NOW, link: link({ carriesSession: true }) }).ok).toBe(false)
    expect(uploadLinkIsOpen({ now: NOW, link: link({ grantsPortalAccess: true }) }).ok).toBe(false)
  })
})

describe('whether a document may be taken', () => {
  it('takes a type the link is open for', () => {
    expect(
      uploadIsAcceptable({ now: NOW, link: link(), offeredDocType: 'discharge_summary' }).ok,
    ).toBe(true)
  })

  it('refuses a type the link is not collecting, and names what it is collecting', () => {
    const verdict = uploadTypeIsAccepted({ now: NOW, link: link(), offeredDocType: 'policy_pdf' })
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('discharge_summary')
  })

  it('refuses an identity document even if a link somehow lists it', () => {
    const wrong = link({ docTypes: ['aadhaar'] })
    const verdict = uploadTypeIsAccepted({ now: NOW, link: wrong, offeredDocType: 'aadhaar' })
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('nothing has been kept')
  })

  it('refuses once the link is full, and says how many it took', () => {
    const full = link({ usedUploads: UPLOAD_LINK_LIMITS.maxUploads })
    const verdict = uploadLinkHasCapacity({ now: NOW, link: full })
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain(String(UPLOAD_LINK_LIMITS.maxUploads))
  })

  it('will not take a document through a closed link', () => {
    const withdrawn = revokeUploadLink(link(), NOW)
    expect(
      uploadIsAcceptable({ now: NOW, link: withdrawn, offeredDocType: 'discharge_summary' }).ok,
    ).toBe(false)
  })
})

describe('counting', () => {
  it('counts every open, accepted or not', () => {
    expect(recordUploadAttempt(link()).attempts).toBe(1)
    expect(recordUploadAttempt(recordUploadAttempt(link())).attempts).toBe(2)
  })

  it('counts an accepted document against the cap', () => {
    expect(recordUploadAccepted(link()).usedUploads).toBe(1)
  })

  it('leaves the original untouched, because a link is a record not a counter', () => {
    const original = link()
    recordUploadAttempt(original)
    recordUploadAccepted(original)
    expect(original.attempts).toBe(0)
    expect(original.usedUploads).toBe(0)
  })
})
