import { describe, expect, it } from 'vitest'
import { money } from '../../domain/money'
import { FIXTURE_NOW } from '../fixtures'
import { createLatency, DEFAULT_LATENCY, NO_LATENCY } from './latency'
import { createMockRepositories } from './index'

/** The suite never sleeps, and the store never reaches for the wall clock. */
function repositories() {
  return createMockRepositories({ latency: NO_LATENCY })
}

const ACTOR = 'usr-priya-desai'

describe('simulated latency', () => {
  it('stays inside the 150 to 400 millisecond window the playbook asks for', () => {
    const values = [0, 0.25, 0.5, 0.75, 0.999]
    let index = 0
    const latency = createLatency(DEFAULT_LATENCY, { random: () => values[index++] })

    for (let i = 0; i < values.length; i += 1) {
      const delay = latency.next()
      expect(delay).toBeGreaterThanOrEqual(150)
      expect(delay).toBeLessThanOrEqual(400)
    }
  })

  it('waits for nothing at all under NO_LATENCY, so a suite is not a stopwatch', async () => {
    const latency = createLatency(NO_LATENCY, {
      sleep: () => {
        throw new Error('NO_LATENCY must not schedule a timer.')
      },
    })

    await expect(latency.wait()).resolves.toBeUndefined()
  })

  it('takes the sleep function from the caller, so a test can drive it', async () => {
    const slept: number[] = []
    const latency = createLatency(DEFAULT_LATENCY, {
      random: () => 0.5,
      sleep: async (ms) => {
        slept.push(ms)
      },
    })

    await latency.wait()
    expect(slept).toEqual([275])
  })

  it('refuses a profile that is not a range', () => {
    expect(() => createLatency({ minMs: 400, maxMs: 150 })).toThrow(RangeError)
  })
})

describe('reads', () => {
  it('returns a page, not an array, so a queue can render its pager', async () => {
    const repos = repositories()
    const page = await repos.customers.list({ pageSize: 10 })

    expect(page.rows).toHaveLength(10)
    expect(page.total).toBeGreaterThan(300)
    expect(page.page).toBe(1)
    expect(page.pageCount).toBe(Math.ceil(page.total / 10))
  })

  it('counts the filtered set rather than the table', async () => {
    const repos = repositories()
    const page = await repos.inquiries.list({ filters: { status: ['unrouted'] } })

    expect(page.total).toBe(page.rows.length)
    expect(page.rows.map((row) => row.systemNo)).toEqual(['INQ-1041'])
  })

  it('searches the fields the repository declares', async () => {
    const repos = repositories()
    const page = await repos.customers.list({ search: 'Rakesh' })

    expect(page.rows.map((row) => row.fullName)).toContain('Rakesh Patel')
  })

  it('refuses an undeclared filter rather than silently returning everything', async () => {
    const repos = repositories()
    await expect(repos.customers.list({ filters: { nickname: ['x'] } })).rejects.toThrow(
      /Unknown filter/,
    )
  })

  it('sorts on a declared column in both directions', async () => {
    const repos = repositories()
    const ascending = await repos.policies.list({
      sort: { field: 'systemNo', direction: 'asc' },
      pageSize: 5,
    })
    const descending = await repos.policies.list({
      sort: { field: 'systemNo', direction: 'desc' },
      pageSize: 5,
    })

    expect(ascending.rows[0].systemNo).not.toBe(descending.rows[0].systemNo)
  })

  it('reads the household the coverage-gap notice needs', async () => {
    const repos = repositories()
    const view = await repos.customers.household('hh-patel')

    expect(view?.household.name).toBe('Patel household')
    expect(view?.members.map((member) => member.fullName)).toContain('Nita Patel')
  })

  it('returns the pinned form schema, so an old record keeps its own form', async () => {
    const repos = repositories()
    const pinned = await repos.config.formSchema('policy_entry', undefined, 1)
    const live = await repos.config.formSchema('policy_entry')

    expect(pinned?.version).toBe(1)
    expect(live?.version).toBe(2)
  })

  it('gives the deal machine the agency scope in the shape its guard wants', async () => {
    const repos = repositories()
    const scope = await repos.agencies.placementScope('agy-jagad-hdfc')

    expect(scope?.companyIds).toEqual(['cmp-hdfc-ergo'])
    expect(scope?.productIds.length).toBeGreaterThan(0)
  })

  it('answers document questions with presence, never with content', async () => {
    const repos = repositories()
    const presence = await repos.documents.presence('Customer', 'cus-rakesh-patel')

    expect(presence).toEqual({ aadhaar: true, pan: true })
    expect(Object.values(presence).every((value) => typeof value === 'boolean')).toBe(true)
  })
})

