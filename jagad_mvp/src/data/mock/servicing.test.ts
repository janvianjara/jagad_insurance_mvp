import { describe, expect, it } from 'vitest'
import { money } from '../../domain/money'
import { NO_LATENCY } from './latency'
import { createMockRepositories } from './index'

/**
 * The four servicing clusters, exercised through the same seam the screens use.
 * What is asserted here is not that the happy path works — it is that each
 * refusal §9 asks for actually refuses, and that a refusal writes nothing.
 */

function repositories() {
  return createMockRepositories({ latency: NO_LATENCY })
}

const ACTOR = 'usr-priya-desai'

describe('endorsement', () => {
  it('is born in type_selected under the END series, with neither figure', async () => {
    const repos = repositories()
    const outcome = await repos.endorsements.create({
      actorId: ACTOR,
      policyId: 'pol-4388',
      customerId: 'cus-rakesh-patel',
      type: 'non_financial',
      reason: 'Address correction on the schedule.',
      changedFields: ['addressLine'],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.state).toBe('type_selected')
    expect(outcome.record.systemNo).toMatch(/^END-\d{4}$/)
    expect(outcome.record.delta.amount).toBeNull()
    expect(outcome.record.refund.amount).toBeNull()
  })

  it('refuses a non-financial endorsement that is rendering a premium field', async () => {
    const repos = repositories()
    const created = await repos.endorsements.create({
      actorId: ACTOR,
      policyId: 'pol-4388',
      customerId: 'cus-rakesh-patel',
      type: 'non_financial',
      reason: 'Nominee spelling.',
      changedFields: ['nomineeName'],
    })
    if (!created.ok) throw new Error(created.reason)

    const refused = await repos.endorsements.selectType(created.record.id, {
      actorId: ACTOR,
      renderedFields: ['nomineeName', 'premiumDelta'],
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('premiumDelta')
    // A refusal writes nothing.
    expect((await repos.endorsements.get(created.record.id))?.state).toBe('type_selected')
  })

  it('refuses a premium delta marked derived, and takes the typed one', async () => {
    const repos = repositories()
    const id = 'end-0032'

    const derived = await repos.endorsements.recordDelta(id, {
      actorId: ACTOR,
      delta: money(6_000),
      source: 'derived',
      insurerReference: 'LC-END-0091',
    })
    expect(derived.ok).toBe(false)
    if (!derived.ok) expect(derived.reason).toContain('derived')

    const typed = await repos.endorsements.recordDelta(id, {
      actorId: ACTOR,
      delta: money(6_000),
      source: 'typed_from_insurer',
      insurerReference: 'LC-END-0091',
    })
    expect(typed.ok).toBe(true)
    if (!typed.ok) return
    expect(typed.record.state).toBe('submitted')
    expect(typed.record.delta.amount?.paise).toBe(600_000)
  })

  it('runs the claims-in-period check against the claim data this platform holds', async () => {
    const repos = repositories()

    // POL-4441 carries CLM-0398 inside its period, so no refund is due.
    const blocked = await repos.endorsements.claimsInPeriod('end-0036')
    expect(blocked?.refundEligible).toBe(false)
    expect(blocked?.claimIds).toContain('clm-0398')

    const refused = await repos.endorsements.recordRefund('end-0036', {
      actorId: ACTOR,
      refund: money(2_000),
      source: 'typed_from_insurer',
      insurerReference: 'TA-CANC-1',
    })
    expect(refused.ok).toBe(false)
  })

  it('writes an immutable version carrying both endorsement numbers', async () => {
    const repos = repositories()
    const before = await repos.policies.versions('pol-4402')

    const created = await repos.endorsements.create({
      actorId: ACTOR,
      policyId: 'pol-4402',
      customerId: 'cus-jayesh-kapadia',
      type: 'financial',
      reason: 'Sum insured raised mid-term.',
      changedFields: ['sumInsured'],
    })
    if (!created.ok) throw new Error(created.reason)
    const id = created.record.id

    await repos.endorsements.selectType(id, { actorId: ACTOR, renderedFields: ['premiumDelta'] })
    await repos.endorsements.recordDelta(id, {
      actorId: ACTOR,
      delta: money(1_240),
      source: 'typed_from_insurer',
      insurerReference: 'HE-END-2026-800011',
    })
    await repos.endorsements.approve(id, { actorId: ACTOR })

    const versioned = await repos.endorsements.versionPolicy(id, {
      actorId: ACTOR,
      insurerEndorsementNo: '2825 1104 2291 01',
      effectiveFrom: '2026-09-01',
      note: 'Sum insured raised by endorsement.',
    })

    expect(versioned.ok).toBe(true)
    const after = await repos.policies.versions('pol-4402')
    expect(after).toHaveLength(before.length + 1)

    const written = after.at(-1)
    expect(written?.version).toBe(before.length + 1)
    expect(written?.endorsementNo).toBe(created.record.systemNo)
    expect(written?.insurerEndorsementNo).toBe('2825 1104 2291 01')
    // Version 1 is exactly as it was issued.
    expect(after[0]).toEqual(before[0])
  })
})

describe('notice batch', () => {
  it('summarises a batch in review, unconfirmed extractions included', async () => {
    const repos = repositories()
    const summary = await repos.noticeBatches.summary('ntb-0001')

    expect(summary?.total).toBe(4)
    expect(summary?.matched).toBe(2)
    expect(summary?.unmatched).toBe(1)
    expect(summary?.rejected).toBe(1)
    expect(summary?.unconfirmedExtractions).toBeGreaterThan(0)
  })

  it('blocks a bulk send that includes an unmatched row', async () => {
    const repos = repositories()
    const refused = await repos.noticeBatches.send('ntb-0001', {
      actorId: ACTOR,
      sentBy: ACTOR,
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('TA-HLT-0114552')
    expect((await repos.noticeBatches.get('ntb-0001'))?.state).toBe('review')
  })

  it('blocks a send while any covered row still holds an unconfirmed extraction', async () => {
    const repos = repositories()
    // Both rows are matched; one of them has never been checked against the paper.
    const refused = await repos.noticeBatches.send('ntb-0001', {
      actorId: ACTOR,
      sentBy: ACTOR,
      selectedRowIds: ['ntm-0001-1', 'ntm-0001-2'],
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('TA-TRV-0331808')
  })

  it('sends once every covered row is matched and confirmed', async () => {
    const repos = repositories()

    const linked = await repos.noticeBatches.linkRow('ntm-0001-3', {
      actorId: ACTOR,
      matchedPolicyId: 'pol-4377',
      manuallyLinkedBy: ACTOR,
      confirmedFields: ['noticePolicyNo', 'noticeCustomerName', 'noticeExpiryDate'],
    })
    expect(linked.ok).toBe(true)
    if (linked.ok) expect(linked.record.manuallyLinkedBy).toBe(ACTOR)

    const confirmed = await repos.noticeBatches.matchRow('ntm-0001-2', {
      actorId: ACTOR,
      matchedPolicyId: 'pol-4443',
      confirmedFields: ['noticePolicyNo', 'noticeCustomerName', 'noticeExpiryDate'],
    })
    // Already matched: the row machine has no matched -> matched edge, so this
    // refuses rather than silently re-writing the row.
    expect(confirmed.ok).toBe(false)

    const sent = await repos.noticeBatches.send('ntb-0001', {
      actorId: ACTOR,
      sentBy: ACTOR,
      selectedRowIds: ['ntm-0001-1', 'ntm-0001-3'],
    })
    expect(sent.ok).toBe(true)
    if (sent.ok) expect(sent.record.state).toBe('sent')
  })

  it('walks upload, extraction and review, routing every row through the machine', async () => {
    const repos = repositories()
    const uploaded = await repos.noticeBatches.upload({
      actorId: ACTOR,
      companyId: 'cmp-hdfc-ergo',
      fileName: 'hdfc-ergo-renewals.pdf',
      expiryMonth: '2026-10',
      uploadedBy: ACTOR,
    })
    if (!uploaded.ok) throw new Error(uploaded.reason)
    const id = uploaded.record.id
    expect(uploaded.record.state).toBe('uploaded')

    await repos.noticeBatches.startOcr(id, { actorId: ACTOR })
    const done = await repos.noticeBatches.completeOcr(id, {
      actorId: ACTOR,
      rows: [
        {
          noticePolicyNo: '2825 1049 7731 00',
          noticeCustomerName: 'Rakesh Patel',
          noticeExpiryDate: '2027-03-14',
          noticePremium: money(30_100),
          noticePremiumSource: 'insurer_advice',
          matchedPolicyId: 'pol-4388',
          ocrFields: [{ name: 'noticePolicyNo', value: '2825 1049 7731 00', confirmed: false }],
        },
        {
          noticePolicyNo: '2825 9999 0000 11',
          noticeCustomerName: 'Somebody Else',
          ocrFields: [],
        },
      ],
    })

    expect(done.ok).toBe(true)
    const summary = await repos.noticeBatches.summary(id)
    expect(summary?.total).toBe(2)
    expect(summary?.matched).toBe(1)
    expect(summary?.unmatched).toBe(1)
    expect(summary?.unconfirmedExtractions).toBe(1)
  })
})

describe('templates and integrations', () => {
  it('publishes an edit as the next version and leaves the key alone', async () => {
    const repos = repositories()
    const before = await repos.templates.byKey('renewal.reminder')
    if (!before) throw new Error('the renewal reminder template is missing')

    const saved = await repos.templates.save(before.id, {
      actorId: ACTOR,
      body: 'Policy {{systemNo}} expires on {{expiryDate}}.',
      updatedBy: ACTOR,
    })

    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.record.version).toBe(before.version + 1)
    expect(saved.record.key).toBe('renewal.reminder')
    expect(saved.record.recipeKey).toBe('renewal.reminder')
  })

  it('refuses a setting that reads like a credential, and writes nothing', async () => {
    const repos = repositories()
    const before = await repos.integrations.byKey('whatsapp.bsp')
    if (!before) throw new Error('the BSP integration is missing')

    const refused = await repos.integrations.save(before.id, {
      actorId: ACTOR,
      settings: { senderNumber: '918000000000', apiKey: 'live_9f21' },
      updatedBy: ACTOR,
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toContain('apiKey')
    expect(await repos.integrations.byKey('whatsapp.bsp')).toEqual(before)
  })

  it('holds no credential field on any seeded integration', async () => {
    const repos = repositories()
    const page = await repos.integrations.list()

    for (const integration of page.rows) {
      for (const name of Object.keys(integration.settings)) {
        expect(name.toLowerCase()).not.toMatch(/key|token|secret|password|credential|auth/)
      }
    }
  })

  it('records a provider check outcome without switching anything on or off', async () => {
    const repos = repositories()
    const before = await repos.integrations.byKey('smtp.office')
    if (!before) throw new Error('the SMTP integration is missing')

    const outcome = await repos.integrations.recordCheck(before.id, {
      actorId: ACTOR,
      outcome: 'ok',
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record.lastCheckOutcome).toBe('ok')
    expect(outcome.record.enabled).toBe(before.enabled)
  })
})
