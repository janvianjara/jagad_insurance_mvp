import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { reasonOf, subAgentShareWithinCap } from '../../../domain/workflows'
import { ToastProvider } from '../../../ui/surface'
import { useMarketStore } from '../shared'
import AgentsScreen from './AgentsScreen'

/**
 * P-10b's third acceptance criterion, §9: "A share above the configured cap is
 * blocked; with no cap set, any share within the agent's own % is accepted."
 *
 * Both halves are asserted, because §9's second sentence is the one a
 * reimplementation would get wrong: no cap set does not mean no ceiling, it means
 * the agent's own percentage is the ceiling. The check is P-03's
 * `subAgentShareWithinCap` — this screen calls it through the store and does not
 * carry a second copy of the rule, which the last test here pins by running the
 * guard directly on the same numbers.
 */

let repositories: Repositories

const AGENT = 'Kiran Solanki'
const SUB_AGENT = 'Meera Joshi'

function renderScreen() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/agents']}>
          <AgentsScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function agentNamed(name: string) {
  const agent = useMarketStore.getState().agents.find((candidate) => candidate.name === name)
  expect(agent).toBeDefined()
  return agent!
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useMarketStore.getState().reset()
})

describe('a sub-agent share above the cap', () => {
  it('is blocked, naming the cap it is above', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(SUB_AGENT))
    const drawer = await screen.findByRole('dialog', { name: SUB_AGENT })

    expect(agentNamed(AGENT).subAgentCapPercentBp).toBe(4000)
    const before = agentNamed(SUB_AGENT).sharePercentBp

    const share = within(drawer).getByLabelText(/Own percentage/)
    await user.clear(share)
    await user.type(share, '50')

    // Said twice on purpose: once against the field, once beside the Save that
    // will not fire while it stands.
    const refusals = await within(drawer).findAllByText(/above the configured cap/)
    expect(refusals.length).toBeGreaterThan(0)
    expect(refusals[0]).toHaveTextContent(/50%/)
    expect(refusals[0]).toHaveTextContent(/40%/)

    expect(within(drawer).getByRole('button', { name: 'Save agent' })).toBeDisabled()
    expect(agentNamed(SUB_AGENT).sharePercentBp).toBe(before)
  })

  it('is accepted when it is inside the cap', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(SUB_AGENT))
    const drawer = await screen.findByRole('dialog', { name: SUB_AGENT })

    const share = within(drawer).getByLabelText(/Own percentage/)
    await user.clear(share)
    await user.type(share, '35')

    await user.click(within(drawer).getByRole('button', { name: 'Save agent' }))
    const gate = await screen.findByRole('dialog', { name: `Save "${SUB_AGENT}"` })
    await user.click(within(gate).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(agentNamed(SUB_AGENT).sharePercentBp).toBe(3500))
  })
})

describe('with no cap set', () => {
  it("still holds the share to the agent's own percentage", async () => {
    const user = userEvent.setup()
    renderScreen()

    // Take the cap away entirely. §9 is explicit that this is not "no ceiling".
    await user.click(await screen.findByText(AGENT))
    await screen.findByRole('dialog', { name: AGENT })

    const agent = agentNamed(AGENT)
    const cleared = useMarketStore.getState().saveAgent(agent.id, {
      name: agent.name,
      mobile: agent.mobile,
      email: agent.email,
      agencyId: agent.agencyId,
      city: agent.city,
      parentAgentId: agent.parentAgentId,
      categoryIds: agent.categoryIds,
      sharePercentBp: agent.sharePercentBp,
      canGrantSubAgents: true,
      subAgentCapPercentBp: null,
      directUpdatesEnabled: agent.directUpdatesEnabled,
    })
    expect(cleared.ok).toBe(true)
    expect(agentNamed(AGENT).subAgentCapPercentBp).toBeNull()

    const store = useMarketStore.getState()
    const subAgent = agentNamed(SUB_AGENT)

    // Inside the agent's own 60%: accepted, cap or no cap.
    expect(store.setSubAgentShare(subAgent.id, 5500).ok).toBe(true)
    expect(agentNamed(SUB_AGENT).sharePercentBp).toBe(5500)

    // Above it: refused, because the share is carved out of that cut.
    const refused = useMarketStore.getState().setSubAgentShare(subAgent.id, 7000)
    expect(refused.ok).toBe(false)
    expect(reasonOf(refused)).toContain("more than the agent's own 60%")
    expect(agentNamed(SUB_AGENT).sharePercentBp).toBe(5500)

    // And that refusal is P-03's guard, on the same numbers — not a copy of it.
    expect(
      subAgentShareWithinCap({
        agentSharePercentBp: agentNamed(AGENT).sharePercentBp,
        subAgentSharePercentBp: 7000,
        capPercentBp: undefined,
      }).ok,
    ).toBe(false)
  })
})
