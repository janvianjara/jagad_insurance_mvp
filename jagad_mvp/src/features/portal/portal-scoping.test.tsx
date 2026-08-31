import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { portalDesk } from './data/portal-desk'
import { NUMBERS, WALKTHROUGH_NOW, WHO, freshRepositories, portalPath, renderPortal } from './test-harness'

/**
 * The whole privacy claim of the customer portal, asserted rather than promised.
 *
 * There is no customer authentication in this MVP, so nothing stops a screen
 * reading a page of policies and filtering it in the component — and a component
 * filter is invisible the moment somebody adds a search box, a "recently viewed"
 * strip or a debug log. The desk therefore scopes at the read, and this file is
 * what makes that structural: every page is rendered for one customer and the
 * WHOLE rendered document is searched for another customer's numbers and name.
 *
 * The assertions are two-sided on purpose. A test that only checks an absence
 * passes just as well against a blank page, so each one also proves the page it
 * is inspecting actually rendered the right person's records.
 */

let repositories: MockRepositories

beforeEach(() => {
  repositories = freshRepositories()
})

const PAGES = ['/portal', '/portal/policies', '/portal/documents', '/portal/claims'] as const

/** Everything on the screen, as a reader would see it. */
function rendered(): string {
  return document.body.textContent ?? ''
}

describe('a portal shows one customer and nobody else', () => {
  it.each(PAGES)('leaks no other customer on %s', async (path) => {
    renderPortal(repositories, portalPath(path, WHO.rakesh))

    // The page finished loading and holds this customer's own records.
    expect(await screen.findByText(/rakesh patel/i)).toBeInTheDocument()

    const page = rendered()
    expect(page).not.toContain(NUMBERS.falguniPolicy)
    expect(page).not.toContain(NUMBERS.falguniLapsedPolicy)
    expect(page).not.toContain(NUMBERS.falguniClaim)
    expect(page).not.toContain('Falguni')
  })

  it('shows the other customer their own records when the portal is opened as them', async () => {
    renderPortal(repositories, portalPath('/portal/policies', WHO.falguni))

    expect(await screen.findByText(NUMBERS.falguniPolicy)).toBeInTheDocument()

    const page = rendered()
    expect(page).not.toContain(NUMBERS.rakeshPolicy)
    expect(page).not.toContain('Rakesh')
  })
})

describe('the desk scopes at the read, not in the component', () => {
  it('returns only this customer’s policies, claims and documents', async () => {
    const desk = portalDesk(repositories)

    const policies = await desk.policies(WHO.rakesh)
    expect(policies.length).toBeGreaterThan(0)
    for (const card of policies) {
      expect(card.policy.customerId).toBe(WHO.rakesh)
    }

    const claims = await desk.claims(WHO.rakesh)
    expect(claims.length).toBeGreaterThan(0)
    for (const card of claims) {
      expect(card.claim.customerId).toBe(WHO.rakesh)
    }

    // A document belongs to this customer when its subject does: their own file,
    // one of their policies, one of their claims. Nothing else may appear.
    const ownSubjects = new Set<string>([
      `Customer:${WHO.rakesh}`,
      ...policies.map((card) => `Policy:${card.policy.id}`),
      ...claims.map((card) => `Claim:${card.claim.id}`),
    ])
    const documents = await desk.documents(WHO.rakesh)
    expect(documents.length).toBeGreaterThan(0)
    for (const entry of documents) {
      expect(ownSubjects).toContain(`${entry.record.subjectEntity}:${entry.record.subjectId}`)
    }
  })

  it('hands back nothing at all for a customer who is not on the books', async () => {
    const desk = portalDesk(repositories)

    expect(await desk.cover('cus-nobody', WALKTHROUGH_NOW)).toBeNull()
    expect(await desk.documents('cus-nobody')).toEqual([])
    expect(await desk.policies('cus-nobody')).toEqual([])
    expect(await desk.claims('cus-nobody')).toEqual([])
  })

  it('never puts a full identity number in a document view', async () => {
    const desk = portalDesk(repositories)
    const customer = await repositories.customers.get(WHO.rakesh)
    const documents = await desk.documents(WHO.rakesh)

    const aadhaar = documents.find((entry) => entry.identityKind === 'aadhaar')
    expect(aadhaar?.identityValue).toBe(customer?.aadhaarLast4)
    // Four digits is what the platform holds, and four is what the view carries.
    expect((aadhaar?.identityValue ?? '').length).toBeLessThanOrEqual(4)
  })
})
