import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { visibleNavigation } from '../../../app/navigation'
import { resolveAccount, useSessionStore } from '../../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import UsersScreen from './UsersScreen'

/**
 * P-10a's first acceptance criterion, and it is not a mock: `visibleNavigation`
 * is the function `<SideRail>` renders from, and the rail this test reads is the
 * one Nita Shah would see.
 *
 * The chain the test exercises is the real one — an admin picks a template in
 * the drawer, confirms the gate, the configuration store republishes the session
 * accounts, and `can()` produces a different set of nav items from the same
 * `NAVIGATION` configuration. Nothing here reaches past the screen to set state
 * by hand.
 */

let repositories: Repositories

async function hydrateSession() {
  const staff = await repositories.config.users()
  const accounts = staff.filter((person) => person.active).map(resolveAccount)
  const admin = accounts.find((account) => account.user.templateKey === 'admin')
  useSessionStore.getState().hydrate(accounts, admin?.user.id)
}

/** Prints the rail a given account would see, straight from `visibleNavigation`. */
function NavProbe({ userId }: { userId: string }) {
  const accounts = useSessionStore((state) => state.accounts)
  const account = accounts.find((candidate) => candidate.user.id === userId)

  return (
    <output data-testid={`nav-${userId}`}>
      {account
        ? visibleNavigation(account.user)
            .flatMap((section) => section.items)
            .map((item) => item.label)
            .join(' | ')
        : 'no account'}
    </output>
  )
}

function renderScreen(userId: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/users']}>
          <NavProbe userId={userId} />
          <UsersScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

beforeEach(async () => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useConfigStore.getState().reset()
  useSessionStore.getState().reset()
  await hydrateSession()
})

describe('assigning a different permission template', () => {
  it('changes the nav the user sees', async () => {
    const person = useSessionStore
      .getState()
      .accounts.find((account) => account.user.name === 'Nita Shah')!

    const user = userEvent.setup()
    renderScreen(person.user.id)

    const before = await screen.findByTestId(`nav-${person.user.id}`)
    expect(before).toHaveTextContent('My leads')
    expect(before).not.toHaveTextContent('Work queue')

    // Open her account from the queue — the row opens the drawer, as every
    // queue row in the product does.
    await user.click(await screen.findByText('Nita Shah'))
    const drawer = await screen.findByRole('dialog', { name: 'Nita Shah' })

    await user.selectOptions(within(drawer).getByLabelText('Template'), 'backOffice')
    await user.click(within(drawer).getByRole('button', { name: 'Assign template' }))

    // The gate previews the consequence before it happens.
    const gate = await screen.findByRole('dialog', { name: /Assign/ })
    expect(within(gate).getByText('Modules that appear')).toBeInTheDocument()

    await user.click(within(gate).getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(screen.getByTestId(`nav-${person.user.id}`)).toHaveTextContent('Work queue')
    })

    const after = screen.getByTestId(`nav-${person.user.id}`)
    expect(after).toHaveTextContent('KYC')
    expect(after).not.toHaveTextContent('My leads')

    // And the session holds the resolved template, not just a key.
    const resolved = useSessionStore
      .getState()
      .accounts.find((account) => account.user.id === person.user.id)
    expect(resolved?.user.template.key).toBe('backOffice')
  })

  it('writes nothing when the gate is cancelled', async () => {
    const person = useSessionStore
      .getState()
      .accounts.find((account) => account.user.name === 'Nita Shah')!

    const user = userEvent.setup()
    renderScreen(person.user.id)

    await user.click(await screen.findByText('Nita Shah'))
    const drawer = await screen.findByRole('dialog', { name: 'Nita Shah' })

    await user.selectOptions(within(drawer).getByLabelText('Template'), 'backOffice')
    await user.click(within(drawer).getByRole('button', { name: 'Assign template' }))

    const gate = await screen.findByRole('dialog', { name: /Assign/ })
    await user.click(within(gate).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByTestId(`nav-${person.user.id}`)).toHaveTextContent('My leads')
    expect(
      useConfigStore.getState().users.find((candidate) => candidate.id === person.user.id)
        ?.templateKey,
    ).toBe('agent')
  })
})