describe('mutations run through the machines', () => {
  it('accepts an inquiry confirmed inside its TAT, and emits the event', async () => {
    const repos = repositories()
    const confirmedAt = new Date(FIXTURE_NOW.getTime() - 10 * 60_000).toISOString()

    const result = await repos.inquiries.accept('inq-1045', {
      actorId: ACTOR,
      confirmedAt,
      tatMinutes: 60,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.status).toBe('accepted')
    // The clock stops on acceptance, which is what §9 means by "owner set".
    expect(result.record.tatDueAt).toBeNull()
    expect(result.events.map((event) => event.name)).toEqual(['inquiry.accepted'])
    expect(repos.store.eventsFor('Inquiry', 'inq-1045')).toHaveLength(1)
  })

  it('refuses a confirmation that came in late, and says why', async () => {
    const repos = repositories()
    const confirmedAt = new Date(FIXTURE_NOW.getTime() - 5 * 60_000).toISOString()

    const result = await repos.inquiries.accept('inq-1046', {
      actorId: ACTOR,
      confirmedAt,
      tatMinutes: 60,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/after the TAT deadline/)
    expect(result.guard).toBe('confirmedWithinTat')
  })

  it('writes nothing and emits nothing when a machine refuses', async () => {
    const repos = repositories()
    const before = await repos.inquiries.get('inq-1046')

    await repos.inquiries.accept('inq-1046', {
      actorId: ACTOR,
      confirmedAt: FIXTURE_NOW.toISOString(),
      tatMinutes: 60,
    })

    expect(await repos.inquiries.get('inq-1046')).toEqual(before)
    expect(repos.store.events()).toHaveLength(0)
  })

  it('reassigns a lapsed inquiry only inside its own category group', async () => {
    const repos = repositories()

    const offside = await repos.inquiries.reassign('inq-1046', {
      actorId: ACTOR,
      nextOwnerId: 'usr-kiran-solanki',
      nextOwnerCategoryGroupId: 'cat-health',
      tatMinutes: 60,
    })
    expect(offside.ok).toBe(false)
    if (!offside.ok) expect(offside.reason).toMatch(/stays inside the category group/)

    const inside = await repos.inquiries.reassign('inq-1046', {
      actorId: ACTOR,
      nextOwnerId: 'usr-kiran-solanki',
      nextOwnerCategoryGroupId: 'cat-motor',
      tatMinutes: 60,
    })
    expect(inside.ok).toBe(true)
    if (!inside.ok) return
    expect(inside.record.status).toBe('reassigned')
    // The trail keeps the previous holder with a release time, because
    // escalation reads all of it.
    expect(inside.record.assignmentHistory).toHaveLength(2)
    expect(inside.record.assignmentHistory[0].releasedAt).toBeDefined()
  })

  it('escalates a twice-lapsed inquiry with its whole history', async () => {
    const repos = repositories()
    const result = await repos.inquiries.escalate('inq-1042', {
      actorId: ACTOR,
      toUserId: 'usr-nikunj-shah',
      tatMinutes: 60,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.ownerId).toBe('usr-nikunj-shah')
    expect(result.record.escalationLevel).toBe(1)
    expect(repos.store.events()[0].detail?.holders).toBe(2)
  })

  it('refuses an illegal transition with the states that are actually reachable', async () => {
    const repos = repositories()
    const result = await repos.inquiries.convert('inq-1044', { actorId: ACTOR })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('illegal_transition')
    expect(result.reason).toMatch(/cannot move to "converted"/)
  })

  it('answers a missing record as a refusal, not as a throw', async () => {
    const repos = repositories()
    const result = await repos.inquiries.markLost('inq-9999', {
      actorId: ACTOR,
      lostReason: 'Nothing here.',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_found')
  })
})

describe('the money rules the machines enforce', () => {
  it('generates a quotation whose every column carries a typed figure', async () => {
    const repos = repositories()
    const result = await repos.quotations.generate('qtn-0329', { actorId: ACTOR })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.status).toBe('generated')
  })

  it('blocks a quotation whose column has no premium typed on it', async () => {
    const repos = repositories()

    const composed = await repos.quotations.compose('qtn-0329', {
      actorId: ACTOR,
      benefitRows: [],
      lines: [
        {
          columnKey: 'blank',
          label: 'HDFC Ergo Optima Secure',
          companyId: 'cmp-hdfc-ergo',
          productId: 'prd-he-ops',
          finalPayablePremium: null,
          finalPremiumSource: null,
          benefitValues: {},
        },
      ],
    })
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    // A quotation already composed cannot be composed again; the point is that
    // the generate below is the one that reads the figures.
    expect(composed.code).toBe('illegal_transition')

    const revision = await repos.quotations.requestRevision('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'Customer asked for a higher sum insured.',
    })
    expect(revision.ok).toBe(true)

    const withoutFigure = await repos.quotations.regenerate('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'Customer asked for a higher sum insured.',
      lines: [
        {
          columnKey: 'hdfc-optima',
          label: 'HDFC Ergo Optima Secure',
          companyId: 'cmp-hdfc-ergo',
          productId: 'prd-he-ops',
          finalPayablePremium: null,
          finalPremiumSource: null,
          benefitValues: {},
        },
      ],
    })
    expect(withoutFigure.ok).toBe(false)
    if (withoutFigure.ok) return
    expect(withoutFigure.reason).toMatch(/Final Payable Premium is missing/)
  })

  it('leaves the earlier version untouched when a revision is refused', async () => {
    const repos = repositories()
    const before = await repos.quotations.allLines('qtn-0331')

    await repos.quotations.requestRevision('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'A revision that will be refused.',
    })
    await repos.quotations.regenerate('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'A revision that will be refused.',
      lines: [
        {
          columnKey: 'hdfc-optima',
          label: 'HDFC Ergo Optima Secure',
          companyId: 'cmp-hdfc-ergo',
          productId: 'prd-he-ops',
          finalPayablePremium: null,
          finalPremiumSource: null,
          benefitValues: {},
        },
      ],
    })

    expect(await repos.quotations.allLines('qtn-0331')).toEqual(before)
  })

  it('opens v+1 on a revision and leaves v1 locked and readable', async () => {
    const repos = repositories()

    await repos.quotations.requestRevision('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'Customer asked for a higher sum insured.',
    })
    const result = await repos.quotations.regenerate('qtn-0331', {
      actorId: ACTOR,
      revisionReason: 'Customer asked for a higher sum insured.',
      lines: [
        {
          columnKey: 'hdfc-optima',
          label: 'HDFC Ergo Optima Secure',
          companyId: 'cmp-hdfc-ergo',
          productId: 'prd-he-ops',
          finalPayablePremium: money(18_900),
          finalPremiumSource: 'typed',
          benefitValues: { 'sum-insured': '10,00,000' },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.version).toBe(2)

    const all = await repos.quotations.allLines('qtn-0331')
    expect(all.filter((line) => line.version === 1).every((line) => line.locked)).toBe(true)
    expect(await repos.quotations.lines('qtn-0331')).toHaveLength(1)
  })

  it('blocks a deal with no line items, with a sentence a person can read', async () => {
    const repos = repositories()
    const result = await repos.deals.setLineItems('app-0775', {
      actorId: ACTOR,
      agencyId: 'agy-jagad-general',
      lineItems: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/no line items/)
  })

  it('blocks placement outside the selected agency scope', async () => {
    const repos = repositories()
    const result = await repos.deals.setLineItems('app-0775', {
      actorId: ACTOR,
      // An Individual agency appointed for HDFC Ergo cannot place a Tata AIG line.
      agencyId: 'agy-jagad-hdfc',
      lineItems: [
        {
          id: 'dli-x',
          companyId: 'cmp-tata-aig',
          productId: 'prd-ta-tvg',
          label: 'Tata AIG Travel Guard',
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/is not appointed for/)
  })

  it('will not issue a policy while KYC is anything but complete', async () => {
    const repos = repositories()
    const result = await repos.policies.issue('pol-draft-0224', {
      actorId: ACTOR,
      finalPremium: money(16_826, 80),
      finalPremiumSource: 'typed',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/KYC is pending/)
  })

  it('walks KYC to complete and then issues, carrying the typed figures across', async () => {
    const repos = repositories()

    const kyc = await repos.customers.advanceKyc('cus-hitesh-mehta', 'complete', {
      actorId: ACTOR,
      route: 'staff',
      requiredDocuments: ['PAN card', 'Address proof'],
      presentDocuments: ['PAN card', 'Address proof'],
      extractedFields: [{ name: 'panNumber', value: 'ABCPM4471N', confirmed: true }],
      aadhaarLast4: '4471',
    })
    expect(kyc.ok).toBe(true)
    if (!kyc.ok) return
    // §9: completion fires the credentials recipe as part of the same move.
    expect(kyc.events.map((event) => event.name)).toEqual([
      'kyc.completed',
      'credentials.generated',
      'message.sent',
    ])

    const issued = await repos.policies.issue('pol-draft-0224', {
      actorId: ACTOR,
      finalPremium: money(16_826, 80),
      finalPremiumSource: 'typed',
      netPremium: money(14_260),
      gstAmount: money(2_566, 80),
      insurerNo: '2825 1188 4410 00',
    })

    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.record.finalPremium?.paise).toBe(1_682_680)
    expect(issued.record.netPremium?.paise).toBe(1_426_000)
    expect(issued.record.insurerNo).toBe('2825 1188 4410 00')
  })

  it('refuses to complete KYC while an extraction is unconfirmed', async () => {
    const repos = repositories()
    const result = await repos.customers.advanceKyc('cus-hitesh-mehta', 'complete', {
      actorId: ACTOR,
      route: 'staff',
      requiredDocuments: [],
      presentDocuments: [],
      extractedFields: [{ name: 'panNumber', value: 'ABCPM4471N', confirmed: false }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/Confirm the extracted values/)
  })

  it('refuses to issue without a Final Premium, whatever else is in place', async () => {
    const repos = repositories()
    await repos.customers.advanceKyc('cus-hitesh-mehta', 'complete', {
      actorId: ACTOR,
      route: 'staff',
      requiredDocuments: [],
      presentDocuments: [],
      extractedFields: [],
    })

    const result = await repos.policies.issue('pol-draft-0224', {
      actorId: ACTOR,
      finalPremium: undefined as never,
      finalPremiumSource: 'typed',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/Final Premium is empty/)
  })

  it('records a direct-to-company payment as a reference and nothing else', async () => {
    const repos = repositories()
    const result = await repos.collections.record('col-0002', {
      actorId: ACTOR,
      amount: money(16_826, 80),
      route: 'direct_to_company',
      instrument: 'online',
      mode: 'back_office',
      reference: 'UTR-99312044',
      collectedBy: ACTOR,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.state).toBe('reference_recorded')
    expect(result.record.agencyId).toBeNull()
    expect(result.events.map((event) => event.name)).toEqual(['payment.reference_recorded'])
  })

  it('will not close an on-field collection without back-office verification', async () => {
    const repos = repositories()
    const result = await repos.collections.close('col-0001', { actorId: ACTOR })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/verification is missing/)
  })

  it('will not let the collector verify their own collection', async () => {
    const repos = repositories()
    const result = await repos.collections.verify('col-0001', {
      actorId: 'usr-kiran-solanki',
      verifiedBy: 'usr-kiran-solanki',
      verifierIsBackOffice: true,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/cannot be the person who verifies/)
  })

  it('raises the bounce follow-up as part of the bounce, never after it', async () => {
    const repos = repositories()

    const without = await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: false as never,
      followUpTaskDueOn: '2026-08-27',
    })
    expect(without.ok).toBe(false)
    if (!without.ok) expect(without.reason).toMatch(/raises a follow-up task/)

    const withTask = await repos.collections.markBounced('col-0001', {
      actorId: ACTOR,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
      followUpTaskDueOn: '2026-08-27',
    })
    expect(withTask.ok).toBe(true)
    if (!withTask.ok) return
    expect(withTask.events.map((event) => event.name)).toEqual([
      'cheque.bounced',
      'task.created',
      'message.sent',
    ])
  })

  it('refuses the retention lock while the window is still open', async () => {
    const repos = repositories()
    const result = await repos.policies.lock('pol-4388', {
      actorId: ACTOR,
      closedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    // A closed policy is not deleted. The alternative to deletion is waiting.
    expect(result.reason).toMatch(/cannot move to "locked"/)
  })
})

describe('the store behind the repositories', () => {
  it('gives each set of repositories its own store, so tests cannot leak into each other', async () => {
    const first = repositories()
    const second = repositories()

    await first.inquiries.markUnrouted('inq-1044', { actorId: ACTOR, adminAlertRaised: true })

    expect((await first.inquiries.get('inq-1044'))?.status).toBe('unrouted')
    expect((await second.inquiries.get('inq-1044'))?.status).toBe('new')
  })

  it('logs every event through the audit sink, in order', async () => {
    const repos = repositories()

    await repos.inquiries.assign('inq-1044', {
      actorId: ACTOR,
      nextOwnerId: 'usr-kiran-solanki',
      nextOwnerCategoryGroupId: 'cat-health',
      tatMinutes: 60,
      routingMatchFound: true,
    })
    await repos.inquiries.accept('inq-1044', {
      actorId: 'usr-kiran-solanki',
      confirmedAt: new Date(FIXTURE_NOW.getTime() + 5 * 60_000).toISOString(),
      tatMinutes: 60,
    })

    expect(repos.store.events().map((event) => event.name)).toEqual([
      'inquiry.assigned',
      'inquiry.accepted',
    ])
    expect(repos.store.events()[0].actorId).toBe(ACTOR)
  })

  it('completes a task through the same write path, even without a machine', async () => {
    const repos = repositories()
    const result = await repos.tasks.complete('tsk-0002', { actorId: ACTOR, note: 'Called back.' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.state).toBe('done')
    expect(result.record.completedAt).not.toBeNull()
    expect(result.events.map((event) => event.name)).toEqual(['task.completed'])
  })

  it('lets a renewal member take a task out of the pool', async () => {
    const repos = repositories()
    const result = await repos.renewals.assign('rnw-4441', {
      actorId: 'usr-sneha-patel',
      assigneeId: 'usr-sneha-patel',
      selfAssigned: true,
      leadDays: 45,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.state).toBe('assigned')
    expect(result.record.assigneeId).toBe('usr-sneha-patel')
  })

  it('blocks a claim on a lapsed policy, and lets it through on an active one', async () => {
    const repos = repositories()

    const blocked = await repos.claims.advance('clm-0414', 'intimated', { actorId: 'usr-amit-rana' })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toMatch(/policy is lapsed/)

    const intimated = await repos.claims.advance('clm-0419', 'intimated', {
      actorId: 'usr-amit-rana',
    })
    expect(intimated.ok).toBe(true)
  })
})
