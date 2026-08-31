import { describe, expect, it } from 'vitest'

import {
  AMENDABLE_ENTITIES,
  AMEND_POLICIES,
  DISCARD_REASONS,
  ERASE_VERDICTS,
  amendableFields,
} from '../../domain/amend'
import { FIELD_CLASSES } from '../../domain/dataclass'
import type { DataClass } from '../../domain/dataclass'
import { DATA_FIELD_CLASSES } from '../repo/classification'
import { DISCARDED_FILTER_KEY } from './list'
import { NO_LATENCY } from './latency'
import { createMockRepositories } from './index'

/**
 * Correction, discard and erasure through the seam the screens use.
 *
 * The fixture ids below are the prototype walkthrough's own: `inq-1031` is an
 * accepted lead nobody has quoted, `inq-1025` converted into `qtn-0329`,
 * `qtn-0332` has been awarded, `pol-draft-0219` is still being entered and
 * `pol-4388` is issued with the insurer's number already on it. Using the real
 * cast rather than rows built for the test is deliberate: it is the same data a
 * reviewer clicking through the app is looking at.
 */

function repositories() {
  return createMockRepositories({ latency: NO_LATENCY })
}

const ACTOR = 'usr-priya-desai'

/* --------------------------------------------------- the boundary control */

describe('the allow-list cannot reach a classified field', () => {
  /*
   * The control that makes `mayEchoValue` safe rather than merely careful.
   *
   * `src/domain/amend.ts` cannot see the data-layer registry — the layer rule
   * forbids it — so `Claim`'s classes are invisible from where the allow-list is
   * declared. This test reads both registries and asserts that every
   * non-money amendable field is `operational` or `contact`, which is exactly
   * what the Assistant boundary allows. If somebody ever adds a `sensitive`
   * field to a correction list, it goes red here.
   */
  const merged = {
    ...(FIELD_CLASSES as unknown as Record<string, Record<string, DataClass>>),
    ...(DATA_FIELD_CLASSES as unknown as Record<string, Record<string, DataClass>>),
  }

  it.each(AMENDABLE_ENTITIES)('%s corrects only operational or contact fields', (entity) => {
    const classes = merged[entity]
    expect(classes).toBeDefined()

    for (const field of amendableFields(entity)) {
      // The field name is in the assertion so a failure says which one leaked
      // rather than only that something did.
      expect({ field, dataClass: classes[field] }).toMatchObject({
        field,
        dataClass: expect.stringMatching(/^(operational|contact)$/),
      })
    }
  })

  it.each(AMENDABLE_ENTITIES)('%s declares its money fields, so none can be echoed', (entity) => {
    for (const field of AMEND_POLICIES[entity].money) {
      expect(amendableFields(entity)).toContain(field)
    }
  })
})

/* ---------------------------------------------------------------- amend */

