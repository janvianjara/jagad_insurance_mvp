import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import { placementOptionsFor, useMarketStore } from '../../features/config/shared'
import { WHO, clickRailLink, freshRepositories, renderScenario, signIn } from './harness'
import { appointedProductIds } from '../../domain/workflows'

/**
 * Canvas flow 6 — "Admin Configuration" — one test per row.
 *
 * The claim this flow makes is the largest one the product makes: "the whole
 * system is configuration, not code". A rule test can show that a guard refuses;
 * only a route-level walk can show that an admin, signed in, can reach the
 * screen, add the row, and find the thing they added waiting for them on a
 * different screen. So these run through the real router and the real shell —
 * the rail is followed rather than a URL retyped, because being able to get
 * there is half of what the row promises.
 *
 * The rules themselves are already proved once each, at the store and at the
 * screen that owns them: `individual-lock.test.tsx`, `placement-scope.test.tsx`,
 * `sub-agent-cap.test.tsx`, `company-per-line.test.tsx`, `master-deletion.test.tsx`
 * and `benefit-map.test.tsx`. Nothing here re-proves a guard. What is added is
 * the part no unit had: the whole act, end to end, on the addresses the demo uses.
 */

let repositories: MockRepositories

const BROKER = 'Jagad Insurance Brokers - General'

/** A new insurer, not in the fixture set, so nothing can pass by accident. */
const NEW_COMPANY = 'Star Health and Allied Insurance'
const NEW_PRODUCT = 'Family Health Optima'
const NEW_PRODUCT_CODE = 'SH-FHO'

function companyNamed(name: string) {
  const company = useMarketStore.getState().companies.find((row) => row.name === name)
  expect(company, `No company is named "${name}".`).toBeDefined()
  return company!
}

function agencyNamed(name: string) {
  const agency = useMarketStore.getState().agencies.find((row) => row.name === name)
  expect(agency, `No agency is named "${name}".`).toBeDefined()
  return agency!
}

function productCoded(code: string) {
  const product = useMarketStore.getState().products.find((row) => row.code === code)
  expect(product, `No product carries the code "${code}".`).toBeDefined()
  return product!
}

function agentNamed(name: string) {
  const agent = useMarketStore.getState().agents.find((row) => row.name === name)
  expect(agent, `No agent is named "${name}".`).toBeDefined()
  return agent!
}

/** Opens a queue row's drawer the way a person does — by clicking the row. */
async function openRow(name: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(await screen.findByText(name))
  return screen.findByRole('dialog', { name })
}

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.vivek)
})

