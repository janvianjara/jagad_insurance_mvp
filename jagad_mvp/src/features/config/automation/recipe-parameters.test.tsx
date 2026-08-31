import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import { useAutomationStore } from './automation-store'
import AutomationScreen from './AutomationScreen'

/**
 * What `/config/automation` actually edits, and who reads it.
 *
 * The escalation recipient is the sharpest case: `planEscalation` in
 * `src/features/inquiries/routing.ts` reads this parameter and nothing else, so
 * the value typed here is the one the inquiry desk obeys. The screen says so,
 * and this test is what keeps that sentence honest.
 */

let repositories: Repositories

function openRecipe(recordId: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/config/automation?record=${recordId}`]}>
          <AutomationScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function parameterRow(scope: HTMLElement, key: string): HTMLElement {
  const row = scope.querySelector(`li[data-parameter="${key}"]`)
  expect(row).not.toBeNull()
  return row as HTMLElement
}

function recipeNamed(key: string) {
  const recipe = useAutomationStore.getState().recipes.find((row) => row.key === key)
  expect(recipe).toBeDefined()
  return recipe!
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useAutomationStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('the escalation recipient', () => {
  it('names the screen that reads it', async () => {
    openRecipe('rcp-inquiry-escalation')
    const drawer = await screen.findByRole('dialog', { name: /Escalate a twice-lapsed inquiry/ })

    const row = parameterRow(drawer, 'escalateToUserId')
    expect(row).toHaveTextContent('/inquiries')
    expect(row).toHaveTextContent(/planEscalation/)
    expect(row).toHaveTextContent(/refuses to escalate and prints the reason rather than picking somebody/)
  })

  it('is a person, chosen from the staff on file — never a typed id', async () => {
    openRecipe('rcp-inquiry-escalation')
    const drawer = await screen.findByRole('dialog', { name: /Escalate a twice-lapsed inquiry/ })

    const select = within(parameterRow(drawer, 'escalateToUserId')).getByRole('combobox')
    const offered = [...select.querySelectorAll('option')].map((option) => option.value)

    const active = useConfigStore.getState().users.filter((user) => user.active)
    expect(offered).toEqual(expect.arrayContaining(active.map((user) => user.id)))
    expect(select).toHaveValue(String(recipeNamed('inquiry.escalation').parameters.escalateToUserId))
  })

  it('writes nothing until the gate is confirmed, then publishes a new version', async () => {
    const user = userEvent.setup()
    openRecipe('rcp-inquiry-escalation')
    const drawer = await screen.findByRole('dialog', { name: /Escalate a twice-lapsed inquiry/ })

    const before = recipeNamed('inquiry.escalation')
    const select = within(parameterRow(drawer, 'escalateToUserId')).getByRole('combobox')
    const other = useConfigStore
      .getState()
      .users.find((candidate) => candidate.active && candidate.id !== before.parameters.escalateToUserId)!

    await user.selectOptions(select, other.id)

    // The draft moved; the recipe has not.
    expect(recipeNamed('inquiry.escalation').parameters.escalateToUserId).toBe(
      before.parameters.escalateToUserId,
    )

    await user.click(screen.getByRole('button', { name: 'Save parameters' }))
    const cancelled = await screen.findByRole('dialog', { name: /Save "Escalate a twice-lapsed/ })
    // The gate spells the change out in names, not ids.
    expect(cancelled).toHaveTextContent(other.name)
    await user.click(within(cancelled).getByRole('button', { name: 'Cancel' }))

    expect(recipeNamed('inquiry.escalation').parameters.escalateToUserId).toBe(
      before.parameters.escalateToUserId,
    )

    await user.click(screen.getByRole('button', { name: 'Save parameters' }))
    const confirmed = await screen.findByRole('dialog', { name: /Save "Escalate a twice-lapsed/ })
    await user.click(within(confirmed).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const after = recipeNamed('inquiry.escalation')
      expect(after.parameters.escalateToUserId).toBe(other.id)
      // A new version, so what ran last week stays answerable for.
      expect(after.version).toBe(before.version + 1)
    })
  })
})

describe('the inquiry turnaround', () => {
  it('shows the allowance the inquiry queue measures its clock against', async () => {
    openRecipe('rcp-inquiry-routing')
    const drawer = await screen.findByRole('dialog', { name: /Route a new inquiry/ })

    expect(parameterRow(drawer, 'tatMinutes')).toHaveTextContent('/inquiries')

    const allowances = within(drawer).getByRole('list', { name: 'Category allowances' })
    const categories = useConfigStore.getState().categories
    expect(categories.length).toBeGreaterThan(0)
    for (const category of categories) {
      const row = allowances.querySelector(`li[data-category="${category.key}"]`)
      expect(row).toHaveTextContent(`${category.tatMinutes} minutes`)
    }
  })

  it('does not offer that panel on a recipe the inquiry desk does not read', async () => {
    openRecipe('rcp-renewal-schedule')
    const drawer = await screen.findByRole('dialog', { name: /Open a renewal task/ })

    expect(within(drawer).queryByRole('list', { name: 'Category allowances' })).toBeNull()
    // A parameter nothing reads yet says so rather than implying an effect.
    expect(parameterRow(drawer, 'leadDays')).toHaveTextContent(/No screen reads this parameter yet/)
  })
})
