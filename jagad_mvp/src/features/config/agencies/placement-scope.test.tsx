import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { placementInsideAgencyScope, reasonOf } from '../../../domain/workflows'
import { ToastProvider } from '../../../ui/surface'
import { placementOptionsFor, useMarketStore } from '../shared'
import AgenciesScreen from './AgenciesScreen'

/**
 * P-10b's second acceptance criterion, FR-07.4: "Placement offers only companies
 * and products inside the selected agency's scope."
 *
 * The assertion is made against P-03's `placementInsideAgencyScope` rather than
 * against a copy of the rule, because that guard is what the deal machine will
 * actually run. So this test says the thing worth saying: what an admin ticks on
 * this screen is precisely what the placement guard will accept later, and what
 * they untick is what it will refuse.
 */

let repositories: Repositories

const BROKER = 'Jagad Insurance Brokers - General'
const DROPPED = 'prd-nb-ra2'
const KEPT = 'prd-nb-hcp'

function renderScreen() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/agencies']}>
          <AgenciesScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function brokerAgency() {
  const agency = useMarketStore.getState().agencies.find((candidate) => candidate.name === BROKER)
  expect(agency).toBeDefined()
  return agency!
}

function offered() {
  return placementOptionsFor(useMarketStore.getState().scopes, brokerAgency().id)
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useMarketStore.getState().reset()
})

describe('agency scope', () => {
  it('filters the placement options offered', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(BROKER))
    const drawer = await screen.findByRole('dialog', { name: BROKER })

    // It starts inside the scope, so placement starts offering it.
    expect(offered().productIds).toContain(DROPPED)
    expect(drawer.querySelector(`[data-placement-product="${DROPPED}"]`)).not.toBeNull()

    await user.click(within(drawer).getByRole('checkbox', { name: /ReAssure 2\.0 \(NB-RA2\)/ }))
    await user.click(within(drawer).getByRole('button', { name: 'Save policy scope' }))

    const gate = await screen.findByRole('dialog', { name: /Save the policy scope for/ })
    expect(within(gate).getByText('No longer placeable')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Save scope' }))

    await waitFor(() => expect(offered().productIds).not.toContain(DROPPED))

    // What the deal machine will do with the new scope, checked by the deal
    // machine's own guard rather than by a second copy of the rule.
    const scope = offered()
    const refused = placementInsideAgencyScope({
      agencyScope: scope,
      lineItems: [
        {
          id: 'li-1',
          companyId: 'cmp-niva-bupa',
          productId: DROPPED,
          label: 'Niva Bupa ReAssure 2.0',
        },
      ],
    })
    const allowed = placementInsideAgencyScope({
      agencyScope: scope,
      lineItems: [
        {
          id: 'li-2',
          companyId: 'cmp-niva-bupa',
          productId: KEPT,
          label: 'Niva Bupa Health Companion',
        },
      ],
    })

    expect(refused.ok).toBe(false)
    expect(reasonOf(refused)).toContain('Niva Bupa ReAssure 2.0')
    expect(allowed.ok).toBe(true)

    // And the screen says the same thing it just made true.
    await waitFor(() => {
      const live = screen.getByRole('dialog', { name: BROKER })
      expect(live.querySelector(`[data-placement-product="${DROPPED}"]`)).toBeNull()
      expect(live.querySelector(`[data-placement-product="${KEPT}"]`)).not.toBeNull()
    })
  })

  it('writes nothing when the scope change is cancelled', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(BROKER))
    const drawer = await screen.findByRole('dialog', { name: BROKER })

    await user.click(within(drawer).getByRole('checkbox', { name: /ReAssure 2\.0 \(NB-RA2\)/ }))
    await user.click(within(drawer).getByRole('button', { name: 'Save policy scope' }))

    const gate = await screen.findByRole('dialog', { name: /Save the policy scope for/ })
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }))

    expect(offered().productIds).toContain(DROPPED)
  })

  it('offers nothing from a company the agency is not appointed to', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(BROKER))
    await screen.findByRole('dialog', { name: BROKER })

    const agency = brokerAgency()
    const verdict = useMarketStore
      .getState()
      .saveAgencyScope(agency.id, [{ productId: 'prd-lc-jva', commissionPercentBp: 2500 }])

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('not appointed to the company')
    expect(offered().productIds).not.toContain('prd-lc-jva')
  })
})
