import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { useSessionStore } from '../../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { STARTER_TEMPLATES } from '../../../domain/permissions'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import UsersScreen from './UsersScreen'

/**
 * The other two sections of `/config/users`: the template library and the
 * two-factor matrix.
 *
 * The library's rule is the one worth a test — a starter is cloned, never
 * edited — and it is asserted against `STARTER_TEMPLATES` itself, because the
 * failure this prevents is a shipped library that quietly differs per agency.
 */

let repositories: Repositories

function renderAt(url: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <UsersScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useConfigStore.getState().reset()
  useSessionStore.getState().reset()
})

describe('the permission template library', () => {
  it('clones a starter and edits the copy, leaving the starter alone', async () => {
    const before = JSON.stringify(STARTER_TEMPLATES.salesManager)
    const user = userEvent.setup()
    renderAt('/config/users?tab=templates&template=salesManager')

    // A starter offers exactly one thing to do with it.
    const starter = await screen.findByRole('button', { name: 'Clone and edit' })
    expect(screen.queryByLabelText('Template name')).toBeNull()
    await user.click(starter)

    const nameField = await screen.findByLabelText('Template name')
    expect(nameField).toHaveValue('Sales manager — pipeline (copy)')

    // Grant the copy something the starter does not hold.
    await user.click(screen.getByRole('checkbox', { name: 'Configuration: view' }))

    const save = screen.getByRole('button', { name: 'Save template' })
    await user.click(save)

    const gate = await screen.findByRole('dialog', { name: /Save/ })
    expect(within(gate).getByText('Configuration')).toBeInTheDocument()
    await user.click(within(gate).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const clone = useConfigStore
        .getState()
        .templates.find((template) => template.key === 'salesManager-copy')
      expect(clone?.grants.config).toEqual(['view'])
    })

    expect(JSON.stringify(STARTER_TEMPLATES.salesManager)).toBe(before)
    expect(
      useConfigStore.getState().templates.find((template) => template.key === 'salesManager')
        ?.grants.config,
    ).toBeUndefined()
  })
})

describe('the two-factor matrix', () => {
  it('records what a template asks for, without enforcing anything', async () => {
    const user = userEvent.setup()
    renderAt('/config/users?tab=two-factor')

    const cell = await screen.findByLabelText('Admin — whole business: Sign in')
    expect(cell).toHaveValue('off')

    await user.selectOptions(cell, 'required')

    await waitFor(() => {
      expect(useConfigStore.getState().twoFactor.admin?.signIn).toBe('required')
    })
  })
})
