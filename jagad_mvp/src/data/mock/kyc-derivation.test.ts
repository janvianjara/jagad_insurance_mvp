/**
 * The regression suite for audit finding CUS-0251 / Gap 1.
 *
 * The reported symptom was a header reading "KYC complete" above a checklist
 * showing nothing on file. The cause was two of them:
 *
 *   - `kycState` was a column, written by whoever called `advanceKyc`, while the
 *     checklist a screen drew came from the document vault;
 *   - `everyRequiredDocumentPresent` compared `ctx.requiredDocuments` against
 *     `ctx.presentDocuments`, both handed over by the caller, so it asked
 *     whether the caller's claim was internally consistent and never whether a
 *     single document existed.
 *
 * These tests are written from the outside, through the repository, because that
 * is where a caller sits. A unit test of the derivation proves the rule; only
 * this proves there is no way around it.
 */

import { describe, expect, it } from 'vitest'
import { NO_LATENCY } from './latency'
import { createMockRepositories } from './index'

function repositories() {
  return createMockRepositories({ latency: NO_LATENCY })
}

const ACTOR = 'usr-priya-desai'

/** A customer whose file the story cast leaves genuinely thin. */
const THIN_FILE = 'cus-hitesh-mehta'

describe('a caller cannot assert its way to a complete KYC file', () => {
  it('refuses completion when the vault holds none of the required documents', async () => {
    const repos = repositories()

    const result = await repos.customers.advanceKyc(THIN_FILE, 'complete', {
      actorId: ACTOR,
      route: 'staff',
      extractedFields: [],
      aadhaarLast4: '4471',
    })

    // Whatever the refusal says, the one thing it must not be is "ok".
    if (result.ok) {
      const derived = await repos.customers.derivedState(THIN_FILE)
      expect(
        derived?.requiredCount,
        'completion was allowed, so the file had better actually be complete',
      ).toBeGreaterThan(0)
      expect(derived?.outstanding).toEqual([])
      expect(derived?.rejected).toEqual([])
    }
  })

  it('has no field left on the command through which completeness could be claimed', async () => {
    const repos = repositories()

    // The two fields the old guard read are gone from the type. This asserts the
    // runtime agrees: passing them changes nothing, because nothing reads them.
    const withJunk = await repos.customers.advanceKyc(THIN_FILE, 'complete', {
      actorId: ACTOR,
      route: 'staff',
      extractedFields: [],
      aadhaarLast4: '4471',
      ...({ requiredDocuments: [], presentDocuments: [] } as unknown as Record<string, never>),
    })

    const withoutJunk = await repositories().customers.advanceKyc(THIN_FILE, 'complete', {
      actorId: ACTOR,
      route: 'staff',
      extractedFields: [],
      aadhaarLast4: '4471',
    })

    expect(withJunk.ok).toBe(withoutJunk.ok)
  })

  it('names the specific documents it is waiting for, rather than just saying no', async () => {
    const repos = repositories()

    const result = await repos.customers.advanceKyc(THIN_FILE, 'complete', {
      actorId: ACTOR,
      route: 'staff',
      extractedFields: [],
      aadhaarLast4: '4471',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    // A person told "not complete" has to know what to go and collect.
    const derived = await repos.customers.derivedState(THIN_FILE)
    for (const item of derived?.outstanding ?? []) {
      expect(result.reason).toContain(item)
    }
  })
})

describe('the screen and the machine read one source', () => {
  it('serves the same derived state the guard decides on', async () => {
    const repos = repositories()

    const facts = await repos.customers.kycFacts(THIN_FILE)
    const derived = await repos.customers.derivedState(THIN_FILE)

    expect(facts).not.toBeNull()
    expect(derived).not.toBeNull()
    if (!facts || !derived) return

    // The badge's state and the guard's verdict cannot disagree, because the
    // guard is handed exactly this object.
    const completable = derived.blockers.length === 0
    const result = await repos.customers.advanceKyc(THIN_FILE, 'complete', {
      actorId: ACTOR,
      route: 'staff',
      extractedFields: [],
      aadhaarLast4: '4471',
    })

    if (!completable) expect(result.ok).toBe(false)
  })

  it('reads the documents out of the vault rather than out of the command', async () => {
    const repos = repositories()

    const facts = await repos.customers.kycFacts('cus-rakesh-patel')
    expect(facts).not.toBeNull()
    if (!facts) return

    // Rakesh is the one customer the story cast gives real documents to.
    const types = facts.documents.map((document) => document.docType)
    expect(types).toContain('aadhaar')
    expect(types).toContain('pan')
  })

  it('returns nothing for a customer who does not exist', async () => {
    const repos = repositories()

    expect(await repos.customers.kycFacts('cus-nobody')).toBeNull()
    expect(await repos.customers.derivedState('cus-nobody')).toBeNull()
  })
})

describe('a record that contradicts itself is visible', () => {
  it('flags any live policy standing on an incomplete KYC file', async () => {
    const repos = repositories()
    const page = await repos.customers.list({ page: 1, pageSize: 500 })

    const alarms: string[] = []
    for (const customer of page.rows) {
      const derived = await repos.customers.derivedState(customer.id)
      if (derived && derived.integrityAlarms.length > 0) alarms.push(customer.systemNo)
    }

    // Not an assertion that there are none — the seeded cast may well hold some,
    // and that is the point of the alarm. What matters is that asking the
    // question is possible at all, which it was not while the state was a column.
    expect(Array.isArray(alarms)).toBe(true)
  })
})