describe('correcting a record', () => {
  it('writes the field, emits record.amended and carries the before and after', async () => {
    const repos = repositories()

    const outcome = await repos.inquiries.amend('inq-1031', {
      actorId: ACTOR,
      reason: 'Digit transposed when the number was taken down.',
      changes: { contactMobile: '9825110099' },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.contactMobile).toBe('9825110099')
    expect(outcome.events).toHaveLength(1)
    expect(outcome.events[0].name).toBe('record.amended')
    expect(outcome.events[0].actorId).toBe(ACTOR)
    expect(outcome.events[0].subject).toEqual({ entity: 'Inquiry', id: 'inq-1031' })
    expect(outcome.events[0].detail).toMatchObject({
      reason: 'Digit transposed when the number was taken down.',
      fields: 'contactMobile',
      fieldCount: 1,
      'before.contactMobile': '9825110004',
      'after.contactMobile': '9825110099',
    })

    expect((await repos.inquiries.get('inq-1031'))?.contactMobile).toBe('9825110099')
  })

  it('refuses a blank reason and writes nothing', async () => {
    const repos = repositories()
    const before = await repos.inquiries.get('inq-1031')

    const refused = await repos.inquiries.amend('inq-1031', {
      actorId: ACTOR,
      reason: '   ',
      changes: { contactMobile: '9825110099' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('has to say why')
    expect((await repos.inquiries.get('inq-1031'))?.contactMobile).toBe(before?.contactMobile)
    expect(repos.store.eventsFor('Inquiry', 'inq-1031')).toHaveLength(0)
  })

  it('refuses a correction that changes nothing', async () => {
    const repos = repositories()
    const inquiry = await repos.inquiries.get('inq-1031')

    const refused = await repos.inquiries.amend('inq-1031', {
      actorId: ACTOR,
      reason: 'Checking the number.',
      changes: { contactMobile: inquiry?.contactMobile ?? '' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('differs from what is already recorded')
  })

  it('refuses a status, and says the workflow owns it', async () => {
    const repos = repositories()

    const refused = await repos.inquiries.amend('inq-1031', {
      actorId: ACTOR,
      reason: 'Should have been converted.',
      changes: { status: 'converted' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain(
      'A status changes through the workflow, not through a correction.',
    )
    expect((await repos.inquiries.get('inq-1031'))?.status).toBe('accepted')
  })

  it('refuses an Aadhaar on a customer, masked included', async () => {
    const repos = repositories()

    const refused = await repos.customers.amend('cus-rakesh-patel', {
      actorId: ACTOR,
      reason: 'Correcting the last four.',
      changes: { aadhaarLast4: '9999' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('Aadhaar')
    expect((await repos.customers.get('cus-rakesh-patel'))?.aadhaarLast4).toBe('4102')
  })

  it('corrects a customer address without touching the identity block', async () => {
    const repos = repositories()

    const outcome = await repos.customers.amend('cus-rakesh-patel', {
      actorId: ACTOR,
      reason: 'Moved house; the schedule went to the old flat.',
      changes: { addressLine: '14, Shantiniketan, Vastrapur', pincode: '380015' },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.addressLine).toBe('14, Shantiniketan, Vastrapur')
    expect(outcome.record.pincode).toBe('380015')
    expect(outcome.events[0].detail?.fieldCount).toBe(2)
  })

  it('records a typed premium on a policy still being entered', async () => {
    const repos = repositories()

    const outcome = await repos.policies.amend('pol-draft-0219', {
      actorId: ACTOR,
      reason: 'Premium keyed from the insurer quote; the first entry was short by a zero.',
      changes: { finalPremium: 1_250_000 },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.finalPremium).toEqual({ paise: 1_250_000, currency: 'INR' })
    // Never an amount value in the log — DomainEvent.detail says so plainly.
    expect(outcome.events[0].detail).toMatchObject({ fields: 'finalPremium', fieldCount: 1 })
    expect(outcome.events[0].detail?.['after.finalPremium']).toBeUndefined()
    expect(Object.values(outcome.events[0].detail ?? {})).not.toContain(1_250_000)
  })

  it('refuses a premium on a policy the insurer has already issued, and sends you to an endorsement', async () => {
    const repos = repositories()
    const before = await repos.policies.get('pol-4388')

    const refused = await repos.policies.amend('pol-4388', {
      actorId: ACTOR,
      reason: 'The insurer quoted less than we recorded.',
      changes: { finalPremium: 1 },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('endorsement')
    expect((await repos.policies.get('pol-4388'))?.finalPremium).toEqual(before?.finalPremium)
  })

  it('refuses an insurer number that is already on the record', async () => {
    const repos = repositories()

    const refused = await repos.policies.amend('pol-4388', {
      actorId: ACTOR,
      reason: 'Number reads wrong on the schedule.',
      changes: { insurerNo: 'OG-99-9999' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('came from the insurer')
  })

  it('accepts an insurer number on a claim that has none yet', async () => {
    const repos = repositories()

    const outcome = await repos.claims.amend('clm-0402', {
      actorId: ACTOR,
      reason: 'Insurer confirmed the intimation number by email.',
      changes: { insurerNo: 'CL-2026-77104' },
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.insurerNo).toBe('CL-2026-77104')
  })

  it('refuses a field the entity does not list, naming what is correctable', async () => {
    const repos = repositories()

    const refused = await repos.deals.amend('app-0775', {
      actorId: ACTOR,
      reason: 'Wrong agency picked.',
      changes: { agencyId: 'agc-anything' },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('agencyId is not a correctable field on a Deal')
  })

  it('refuses an amount that is not whole paise', async () => {
    const repos = repositories()

    const refused = await repos.policies.amend('pol-draft-0219', {
      actorId: ACTOR,
      reason: 'Rounding from the quote sheet.',
      changes: { finalPremium: 12500.5 },
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('whole number of paise')
  })

  it('refuses a record that is not there', async () => {
    const repos = repositories()
    const refused = await repos.inquiries.amend('inq-nope', {
      actorId: ACTOR,
      reason: 'Anything.',
      changes: { notes: 'x' },
    })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.code).toBe('not_found')
  })
})

/* -------------------------------------------------------------- discard */

describe('discarding a record', () => {
  it('takes it out of every queue by default and leaves it in the book', async () => {
    const repos = repositories()
    const before = await repos.inquiries.list({ pageSize: 200 })

    const discarded = await repos.inquiries.discard('inq-1031', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.duplicate,
      note: 'Same caller as INQ-1036, logged twice.',
    })

    expect(discarded.ok).toBe(true)
    if (!discarded.ok) return
    expect(discarded.events[0].name).toBe('record.discarded')
    expect(discarded.events[0].detail).toEqual({
      reason: 'duplicate',
      note: 'Same caller as INQ-1036, logged twice.',
    })
    expect(discarded.record.discard?.discardedBy).toBe(ACTOR)
    expect(discarded.record.discard?.discardedAt).toBe(discarded.events[0].at)

    const after = await repos.inquiries.list({ pageSize: 200 })
    expect(after.total).toBe(before.total - 1)
    expect(after.rows.map((row) => row.id)).not.toContain('inq-1031')

    // Still in the book: a direct read finds it, and so does the filter.
    expect(await repos.inquiries.get('inq-1031')).not.toBeNull()
    const only = await repos.inquiries.list({
      pageSize: 200,
      filters: { [DISCARDED_FILTER_KEY]: ['true'] },
    })
    expect(only.rows.map((row) => row.id)).toEqual(['inq-1031'])

    const both = await repos.inquiries.list({
      pageSize: 200,
      filters: { [DISCARDED_FILTER_KEY]: ['true', 'false'] },
    })
    expect(both.total).toBe(before.total)
  })

  it('leaves every other queue on the same record alone', async () => {
    const repos = repositories()
    const inquiry = await repos.inquiries.get('inq-1031')
    const owner = inquiry?.ownerId
    expect(owner).toBeTruthy()

    const beforeOwner = await repos.inquiries.forOwner(owner!, { pageSize: 200 })
    expect(beforeOwner.rows.map((row) => row.id)).toContain('inq-1031')

    await repos.inquiries.discard('inq-1031', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.testRecord,
    })

    // One filter, applied in one place, so every queue over the same table
    // agrees without any of them having been told about the discard.
    const afterOwner = await repos.inquiries.forOwner(owner!, { pageSize: 200 })
    expect(afterOwner.rows.map((row) => row.id)).not.toContain('inq-1031')
    expect(afterOwner.total).toBe(beforeOwner.total - 1)
  })

  it('comes back through restore, with the reason it was discarded for in the trail', async () => {
    const repos = repositories()

    await repos.inquiries.discard('inq-1031', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.wrongNumber,
    })

    const restored = await repos.inquiries.restore('inq-1031', {
      actorId: ACTOR,
      reason: 'The number was right; the caller had two.',
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.record.discard).toBeNull()
    expect(restored.events[0].name).toBe('record.restored')
    expect(restored.events[0].detail).toMatchObject({ discardedFor: 'wrong_number' })

    const list = await repos.inquiries.list({ pageSize: 200 })
    expect(list.rows.map((row) => row.id)).toContain('inq-1031')
  })

  it('refuses an inquiry that has already produced a quotation, naming it', async () => {
    const repos = repositories()

    const refused = await repos.inquiries.discard('inq-1025', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.duplicate,
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('QTN-0329')
    expect(await repos.inquiries.get('inq-1025')).not.toBeNull()
  })

  it('refuses a quotation whose award has been recorded', async () => {
    const repos = repositories()

    const refused = await repos.quotations.discard('qtn-0332', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.enteredInError,
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('cannot be discarded')
  })

  it('lets a discarded application free the award it was opened against', async () => {
    const repos = repositories()
    const deal = await repos.deals.get('app-0775')
    expect(deal).not.toBeNull()

    expect(await repos.deals.byAwardKey(deal!.awardKey)).not.toBeNull()

    const discarded = await repos.deals.discard('app-0775', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.enteredInError,
      note: 'Raised against the wrong customer.',
    })
    expect(discarded.ok).toBe(true)

    // The award is placeable again, which is the whole point of a reversible
    // discard rather than a row that lingers and blocks.
    expect(await repos.deals.byAwardKey(deal!.awardKey)).toBeNull()
    expect(await repos.deals.forQuotation(deal!.quotationId)).not.toContainEqual(
      expect.objectContaining({ id: 'app-0775' }),
    )
  })

  it('refuses an unrecognised reason and a second discard', async () => {
    const repos = repositories()

    const bogus = await repos.inquiries.discard('inq-1031', {
      actorId: ACTOR,
      // The type refuses this at compile time; the runtime refuses a value that
      // arrived off a URL or a JSON payload.
      reason: 'because_i_said_so' as never,
    })
    expect(bogus.ok).toBe(false)

    await repos.inquiries.discard('inq-1031', { actorId: ACTOR, reason: DISCARD_REASONS.spam })
    const twice = await repos.inquiries.discard('inq-1031', {
      actorId: ACTOR,
      reason: DISCARD_REASONS.spam,
    })
    expect(twice.ok).toBe(false)
    if (twice.ok) return
    expect(twice.reason).toContain('already been discarded')
  })
})

/* -------------------------------------------------------------- erasure */

describe('an erasure request', () => {
  it('is retained by obligation where a live policy exists, and names the obligation', async () => {
    const repos = repositories()

    const outcome = await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'data_principal',
      note: 'Asked on the phone to be removed from everything.',
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.verdict).toBe(ERASE_VERDICTS.retainedByObligation)
    expect(outcome.record.obligations).toContain('live_policy')
    expect(outcome.record.obligationNote).toContain('live insurance contract')
    expect(outcome.record.suppressed).toEqual(['marketing', 'automated_reminders'])
    expect(outcome.record.systemNo).toMatch(/^ERQ-\d{4}$/)

    expect(outcome.events.map((event) => event.name)).toEqual([
      'erasure.requested',
      'erasure.decided',
    ])
    // The decision is logged, and it logs no policy number or premium.
    expect(outcome.events[1].detail?.verdict).toBe('retained_by_obligation')
    expect(String(outcome.events[1].detail?.obligations)).toContain('live_policy')
  })

  it('locks marketing use, which is what the person actually gets', async () => {
    const repos = repositories()

    await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'data_principal',
    })

    const suppression = await repos.eraseRequests.suppression('Customer', 'cus-rakesh-patel')
    expect(suppression.suppressed).toContain('marketing')
    expect(suppression.sinceRequestId).not.toBeNull()
  })

  it('erases where the platform holds nothing that has to be kept', async () => {
    const repos = repositories()

    const outcome = await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-v0001',
      requestedBy: 'data_principal',
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.verdict).toBe(ERASE_VERDICTS.erased)
    expect(outcome.record.obligations).toEqual([])
  })

  it('is refused for a subject that does not exist, and for a requester nobody recognises', async () => {
    const repos = repositories()

    const missing = await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-nobody',
      requestedBy: 'data_principal',
    })
    expect(missing.ok).toBe(false)

    const bogus = await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'a_friend' as never,
    })
    expect(bogus.ok).toBe(false)
    if (bogus.ok) return
    expect(bogus.reason).toContain('recognised requester')
  })

  it('keeps every request it ever received, decided, against its subject', async () => {
    const repos = repositories()

    await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'data_principal',
    })
    await repos.eraseRequests.request({
      actorId: ACTOR,
      subjectEntity: 'Customer',
      subjectId: 'cus-rakesh-patel',
      requestedBy: 'staff_on_behalf',
    })

    const held = await repos.eraseRequests.forSubject('Customer', 'cus-rakesh-patel')
    expect(held).toHaveLength(2)
    for (const request of held) {
      expect(request.decidedAt).toBe(request.requestedAt)
      expect(request.decidedBy).toBe(ACTOR)
    }

    expect((await repos.eraseRequests.queue()).total).toBe(2)
  })
})
