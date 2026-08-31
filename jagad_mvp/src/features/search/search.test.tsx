import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { can } from '../../domain/permissions'
import { GROUP_ORDER, MIN_TERM_LENGTH, globalSearch } from './search-desk'
import { WHO, currentRoute, freshRepositories, renderSearch, signIn } from './test-harness'

describe('global search — the desk', () => {
  it('says nothing at all below the minimum term length', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)

    const groups = await globalSearch(repositories, user, 'a')

    expect(groups).toEqual([])
  })

  it('finds a customer by the name a caller would give', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    // Read the name out of the repository rather than typing a fixture literal,
    // so the test follows the cast if the cast is recast.
    const someone = (await repositories.customers.list({ pageSize: 1 })).rows[0]

    const groups = await globalSearch(repositories, user, someone.fullName.split(' ')[0])
    const customers = groups.find((group) => group.kind === 'customer')

    expect(customers).toBeDefined()
    expect(customers?.hits.some((hit) => hit.id === someone.id)).toBe(true)
  })

  it('finds a policy by its system number', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    const policy = (await repositories.policies.list({ pageSize: 1 })).rows[0]

    const groups = await globalSearch(repositories, user, policy.systemNo)
    const policies = groups.find((group) => group.kind === 'policy')

    expect(policies?.hits.some((hit) => hit.id === policy.id)).toBe(true)
  })

  /**
   * The composition that justifies the desk existing at all: `POLICY_LIST_SPEC`
   * searches only the two numbers, so a holder's name reaches a policy only by
   * resolving the customer first. If this passes, "find me the Patel policy"
   * works; if it fails, the search is a record-number lookup wearing a name box.
   */
  it("finds a person's policies by the person's name, which the policy row does not carry", async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)

    const withPolicy = (await repositories.policies.list({ pageSize: 20 })).rows[0]
    const holder = await repositories.customers.get(withPolicy.customerId)
    expect(holder).not.toBeNull()

    const groups = await globalSearch(repositories, user, holder!.fullName)
    const policies = groups.find((group) => group.kind === 'policy')

    expect(policies?.hits.some((hit) => hit.id === withPolicy.id)).toBe(true)
    expect(policies?.hits.every((hit) => hit.to.startsWith('/policies/'))).toBe(true)
  })

  /**
   * The allow-list, proved rather than asserted. A sub-agent's template grants
   * neither policies nor claims, so those groups must never be *queried* — not
   * queried and then hidden, which is the version that leaks a count.
   */
  it('never returns a group the account may not view', async () => {
    const repositories = freshRepositories()
    const subAgent = await signIn(repositories, WHO.meera)
    const admin = await signIn(repositories, WHO.vivek)

    const refused = GROUP_ORDER.filter((kind) => {
      const resource = { customer: 'customers', policy: 'policies', inquiry: 'inquiries',
        quotation: 'quotations', deal: 'deals', claim: 'claims', task: 'tasks' } as const
      return !can(subAgent, 'view', resource[kind])
    })
    expect(refused.length).toBeGreaterThan(0)

    // A term broad enough that the admin genuinely finds the refused kinds,
    // so an empty result for the sub-agent means refusal and not "no match".
    const term = 'a'.repeat(MIN_TERM_LENGTH)
    const adminGroups = await globalSearch(repositories, admin, term)
    const subAgentGroups = await globalSearch(repositories, subAgent, term)

    for (const kind of refused) {
      expect(subAgentGroups.some((group) => group.kind === kind)).toBe(false)
    }
    expect(adminGroups.length).toBeGreaterThanOrEqual(subAgentGroups.length)
  })

  it('carries the term through to the queue so "see all" lands pre-filtered', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    const someone = (await repositories.customers.list({ pageSize: 1 })).rows[0]

    const groups = await globalSearch(repositories, user, someone.fullName)
    const customers = groups.find((group) => group.kind === 'customer')

    expect(customers?.seeAllTo).toBe(`/customers?q=${encodeURIComponent(someone.fullName)}`)
  })
})

describe('global search — the palette', () => {
  it('asks for a longer term before it searches anything', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    renderSearch(repositories, user)

    expect(
      await screen.findByText(/Type at least \d+ characters/i),
    ).toBeInTheDocument()
  })

  it('opens the record when the row is chosen, and lands on its route', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    const someone = (await repositories.customers.list({ pageSize: 1 })).rows[0]
    renderSearch(repositories, user)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search records' }), someone.fullName)

    const row = await screen.findByRole('option', { name: new RegExp(someone.systemNo) })
    await userEvent.click(row)

    await waitFor(() => expect(currentRoute()).toBe(`/customers/${someone.id}`))
  })

  it('walks the rows with the arrow keys and opens the one Enter is on', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    const someone = (await repositories.customers.list({ pageSize: 1 })).rows[0]
    renderSearch(repositories, user)

    const field = screen.getByRole('searchbox', { name: 'Search records' })
    await userEvent.type(field, someone.fullName)
    await screen.findByRole('option', { name: new RegExp(someone.systemNo) })

    // The first row is selected the moment an answer arrives, so Enter alone is
    // the whole keyboard path from typing a name to standing on the record.
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(currentRoute()).not.toBe('/assistant'))
  })

  it('explains an empty answer instead of showing a blank list', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    renderSearch(repositories, user)

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search records' }),
      'zzzzzznosuchrecord',
    )

    expect(await screen.findByText(/Nothing matched/i)).toBeInTheDocument()
  })

  /**
   * Aadhaar is last-4 maximum in staff UI and never a search term. The palette
   * adds no reader of its own, so this asserts the absence stays an absence:
   * a twelve-digit term matches nothing, and no result row ever prints twelve
   * consecutive digits. The assertion is scoped to the rows on purpose — the
   * empty state quotes the term back, and the person's own typing is not a leak.
   */
  it('does not resolve an identity number, and no row prints one', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    renderSearch(repositories, user)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search records' }), '123456789012')

    expect(await screen.findByText(/Nothing matched/i)).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  /**
   * The companion to the above: a term that DOES match must still print no
   * identity number. Mobile numbers are ten digits and are a legitimate search
   * key; twelve consecutive digits are not.
   *
   * Asserted cell by cell rather than over the row's `textContent`, because a
   * record number and a mobile sitting in adjacent cells concatenate into a
   * fourteen-digit run that is on no screen and in no field. Testing the
   * concatenation tests the DOM's string joining, not the product's masking.
   */
  it('prints no twelve-digit value in any result cell', async () => {
    const repositories = freshRepositories()
    const user = await signIn(repositories, WHO.vivek)
    const someone = (await repositories.customers.list({ pageSize: 1 })).rows[0]
    renderSearch(repositories, user)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search records' }), someone.fullName)
    await screen.findByRole('option', { name: new RegExp(someone.systemNo) })

    const rows = screen.getAllByRole('option')
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      for (const cell of row.querySelectorAll('span')) {
        expect(cell.textContent ?? '').not.toMatch(/\d{12}/)
      }
    }
  })
})
