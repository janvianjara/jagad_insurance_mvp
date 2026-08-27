import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { contactsOfCompany, useConfigStore, useMarketStore } from '../shared'
import CompaniesScreen from './CompaniesScreen'

/**
 * Plan §5's "per line" bullet, made checkable: HDFC Life and HDFC Ergo General
 * are two companies in this system, not one company with a flag.
 *
 * Life and general insurance are written by separately licensed entities, with
 * separate appointments, separate commission schedules and separate claims desks.
 * A single row holding both would make every count wrong the first time somebody
 * filtered by line, so the store refuses it and the screen says why.
 */

let repositories: Repositories

const GENERAL = 'HDFC Ergo General Insurance'

function renderScreen() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/companies']}>
          <CompaniesScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

function companyNamed(name: string) {
  const company = useMarketStore.getState().companies.find((candidate) => candidate.name === name)
  expect(company).toBeDefined()
  return company!
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useMarketStore.getState().reset()
  useConfigStore.getState().reset()
})

describe('a company row', () => {
  it('cannot hold life and general at once', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(GENERAL))
    const drawer = await screen.findByRole('dialog', { name: GENERAL })
    const before = companyNamed(GENERAL).lines

    await user.click(within(drawer).getByRole('checkbox', { name: 'Life' }))

    const refusal = await within(drawer).findByRole('alert')
    expect(refusal).toHaveTextContent(/separately licensed/)
    expect(refusal).toHaveTextContent(/two companies here, not one company with a flag/)
    expect(within(drawer).getByRole('button', { name: 'Save company' })).toBeDisabled()
    expect(companyNamed(GENERAL).lines).toEqual(before)
  })
})

describe('a company contact', () => {
  it('is filed under the category whose desk will need it', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText(GENERAL))
    const drawer = await screen.findByRole('dialog', { name: GENERAL })

    const company = companyNamed(GENERAL)
    const before = contactsOfCompany(useMarketStore.getState().contacts, company.id).length

    await user.type(within(drawer).getByLabelText('Contact name'), 'Asha Menon')
    await user.type(within(drawer).getByLabelText('Role'), 'Health claims desk')
    await user.selectOptions(within(drawer).getByLabelText('Category'), 'cat-health')
    await user.click(within(drawer).getByRole('button', { name: 'Add contact' }))

    await waitFor(() => {
      const contacts = contactsOfCompany(useMarketStore.getState().contacts, company.id)
      expect(contacts).toHaveLength(before + 1)
      expect(contacts.at(-1)?.categoryId).toBe('cat-health')
    })
  })
})
