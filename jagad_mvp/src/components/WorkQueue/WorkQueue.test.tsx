import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { Inquiry, ListQuery, Repositories } from '../../data/repo'
import { ToastProvider } from '../../ui/surface'
import { dataTableColumns } from '../../ui/data'
import { WorkQueue } from './WorkQueue'
import type { QueueConfig } from './queue-config'

/**
 * The queue is exercised against the real mock repositories rather than a stub
 * array, because the promise being tested is that the URL and the repository
 * agree: the filter names, the sort fields and the page are the ones the data
 * layer declares, and a queue built on anything else would pass a test and fail
 * on a screen.
 */
let repositories: Repositories

beforeEach(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

const column = dataTableColumns<Inquiry>()

function inquiryQueue(overrides: Partial<QueueConfig<Inquiry>> = {}): QueueConfig<Inquiry> {
  return {
    key: 'inquiries',
    title: 'Inquiries',
    noun: 'inquiry',
    getRowId: (row) => row.id,
    columns: column.columns([
      column.accessor('systemNo', { header: 'Reference' }),
      column.accessor('contactName', { header: 'Customer' }),
      column.accessor('status', { header: 'Status', enableSorting: false }),
    ]),
    filters: [
      {
        key: 'status',
        label: 'Inquiry status',
        options: [
          { value: 'new', label: 'New' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'converted', label: 'Converted' },
        ],
      },
    ],
    sortable: ['createdAt', 'systemNo', 'tatDueAt'],
    defaultSort: { field: 'createdAt', direction: 'desc' },
    stripeMapping: (row) => (row.status === 'escalated' ? 'hot' : 'cool'),
    load: (query: ListQuery) => repositories.inquiries.list(query),
    empty: { title: 'No inquiries yet', explanation: 'New inquiries land here.' },
    pageSize: 5,
    rowTarget: 'drawer',
    drawerTitle: (row) => row.systemNo,
    renderDrawer: (row) => <p>Detail for {row.contactName}</p>,
    ...overrides,
  } as QueueConfig<Inquiry>
}

type BulkRun = (selection: { ids: readonly string[] }) => Promise<{
  ok: boolean
  message: string
}>

function assignAction(run: BulkRun) {
  return {
    key: 'assign',
    label: 'Assign',
    confirmTitle: (selection: { ids: readonly string[] }) =>
      `Assign ${selection.ids.length} inquiries`,
    preview: (selection: { ids: readonly string[] }) => [
      { key: 'owner', label: 'Owner', from: 'Unassigned', to: 'Nita Shah' },
      { key: 'count', label: 'Inquiries', to: String(selection.ids.length) },
    ],
    run,
  }
}

/** Prints the live search string so a test can assert what the URL now holds. */
function UrlProbe() {
  const [params] = useSearchParams()
  return <output data-testid="url">{params.toString()}</output>
}

function renderQueue(config: QueueConfig<Inquiry>, url = '/inquiries') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/inquiries"
            element={
              <>
                <WorkQueue config={config} />
                <UrlProbe />
              </>
            }
          />
          <Route path="/inquiries/:id" element={<h1>Inquiry detail</h1>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

function bodyRows() {
  const table = screen.getByRole('grid', { name: 'Inquiries' })
  return within(table)
    .getAllByRole('row')
    .filter((row) => row.hasAttribute('data-row-id'))
}

describe('a queue view is reconstructible from its URL', () => {
  it('applies filter, sort, page and selection carried in the address alone', async () => {
    const filtered = await repositories.inquiries.list({
      filters: { status: ['converted'] },
      sort: { field: 'systemNo', direction: 'asc' },
      page: 2,
      pageSize: 2,
    })
    expect(filtered.rows.length).toBeGreaterThan(0)

    const first = filtered.rows[0]
    renderQueue(
      inquiryQueue({ bulkActions: [assignAction(async () => ({ ok: true, message: 'Assigned.' }))] }),
      `/inquiries?status=converted&sort=systemNo:asc&page=2&size=2&sel=${first.id}`,
    )

    await screen.findByText(first.systemNo)
    expect(bodyRows()).toHaveLength(filtered.rows.length)

    // The header count reports the filtered set, not the page.
    expect(await screen.findByText(new RegExp(`${filtered.total} inquir`))).toBeInTheDocument()

    // The ticked row came off the URL too.
    const checkbox = screen.getByRole('checkbox', { name: `Select row ${first.id}` })
    expect(checkbox).toBeChecked()
    const selectionBar = screen
      .getAllByRole('status')
      .find((element) => element.textContent?.includes('inquiry selected'))
    expect(selectionBar).toHaveTextContent(/1\s*inquiry selected of 2/)

    // And the filter control shows the choice the URL made.
    expect(screen.getByLabelText('Inquiry status')).toHaveValue('converted')
  })

  it('opens the record named by ?record=', async () => {
    const page = await repositories.inquiries.list({ pageSize: 5 })
    const target = page.rows[0]

    renderQueue(inquiryQueue(), `/inquiries?size=5&record=${target.id}`)

    expect(await screen.findByText(`Detail for ${target.contactName}`)).toBeInTheDocument()
  })

  it('writes every interaction back into the URL', async () => {
    const user = userEvent.setup()
    renderQueue(
      inquiryQueue({ bulkActions: [assignAction(async () => ({ ok: true, message: 'Assigned.' }))] }),
    )
    await screen.findByRole('grid', { name: 'Inquiries' })

    await user.selectOptions(screen.getByLabelText('Inquiry status'), 'converted')
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('status=converted'))

    await user.click(screen.getByRole('button', { name: /Reference/ }))
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('sort=systemNo'))

    const row = bodyRows()[0]
    const rowId = row.getAttribute('data-row-id')
    await user.click(within(row).getByRole('checkbox'))
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent(`sel=${rowId}`))
  })

  it('resets the page and clears the selection when the list is narrowed', async () => {
    const user = userEvent.setup()
    const page = await repositories.inquiries.list({ pageSize: 5, page: 2 })
    renderQueue(inquiryQueue(), `/inquiries?size=5&page=2&sel=${page.rows[0].id}`)
    await screen.findByRole('grid', { name: 'Inquiries' })

    await user.selectOptions(screen.getByLabelText('Inquiry status'), 'converted')

    await waitFor(() => {
      const url = screen.getByTestId('url').textContent ?? ''
      expect(url).not.toContain('page=2')
      expect(url).not.toContain('sel=')
    })
  })

  it('routes rather than opening a drawer when the queue says so', async () => {
    const user = userEvent.setup()
    renderQueue(
      inquiryQueue({
        rowTarget: 'route',
        rowHref: (row: Inquiry) => `/inquiries/${row.id}`,
      } as Partial<QueueConfig<Inquiry>>),
    )
    await screen.findByRole('grid', { name: 'Inquiries' })

    await user.click(bodyRows()[0])
    expect(await screen.findByRole('heading', { name: 'Inquiry detail' })).toBeInTheDocument()
  })
})

