import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesProvider } from '../../../app/repositories'
import { NO_LATENCY, createMockRepositories } from '../../../data/mock'
import type { Repositories } from '../../../data/repo'
import { ToastProvider } from '../../../ui/surface'
import { useConfigStore } from '../shared'
import MastersScreen from './MastersScreen'

/**
 * P-10a's second acceptance criterion.
 *
 * The count that blocks the deletion is a real read: `usageOf` asks the inquiry
 * and customer repositories how many records hold the value, through the filters
 * those repositories declare. So this test would fail the day the fixtures stop
 * sourcing inquiries from the website — which is the point, because that is
 * exactly when the refusal would stop being true.
 */

let repositories: Repositories

function renderScreen() {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/config/masters']}>
          <MastersScreen />
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

/**
 * The row for one value. A value's label appears in its own heading and again in
 * its revision history, so the row is addressed by the key records store rather
 * than by the label a person reads.
 */
function valueRow(scope: HTMLElement, key: string): HTMLLIElement {
  const row = scope.querySelector(`li[data-value-key="${key}"]`)
  expect(row).not.toBeNull()
  return row as HTMLLIElement
}

/** Opens the master's drawer once its usage counts have arrived. */
async function openInquirySource(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('Inquiry source'))
  const drawer = await screen.findByRole('dialog', { name: 'Inquiry source' })
  // The usage counts arrive after the repositories answer.
  await waitFor(() => expect(screen.queryAllByText('Counting use…')).toHaveLength(0))
  return drawer
}

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
  useConfigStore.getState().reset()
})

describe('deleting a master value that is in use', () => {
  it('is blocked, and deactivation is offered instead', async () => {
    const user = userEvent.setup()
    renderScreen()

    const drawer = await openInquirySource(user)
    await user.click(within(valueRow(drawer, 'website')).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: /Delete "Website"/ })

    // The refusal says what is holding it, not just "no".
    const refusal = within(dialog).getByRole('alert')
    expect(refusal).toHaveTextContent(/is held by/)
    expect(refusal).toHaveTextContent(/inquiries/)
    expect(refusal).toHaveTextContent(/cannot be deleted/)

    // Nothing that deletes is on offer; deactivation is.
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate instead' }))

    await waitFor(() => {
      const value = useConfigStore
        .getState()
        .masterValues.find((candidate) => candidate.key === 'website')
      expect(value?.active).toBe(false)
    })

    // The value survives, with the deactivation kept as a revision.
    const value = useConfigStore
      .getState()
      .masterValues.find((candidate) => candidate.key === 'website')!
    expect(value.version).toBe(2)
    expect(value.revisions.at(-1)?.note).toContain('Records that hold it are untouched')

    await waitFor(() => {
      const live = screen.getByRole('dialog', { name: 'Inquiry source' })
      expect(within(valueRow(live, 'website')).getByText('Deactivated')).toBeInTheDocument()
    })
  })

  it('writes nothing when the offer is cancelled', async () => {
    const user = userEvent.setup()
    renderScreen()

    const drawer = await openInquirySource(user)
    await user.click(within(valueRow(drawer, 'website')).getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog', { name: /Delete "Website"/ })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      useConfigStore.getState().masterValues.find((candidate) => candidate.key === 'website')
        ?.active,
    ).toBe(true)
  })

  it('deletes a value outright when nothing holds it', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText('Inquiry source'))
    const drawer = await screen.findByRole('dialog', { name: 'Inquiry source' })

    // Added inline, the way a form adds one — so nothing can be holding it.
    await user.click(within(drawer).getByRole('button', { name: /Add inquiry source/ }))
    await user.type(screen.getByLabelText('New inquiry source'), 'Insurance fair')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(
        useConfigStore
          .getState()
          .masterValues.some((candidate) => candidate.key === 'insurance_fair'),
      ).toBe(true)
    })

    await waitFor(() => expect(screen.queryAllByText('Counting use…')).toHaveLength(0))
    const live = screen.getByRole('dialog', { name: 'Inquiry source' })
    await user.click(
      within(valueRow(live, 'insurance_fair')).getByRole('button', { name: 'Delete' }),
    )

    const dialog = await screen.findByRole('dialog', { name: /Delete "Insurance fair"/ })
    expect(within(dialog).queryByRole('alert')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(
        useConfigStore
          .getState()
          .masterValues.some((candidate) => candidate.key === 'insurance_fair'),
      ).toBe(false)
    })
  })
})

describe('a platform master', () => {
  it('offers neither deletion nor deactivation of its values', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(await screen.findByText('Member relationship'))
    const drawer = await screen.findByRole('dialog', { name: 'Member relationship' })

    expect(within(drawer).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(drawer).queryByRole('button', { name: 'Deactivate' })).toBeNull()
    expect(
      within(drawer).getAllByText(/Platform values are neither renamed nor removed here/).length,
    ).toBeGreaterThan(0)
  })
})