describe('canvas 6 — admin configuration', () => {
  it('6.1 a new insurer partnership is added with its lines, its policies and its contacts, and is then available to place', async () => {
    const user = userEvent.setup()
    renderScenario(repositories, '/config/companies')

    // --- the company ------------------------------------------------------
    await user.click(await screen.findByRole('button', { name: 'New company' }))
    const dialog = await screen.findByRole('dialog', { name: 'New company' })

    await user.type(within(dialog).getByLabelText(/Registered name/), NEW_COMPANY)
    await user.type(within(dialog).getByLabelText(/Short name/), 'Star Health')
    await user.type(within(dialog).getByLabelText(/Claims desk email/), 'claims@starhealth.example')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Health' }))
    await user.click(within(dialog).getByRole('button', { name: 'Create company' }))

    expect(await screen.findByText(NEW_COMPANY)).toBeInTheDocument()
    expect(companyNamed(NEW_COMPANY).lines).toEqual(['health'])

    // --- its claims desk, filed under the category that will need it ------
    const companyDrawer = await openRow(NEW_COMPANY)
    await user.type(within(companyDrawer).getByLabelText('Contact name'), 'Meghna Rao')
    await user.type(within(companyDrawer).getByLabelText('Role'), 'Health claims desk')
    await user.selectOptions(within(companyDrawer).getByLabelText('Category'), 'cat-health')
    await user.click(within(companyDrawer).getByRole('button', { name: 'Add contact' }))

    await waitFor(() => {
      const filed = useMarketStore
        .getState()
        .contacts.filter((contact) => contact.companyId === companyNamed(NEW_COMPANY).id)
      expect(filed.map((contact) => contact.name)).toContain('Meghna Rao')
      expect(filed.at(-1)?.categoryId).toBe('cat-health')
    })
    await user.keyboard('{Escape}')

    // --- a policy under it, on the line it was appointed for --------------
    await clickRailLink('Products')
    await user.click(await screen.findByRole('button', { name: 'New product' }))
    const productDialog = await screen.findByRole('dialog', { name: 'New product' })

    await user.selectOptions(
      within(productDialog).getByLabelText(/Company/),
      companyNamed(NEW_COMPANY).id,
    )
    await user.type(within(productDialog).getByLabelText(/^Name/), NEW_PRODUCT)
    await user.type(within(productDialog).getByLabelText(/^Code/), NEW_PRODUCT_CODE)
    await user.selectOptions(within(productDialog).getByLabelText(/Inquiry category/), 'cat-health')
    await user.click(within(productDialog).getByRole('button', { name: 'Create product' }))

    expect(await screen.findByText(NEW_PRODUCT)).toBeInTheDocument()

    // --- and it reaches placement -----------------------------------------
    // Appointing the broker to the new insurer is what makes the partnership
    // usable; until then the row exists but nothing may be written on it.
    await clickRailLink('Agencies')
    const agencyDrawer = await openRow(BROKER)
    await user.click(within(agencyDrawer).getByRole('checkbox', { name: new RegExp(NEW_COMPANY) }))
    await user.click(within(agencyDrawer).getByRole('button', { name: 'Save agency' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: `Save "${BROKER}"` })).getByRole('button', {
        name: 'Save',
      }),
    )

    // The new insurer's catalogue is now offered on the scope editor, which is
    // the one surface that decides what placement may choose from.
    const live = await screen.findByRole('dialog', { name: BROKER })
    const section = await waitFor(() => {
      const node = live.querySelector(`[data-scope-company="${companyNamed(NEW_COMPANY).id}"]`)
      expect(node).not.toBeNull()
      return node as HTMLElement
    })
    expect(
      within(section).getByRole('checkbox', {
        name: new RegExp(`${NEW_PRODUCT} \\(${NEW_PRODUCT_CODE}\\)`),
      }),
    ).toBeInTheDocument()
    // A four-screen walk through the real shell. The allowance is generous so a
    // slow machine under parallel load reports a real failure rather than a clock.
  }, 30_000)

  it('6.3 a new placement code is added as an agency with its type, companies, policy scope and commission', async () => {
    const user = userEvent.setup()
    renderScenario(repositories, '/config/agencies')

    await user.click(await screen.findByRole('button', { name: 'New agency' }))
    const dialog = await screen.findByRole('dialog', { name: 'New agency' })

    await user.type(within(dialog).getByLabelText(/^Name/), 'Jagad Insurance (Tata AIG)')
    await user.click(within(dialog).getByRole('radio', { name: /Individual/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Tata AIG General Insurance' }))

    // The code is issued by the system before the row exists, and never typed.
    expect(within(dialog).getByText(/It will be issued the code JAG-IND-TA/)).toBeInTheDocument()

    // An Individual appointment locks to one company, and the dialog says so at
    // the moment the second box is ticked rather than after Create.
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Royal Sundaram General Insurance' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /locks to exactly one company/,
    )
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Royal Sundaram General Insurance' }),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Create agency' }))

    const created = await waitFor(() => agencyNamed('Jagad Insurance (Tata AIG)'))
    expect(created.type).toBe('individual')
    expect(created.code).toBe('JAG-IND-TA')
    expect(created.companyIds).toEqual([companyNamed('Tata AIG General Insurance').id])

    // Placement offers nothing at all until a scope is agreed, which is the
    // point of the row: an appointment is not yet a permission to place.
    expect(
      appointedProductIds(placementOptionsFor(useMarketStore.getState().scopes, created.id)),
    ).toEqual([])

    // --- the scope, and the rate that came with it ------------------------
    const drawer = await openRow('Jagad Insurance (Tata AIG)')
    await user.click(within(drawer).getByRole('checkbox', { name: /MediCare Premier \(TA-MCP\)/ }))
    const rate = within(drawer).getByLabelText('Commission on TA-MCP')
    await user.clear(rate)
    await user.type(rate, '17.5')

    await user.click(within(drawer).getByRole('button', { name: 'Save policy scope' }))
    const gate = await screen.findByRole('dialog', { name: /Save the policy scope for/ })
    expect(within(gate).getByText('Placeable from now on')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Save scope' }))

    // Placement now offers exactly what was ticked, and the agreed rate is on
    // file as a rate rather than as a computed amount.
    await waitFor(() => {
      const offered = placementOptionsFor(useMarketStore.getState().scopes, created.id)
      expect(appointedProductIds(offered)).toEqual([productCoded('TA-MCP').id])
    })

    const scope = useMarketStore.getState().scopes.find((row) => row.agencyId === created.id)
    expect(scope?.commissionPercentBp).toBe(1750)
  }, 20_000)

  it('6.4 a new agent joins with a percentage, a sub-agent grant, a cap and a direct-updates toggle, and builds a team inside it', async () => {
    const user = userEvent.setup()
    renderScenario(repositories, '/config/agents')

    // --- the agent --------------------------------------------------------
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    const dialog = await screen.findByRole('dialog', { name: 'New agent' })

    await user.type(within(dialog).getByLabelText(/^Name/), 'Bhavesh Modi')
    await user.selectOptions(within(dialog).getByLabelText(/^Agency/), agencyNamed(BROKER).id)
    const share = within(dialog).getByLabelText(/Own percentage/)
    await user.clear(share)
    await user.type(share, '55')
    await user.click(within(dialog).getByRole('button', { name: 'Create agent' }))

    const created = await waitFor(() => agentNamed('Bhavesh Modi'))
    expect(created.sharePercentBp).toBe(5500)

    // A new agent starts with no grant, so there is nothing to carve from.
    expect(created.canGrantSubAgents).toBe(false)

    // --- the grant, the cap and the direct-updates toggle -----------------
    const drawer = await openRow('Bhavesh Modi')
    await user.click(within(drawer).getByRole('switch', { name: /May recruit sub-agents/ }))

    // He was created with no cap, and "no cap set" is a setting rather than an
    // absence: the ceiling is his own percentage until a number replaces it.
    await user.click(within(drawer).getByRole('checkbox', { name: /No cap set/ }))
    const cap = within(drawer).getByLabelText(/Sub-agent cap/)
    await user.clear(cap)
    await user.type(cap, '30')
    await user.click(within(drawer).getByRole('switch', { name: /May post updates directly/ }))

    await user.click(within(drawer).getByRole('button', { name: 'Save agent' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Save "Bhavesh Modi"' })).getByRole(
        'button',
        { name: 'Save' },
      ),
    )

    await waitFor(() => {
      const saved = agentNamed('Bhavesh Modi')
      expect(saved.canGrantSubAgents).toBe(true)
      expect(saved.subAgentCapPercentBp).toBe(3000)
      expect(saved.directUpdatesEnabled).toBe(true)
    })
    await user.keyboard('{Escape}')

    // --- the team he may now build, and the ceiling it is held to ---------
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    const second = await screen.findByRole('dialog', { name: 'New agent' })

    await user.type(within(second).getByLabelText(/^Name/), 'Dhruv Shah')
    await user.selectOptions(within(second).getByLabelText(/^Agency/), agencyNamed(BROKER).id)

    // The grant is what puts him on the list of possible agents to report to.
    await user.selectOptions(within(second).getByLabelText(/Reports to/), agentNamed('Bhavesh Modi').id)

    const subShare = within(second).getByLabelText(/Own percentage/)
    await user.clear(subShare)
    await user.type(subShare, '40')
    await user.click(within(second).getByRole('button', { name: 'Create agent' }))

    // Over the cap, so no row is created and the refusal names the ceiling.
    const refusal = await within(second).findByRole('alert')
    expect(refusal).toHaveTextContent(/above the configured cap/)
    expect(refusal).toHaveTextContent(/30%/)
    expect(useMarketStore.getState().agents.some((agent) => agent.name === 'Dhruv Shah')).toBe(false)

    await user.clear(subShare)
    await user.type(subShare, '25')
    await user.click(within(second).getByRole('button', { name: 'Create agent' }))

    const sub = await waitFor(() => agentNamed('Dhruv Shah'))
    expect(sub.parentAgentId).toBe(agentNamed('Bhavesh Modi').id)
    expect(sub.sharePercentBp).toBe(2500)

    // And the team is visible on the agent it hangs off.
    const team = await openRow('Bhavesh Modi')
    expect(within(team).getByText('Dhruv Shah')).toBeInTheDocument()
  }, 20_000)
})