describe('bulk actions are outward mutations', () => {
  it('shows the change before anything is written, and cancel writes nothing', async () => {
    const user = userEvent.setup()
    const run = vi.fn<BulkRun>(async () => ({ ok: true, message: 'Assigned.' }))
    const page = await repositories.inquiries.list({ pageSize: 5 })

    renderQueue(
      inquiryQueue({ bulkActions: [assignAction(run)] }),
      `/inquiries?size=5&sel=${page.rows[0].id}`,
    )

    await user.click(await screen.findByRole('button', { name: 'Assign' }))

    // The preview is real before the button that commits appears.
    expect(await screen.findByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Nita Shah')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(run).not.toHaveBeenCalled()
  })

  it('runs only from confirm, then reports what happened', async () => {
    const user = userEvent.setup()
    const run = vi.fn<BulkRun>(async () => ({
      ok: true,
      message: 'Four inquiries assigned to Nita Shah.',
    }))
    const page = await repositories.inquiries.list({ pageSize: 5 })

    renderQueue(
      inquiryQueue({ bulkActions: [assignAction(run)] }),
      `/inquiries?size=5&sel=${page.rows[0].id},${page.rows[1].id}`,
    )

    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0].ids).toEqual([page.rows[0].id, page.rows[1].id])
    expect(
      await screen.findAllByText('Four inquiries assigned to Nita Shah.'),
    ).not.toHaveLength(0)
  })
})

describe('the three states a list owes a person', () => {
  it('teaches, rather than saying "no results", when a filter empties it', async () => {
    renderQueue(inquiryQueue(), '/inquiries?q=zzzzzzzz')

    expect(await screen.findByText(/No inquiry matches these filters/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show everything' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('says why it is empty when nothing is filtering it', async () => {
    renderQueue(
      inquiryQueue({
        load: async () => ({ rows: [], total: 0, page: 1, pageSize: 5, pageCount: 0 }),
      }),
    )

    expect(await screen.findByText('No inquiries yet')).toBeInTheDocument()
  })

  it('renders the refusal a repository gives back', async () => {
    renderQueue(
      inquiryQueue({
        load: async () => {
          throw new Error('The inquiry service did not answer.')
        },
      }),
    )

    expect(await screen.findByText('The inquiry service did not answer.')).toBeInTheDocument()
  })
})
