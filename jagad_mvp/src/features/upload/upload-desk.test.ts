import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { uploadDesk } from './data/upload-desk'

/**
 * The upload desk — FR-11.1, FR-16.8, D21.
 *
 * The three promises worth a test each: an unknown token and a closed one are
 * indistinguishable, an accepted upload records presence and nothing else, and a
 * link is for one claim rather than for a customer.
 */

const NOW = new Date('2026-08-30T09:00:00.000Z')
const TOKEN = 'z'.repeat(32)

/** CLM-0412 is the prototype's cashless claim, seeded at `upload_link_sent`. */
const CLAIM = 'clm-0412'

let repositories: MockRepositories

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

describe('issuing', () => {
  it('issues a link against a claim that exists', async () => {
    const desk = uploadDesk(repositories)
    const outcome = await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.claimId).toBe(CLAIM)
    expect(outcome.record.carriesSession).toBe(false)
  })

  it('refuses a claim that does not exist, and writes no link', async () => {
    const desk = uploadDesk(repositories)
    const outcome = await desk.issue({ actorId: 'usr-amit-rana', claimId: 'clm-nope', token: TOKEN, now: NOW })

    expect(outcome.ok).toBe(false)
    expect(await desk.open(TOKEN, NOW)).toMatchObject({ closed: true })
  })

  it('refuses a short token before it stores anything', async () => {
    const desk = uploadDesk(repositories)
    const outcome = await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: 'short', now: NOW })

    expect(outcome.ok).toBe(false)
    expect(await desk.linkFor(CLAIM)).toBeNull()
  })

  it('withdraws the previous link when a fresh one is issued, so one door is open at a time', async () => {
    const desk = uploadDesk(repositories)
    const second = 'y'.repeat(32)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: second, now: NOW })

    // `open` answers null for a token it has never seen, which is a different
    // thing from a token it has withdrawn — so both are read as views first.
    const withdrawn = await desk.open(TOKEN, NOW)
    const fresh = await desk.open(second, NOW)

    expect(withdrawn?.closed).toBe(true)
    expect(fresh?.closed).toBe(false)
  })
})

describe('opening', () => {
  it('tells the holder the claim number and what it accepts, and nothing about the person', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const view = await desk.open(TOKEN, NOW)
    expect(view?.closed).toBe(false)
    expect(view?.claimSystemNo).toBe('CLM-0412')
    expect(view?.docTypes).toContain('discharge_summary')
    // The view is the whole surface. Anything not on it cannot leak from it.
    expect(Object.keys(view ?? {})).toEqual([
      'token',
      'claimSystemNo',
      'docTypes',
      'expiresAt',
      'closed',
      'closedReason',
      'accepted',
    ])
  })

  it('answers an unknown token exactly as it answers a withdrawn one', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })
    await desk.revoke(TOKEN, NOW)

    const withdrawn = await desk.open(TOKEN, NOW)
    const unknown = await desk.open('q'.repeat(32), NOW)

    expect(withdrawn?.closedReason).toBe(unknown?.closedReason)
    expect({ ...withdrawn, token: '' }).toEqual({ ...unknown, token: '' })
  })

  it('answers an expired link the same way too', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expired = await desk.open(TOKEN, later)
    const unknown = await desk.open('q'.repeat(32), later)

    expect({ ...expired, token: '' }).toEqual({ ...unknown, token: '' })
  })

  it('counts every open, so a run of guesses spends the budget rather than probing it', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    await desk.open(TOKEN, NOW)
    await desk.open(TOKEN, NOW)

    const link = await desk.linkFor(CLAIM)
    expect(link?.attempts).toBe(2)
  })
})

describe('accepting a document', () => {
  it('records presence, the file name and nothing else', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const outcome = await desk.accept({
      token: TOKEN,
      docType: 'discharge_summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 240_000,
      now: NOW,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(outcome.record.isPresent).toBe(true)
    expect(outcome.record.fileName).toBe('discharge.pdf')
    expect(outcome.record.retentionClass).toBe('claims')
    // The three that must stay empty. Content is never taken.
    expect(outcome.record.extractedText).toBeNull()
    expect(outcome.record.ocrFields).toEqual([])
    expect(outcome.record.fileUrl).toBeNull()
  })

  it('flips the claim document already waiting rather than creating a second row', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const before = await desk.documentsFor(CLAIM)
    await desk.accept({
      token: TOKEN,
      docType: 'discharge_summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000,
      now: NOW,
    })
    const after = await desk.documentsFor(CLAIM)

    expect(after).toHaveLength(before.length)
    expect(after.filter((row) => row.isPresent)).toHaveLength(1)
  })

  it('names the uploader from the claim, never from anything the page supplied', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const outcome = await desk.accept({
      token: TOKEN,
      docType: 'discharge_summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000,
      now: NOW,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.uploadedByName).toBe('Rakesh Patel')
  })

  it('refuses a document type the link is not collecting', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const outcome = await desk.accept({
      token: TOKEN,
      docType: 'policy_pdf',
      fileName: 'policy.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000,
      now: NOW,
    })

    expect(outcome.ok).toBe(false)
  })

  it('refuses an identity document outright', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })

    const outcome = await desk.accept({
      token: TOKEN,
      docType: 'aadhaar',
      fileName: 'aadhaar.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1_000,
      now: NOW,
    })

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toContain('Identity documents are not collected here')
  })

  it('refuses through a withdrawn link and writes nothing', async () => {
    const desk = uploadDesk(repositories)
    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })
    await desk.revoke(TOKEN, NOW)

    const outcome = await desk.accept({
      token: TOKEN,
      docType: 'discharge_summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000,
      now: NOW,
    })

    expect(outcome.ok).toBe(false)
    expect(await desk.presentDocTypes(CLAIM)).not.toContain('discharge_summary')
  })

  it('reports the doc types the claim machine guard reads', async () => {
    const desk = uploadDesk(repositories)
    expect(await desk.presentDocTypes(CLAIM)).not.toContain('discharge_summary')

    await desk.issue({ actorId: 'usr-amit-rana', claimId: CLAIM, token: TOKEN, now: NOW })
    await desk.accept({
      token: TOKEN,
      docType: 'discharge_summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1_000,
      now: NOW,
    })

    expect(await desk.presentDocTypes(CLAIM)).toContain('discharge_summary')
  })
})
