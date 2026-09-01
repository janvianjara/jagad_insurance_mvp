import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import { EmptyState } from './EmptyState'
import { dataTableColumns } from './table-setup'

type Inquiry = {
  id: string
  reference: string
  customer: string
  ageDays: number
}

const ROWS: Inquiry[] = [
  { id: 'r1', reference: 'INQ-0003', customer: 'Mehta Traders', ageDays: 2 },
  { id: 'r2', reference: 'INQ-0001', customer: 'Anand Shah', ageDays: 9 },
  { id: 'r3', reference: 'INQ-0002', customer: 'Bhavna Patel', ageDays: 5 },
]

const column = dataTableColumns<Inquiry>()
const COLUMNS = column.columns([
  column.accessor('reference', { header: 'Reference' }),
  column.accessor('customer', { header: 'Customer' }),
  column.accessor('ageDays', { header: 'Age' }),
])

function referenceOrder() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('gridcell')[0].textContent)
}

function renderTable(props: Partial<Parameters<typeof DataTable<Inquiry>>[0]> = {}) {
  return render(
    <DataTable
      label="Inquiries"
      data={ROWS}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      {...props}
    />,
  )
}

describe('DataTable', () => {
  it('renders the rows it is handed, in the order it is handed them', () => {
    renderTable()
    expect(referenceOrder()).toEqual(['INQ-0003', 'INQ-0001', 'INQ-0002'])
  })

  it('sorts a column through its header, and reports the direction', async () => {
    const user = userEvent.setup()
    renderTable()

    const header = screen.getByRole('button', { name: /Reference/ })
    await user.click(header)
    expect(referenceOrder()).toEqual(['INQ-0001', 'INQ-0002', 'INQ-0003'])
    expect(screen.getByRole('columnheader', { name: /Reference/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )

    await user.click(screen.getByRole('button', { name: /Reference/ }))
    expect(referenceOrder()).toEqual(['INQ-0003', 'INQ-0002', 'INQ-0001'])
    expect(screen.getByRole('columnheader', { name: /Reference/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('selects rows, reports the selection out, and drives the select-all box', async () => {
    const user = userEvent.setup()
    const onRowSelectionChange = vi.fn()
    renderTable({ selectable: true, onRowSelectionChange })

    await user.click(screen.getByRole('checkbox', { name: 'Select row r2' }))
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ r2: true })

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[1]).toHaveAttribute('aria-selected', 'true')
    expect(rows[0]).toHaveAttribute('aria-selected', 'false')

    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }))
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ r1: true, r2: true, r3: true })
  })

  it('moves the focused row with the arrow keys and opens it with Enter', async () => {
    const user = userEvent.setup()
    const onOpenRow = vi.fn()
    renderTable({ onOpenRow })

    const rows = screen.getAllByRole('row').slice(1)
    rows[0].focus()
    expect(rows[0]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('row').slice(1)[1]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('row').slice(1)[2]).toHaveFocus()

    // It stops at the last row rather than wrapping round.
    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('row').slice(1)[2]).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledWith(ROWS[2])

    await user.keyboard('{Home}')
    expect(screen.getAllByRole('row').slice(1)[0]).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getAllByRole('row').slice(1)[2]).toHaveFocus()
  })

  it('keeps the grid to a single tab stop', async () => {
    const user = userEvent.setup()
    renderTable()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveAttribute('tabindex', '0')
    expect(rows[1]).toHaveAttribute('tabindex', '-1')

    rows[0].focus()
    await user.keyboard('{ArrowDown}')

    const after = screen.getAllByRole('row').slice(1)
    expect(after[0]).toHaveAttribute('tabindex', '-1')
    expect(after[1]).toHaveAttribute('tabindex', '0')
  })

  it('ticks the focused row with Space', async () => {
    const user = userEvent.setup()
    const onRowSelectionChange = vi.fn()
    renderTable({ selectable: true, onRowSelectionChange })

    screen.getAllByRole('row').slice(1)[0].focus()
    await user.keyboard('{ArrowDown} ')
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ r2: true })
  })

  it('hides a column when visibility says so', () => {
    renderTable({ columnVisibility: { customer: false } })
    expect(screen.queryByRole('columnheader', { name: 'Customer' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Reference/ })).toBeInTheDocument()
  })

  it('shows skeleton rows while loading and no data rows', () => {
    renderTable({ loading: true, loadingRows: 4 })
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('row')).toHaveLength(5)
    expect(screen.queryByText('Mehta Traders')).not.toBeInTheDocument()
  })

  it('shows the teaching empty state when there is nothing to list', () => {
    renderTable({
      data: [],
      empty: (
        <EmptyState
          title="No inquiries waiting"
          explanation="New inquiries land here the moment the front office logs a call or a walk-in."
        />
      ),
    })
    expect(screen.getByText('No inquiries waiting')).toBeInTheDocument()
  })
})

describe('folding away columns that say the same thing in every row', () => {
  const SAME_OWNER: Inquiry[] = ROWS.map((row) => ({ ...row, owner: 'Nita Shah' })) as Inquiry[]

  const withOwner = dataTableColumns<Inquiry & { owner: string }>()
  const OWNER_COLUMNS = withOwner.columns([
    withOwner.accessor('reference', { header: 'Reference' }),
    withOwner.accessor('customer', { header: 'Customer' }),
    withOwner.accessor('owner', { header: 'Owner' }),
  ])

  function renderOwners(collapse: boolean) {
    return render(
      <DataTable
        label="Inquiries"
        data={SAME_OWNER as (Inquiry & { owner: string })[]}
        columns={OWNER_COLUMNS}
        getRowId={(row) => row.id}
        collapseConstantColumns={collapse}
      />,
    )
  }

  it('states the shared value once in the caption instead of in every row', () => {
    renderOwners(true)

    expect(screen.queryByRole('columnheader', { name: /Owner/ })).not.toBeInTheDocument()
    // Said once, not three times.
    expect(screen.getAllByText('Nita Shah')).toHaveLength(1)
    expect(screen.getByText('Every row:')).toBeInTheDocument()
  })

  it('leaves the column alone when the flag is off', () => {
    renderOwners(false)

    expect(screen.getByRole('columnheader', { name: /Owner/ })).toBeInTheDocument()
    expect(screen.getAllByText('Nita Shah')).toHaveLength(3)
  })

  it('never folds a display column, whose every row reads undefined', async () => {
    const display = dataTableColumns<Inquiry>()
    const columns = display.columns([
      display.accessor('reference', { header: 'Reference' }),
      display.accessor('customer', { header: 'Customer' }),
      display.display({
        id: 'row-actions',
        header: () => 'Actions',
        cell: () => <button type="button">Discard</button>,
      }),
    ])

    render(
      <DataTable
        label="Inquiries"
        data={ROWS}
        columns={columns}
        getRowId={(row) => row.id}
        collapseConstantColumns
      />,
    )

    // One Discard per row, and no caption: nothing here is constant DATA.
    expect(screen.getAllByRole('button', { name: 'Discard' })).toHaveLength(3)
    expect(screen.queryByText('Every row:')).not.toBeInTheDocument()
  })

  it('does not fold on a page too short for sameness to mean anything', () => {
    render(
      <DataTable
        label="Inquiries"
        data={[SAME_OWNER[0]] as (Inquiry & { owner: string })[]}
        columns={OWNER_COLUMNS}
        getRowId={(row) => row.id}
        collapseConstantColumns
      />,
    )

    expect(screen.getByRole('columnheader', { name: /Owner/ })).toBeInTheDocument()
  })
})
