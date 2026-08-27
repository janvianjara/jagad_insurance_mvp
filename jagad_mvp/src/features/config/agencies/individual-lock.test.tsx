import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useMarketStore } from '../shared'
import AgenciesScreen from './AgenciesScreen'

/**
 * P-10b's first acceptance criterion, from §9 and canvas 6.3: "An Individual
 * agency locks to exactly one company; Broker allows many."
 *
 * The rule is asserted at both ends deliberately. Through the screen, because
 * that is where a person meets it and the refusal has to say which of the two
 * ways out to take; and through the store, because the screen is not the only
 * caller and a rule that lives only in a component is a rule the next screen can
 * forget.
 */

let repositories: Repositories

const INDIVIDUAL = 'Jagad Insurance (HDFC Ergo)'
const BROKER = 'Jagad Insurance Brokers - General'

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

async function openAgency(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByText(name))
  return screen.findByRole('dialog', { name })
}

function agencyNamed(name: string) {
  const agency = useMarketStore.getState().agencies.find((candidate) => candidate.name === name)
  expect(agency).toBeDefined()
  return agency!
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useMarketStore.getState().reset()
})

describe('adding a second company to an Individual agency', () => {
  it('is blocked, with the refusal naming the two ways out', async () => {
    const user = userEvent.setup()
    renderScreen()

    const drawer = await openAgency(user, INDIVIDUAL)
    const before = agencyNamed(INDIVIDUAL)
    expect(before.companyIds).toHaveLength(1)

    await user.click(within(drawer).getByRole('checkbox', { name: /Niva Bupa/ }))

    // The refusal says why, and what to do instead.
    const refusal = await within(drawer).findByRole('alert')
    expect(refusal).toHaveTextContent(/locks to exactly one company/)
    expect(refusal).toHaveTextContent(/2 are chosen/)
    expect(refusal).toHaveTextContent(/second agency code, or the Broker type/)

    // And the gate stays shut, so Confirm never leads to a silent no.
    expect(within(drawer).getByRole('button', { name: 'Save agency' })).toBeDisabled()

    // Nothing was written.
    expect(agencyNamed(INDIVIDUAL).companyIds).toEqual(before.companyIds)
  })

  it('is refused by the store as well, whoever calls it', () => {
    const state = useMarketStore.getState()
    void state.hydrate(repositories)

    return waitFor(() => {
      const agency = agencyNamed(INDIVIDUAL)
      const verdict = useMarketStore.getState().saveAgency(agency.id, {
        name: agency.name,
        type: agency.type,
        city: agency.city,
        companyIds: [...agency.companyIds, 'cmp-niva-bupa'],
      })

      expect(verdict.ok).toBe(false)
      expect(agencyNamed(INDIVIDUAL).companyIds).toHaveLength(1)
    })
  })
})

describe('a Broker agency', () => {
  it('carries as many companies as it is appointed to', async () => {
    const user = userEvent.setup()
    renderScreen()

    const drawer = await openAgency(user, BROKER)
    const before = agencyNamed(BROKER)
    expect(before.companyIds.length).toBeGreaterThan(1)

    await user.click(within(drawer).getByRole('checkbox', { name: /Royal Sundaram/ }))

    expect(within(drawer).queryByRole('alert')).toBeNull()
    expect(within(drawer).getByRole('button', { name: 'Save agency' })).toBeEnabled()

    await user.click(within(drawer).getByRole('button', { name: 'Save agency' }))
    const gate = await screen.findByRole('dialog', { name: /Save "Jagad Insurance Brokers - General"/ })
    await user.click(within(gate).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(agencyNamed(BROKER).companyIds).toHaveLength(before.companyIds.length + 1)
    })
  })
})
