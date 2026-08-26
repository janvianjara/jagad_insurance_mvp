import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ColumnVisibilityState,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table'
import type { Tone } from '../../tone'
import { ColumnPicker } from '../ColumnPicker'
import type { PickableColumn } from '../ColumnPicker'
import { DataTable } from '../DataTable'
import { EmptyState } from '../EmptyState'
import { Pagination } from '../Pagination'
import { SelectionBar } from '../SelectionBar'
import { Skeleton, SkeletonText } from '../Skeleton'
import { StatCard } from '../StatCard'
import { TableToolbar } from '../TableToolbar'
import { dataTableColumns } from '../table-setup'
import styles from './DataGallery.module.css'

/**
 * Gallery section for `src/ui/data`.
 *
 * Every primitive appears in the states it actually ships in, including the
 * three a list surface owes a person: loading, empty and populated. The sample
 * rows are inline and pre-formatted — nothing here computes an amount.
 */

type Inquiry = {
  id: string
  systemNo: string
  customer: string
  product: string
  premium: string
  owner: string
  age: string
  tone: Tone
}

const INQUIRIES: Inquiry[] = [
  {
    id: 'INQ-0774',
    systemNo: 'INQ-0774',
    customer: 'Mehta Traders',
    product: 'Commercial fire',
    premium: '1,84,500.00',
    owner: 'Unassigned',
    age: '3h to TAT',
    tone: 'attn',
  },
  {
    id: 'INQ-0771',
    systemNo: 'INQ-0771',
    customer: 'Anand Shah',
    product: 'Motor private car',
    premium: '18,240.00',
    owner: 'Ritu K.',
    age: '1d 4h',
    tone: 'ok',
  },
  {
    id: 'INQ-0768',
    systemNo: 'INQ-0768',
    customer: 'Bhavna Patel',
    product: 'Family health floater',
    premium: '42,900.00',
    owner: 'Sameer D.',
    age: 'TAT breached',
    tone: 'bad',
  },
  {
    id: 'INQ-0765',
    systemNo: 'INQ-0765',
    customer: 'Surat Textiles LLP',
    product: 'Group personal accident',
    premium: '2,66,000.00',
    owner: 'Ritu K.',
    age: '6h to TAT',
    tone: 'warn',
  },
  {
    id: 'INQ-0759',
    systemNo: 'INQ-0759',
    customer: 'Kiran Joshi',
    product: 'Term life',
    premium: '31,000.00',
    owner: 'Closed',
    age: 'Archived',
    tone: 'idle',
  },
]

const column = dataTableColumns<Inquiry>()

const COLUMNS = column.columns([
  column.accessor('systemNo', {
    header: 'Reference',
    cell: (info) => <span className={styles.mono}>{info.getValue()}</span>,
  }),
  column.accessor('customer', { header: 'Customer' }),
  column.accessor('product', { header: 'Product' }),
  column.accessor('premium', {
    header: 'Premium recorded',
    cell: (info) => <span className={styles.amount}>{info.getValue()}</span>,
  }),
  column.accessor('owner', { header: 'Owner' }),
  column.accessor('age', { header: 'Clock', enableSorting: false }),
])

const COLUMN_LABELS: Record<string, string> = {
  systemNo: 'Reference',
  customer: 'Customer',
  product: 'Product',
  premium: 'Premium recorded',
  owner: 'Owner',
  age: 'Clock',
}

const ALWAYS_ON = new Set(['systemNo', 'customer'])

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>{title}</h3>
        <p className={styles.blockNote}>{note}</p>
      </div>
      {children}
    </div>
  )
}

export default function DataGallery() {
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({})
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [opened, setOpened] = useState<string | null>(null)

  const pickable: PickableColumn[] = Object.keys(COLUMN_LABELS).map((id) => ({
    id,
    label: COLUMN_LABELS[id],
    visible: visibility[id] !== false,
    canHide: !ALWAYS_ON.has(id),
  }))

  const selectedCount = Object.values(selection).filter(Boolean).length

  return (
    <div className={styles.group}>
      <Block
        title="StatCard"
        note="One figure from a queue, big enough to read across a desk. The value is handed in already formatted; the card has no arithmetic in it, which is what lets it show money without breaching the record-only rule."
      >
        <div className={styles.statRow}>
          <StatCard label="Open inquiries" value="18" meta="across the team" icon="inbox" />
          <StatCard
            label="Unassigned"
            value="4"
            meta="needs a person"
            tone="attn"
            icon="users"
            onClick={() => setOpened('Unassigned pool')}
          />
          <StatCard label="TAT breached" value="2" meta="since 09:40" tone="bad" icon="clock" />
          <StatCard label="Collected today" value="3,42,110" meta="rupees, recorded" tone="ok" icon="coin" />
          <StatCard label="Renewal pool" value="0" loading />
        </div>
      </Block>

      <Block
        title="DataTable, populated"
        note="Sortable headers, row selection, a status stripe per row, and a single tab stop: arrow keys move the focused row, Enter opens it, Space ticks it. Toolbar, column picker, selection bar and pagination are the strip above and below."
      >
        <div className={styles.selectionSlot}>
          <SelectionBar
            count={selectedCount}
            total={INQUIRIES.length}
            noun="inquiry"
            onClear={() => setSelection({})}
          >
            <button type="button" className={styles.buttonQuiet}>
              Assign to me
            </button>
            <button type="button" className={styles.buttonQuiet}>
              Send quotation request
            </button>
          </SelectionBar>
        </div>

        <div className={styles.queue}>
          <TableToolbar
            title="Inquiry queue"
            count={INQUIRIES.length}
            description="Everything the front office logged that has not yet become a quotation."
            actions={
              <>
                <button type="button" className={styles.buttonQuiet}>
                  Export
                </button>
                <button type="button" className={styles.button}>
                  New inquiry
                </button>
              </>
            }
          >
            <input
              className={styles.search}
              type="search"
              placeholder="Search reference or customer"
              aria-label="Search inquiries"
            />
            <ColumnPicker
              columns={pickable}
              onToggle={(id, visible) => setVisibility({ ...visibility, [id]: visible })}
              onReset={() => setVisibility({})}
            />
          </TableToolbar>

          <DataTable
            label="Inquiry queue"
            data={INQUIRIES}
            columns={COLUMNS}
            getRowId={(row) => row.id}
            selectable
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            sorting={sorting}
            onSortingChange={setSorting}
            columnVisibility={visibility}
            onColumnVisibilityChange={setVisibility}
            rowTone={(row) => row.tone}
            onOpenRow={(row) => setOpened(`${row.systemNo} — ${row.customer}`)}
          />

          <Pagination
            pageIndex={pageIndex}
            pageSize={pageSize}
            totalRows={312}
            noun="inquiries"
            onPageChange={setPageIndex}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPageIndex(0)
            }}
          />
        </div>

        <p className={styles.opened}>
          {opened ? `Row opened: ${opened}` : 'Open a row to see what the drawer would receive.'}
        </p>
      </Block>

      <Block
        title="DataTable, loading"
        note="Skeleton rows keep the column rhythm so the table does not jump when the data lands. They are hidden from assistive technology; the grid announces itself busy instead."
      >
        <DataTable
          label="Inquiry queue loading"
          data={INQUIRIES}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          selectable
          rowTone={(row) => row.tone}
          loading
          loadingRows={5}
        />
      </Block>

      <Block
        title="DataTable, empty and failed"
        note="An empty queue that explains itself teaches the product. U13: name what is missing, say why it is missing, offer the one thing to do next."
      >
        <DataTable
          label="Inquiry queue empty"
          data={[]}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          empty={
            <EmptyState
              title="No inquiries waiting"
              explanation="Inquiries land here the moment the front office logs a call, a walk-in or a sub-agent lead. Nothing is waiting on you right now."
              action={
                <button type="button" className={styles.button}>
                  Log an inquiry
                </button>
              }
            />
          }
        />

        <DataTable
          label="Inquiry queue failed"
          data={[]}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          error={
            <EmptyState
              variant="error"
              title="Could not load the inquiry queue"
              explanation="The request failed before any records came back. Nothing was lost and nothing was changed; retrying is safe."
              action={
                <button type="button" className={styles.button}>
                  Try again
                </button>
              }
            />
          }
        />
      </Block>

      <Block
        title="EmptyState, the other variants"
        note="Filtered results and finished work are different messages from an empty queue, and each names the way back."
      >
        <div className={styles.stateFrame}>
          <EmptyState
            variant="filtered"
            title="No inquiries match these filters"
            explanation="Product is set to Term life and Owner is set to Ritu K. Widening either brings 18 inquiries back."
            action={
              <button type="button" className={styles.button}>
                Clear filters
              </button>
            }
            secondaryAction={
              <button type="button" className={styles.buttonQuiet}>
                Save this view
              </button>
            }
          />
        </div>
        <div className={styles.stateFrame}>
          <EmptyState
            variant="done"
            title="Queue cleared"
            explanation="Every inquiry assigned to you today has been quoted or closed. New work will appear here as the front office logs it."
          />
        </div>
      </Block>

      <Block
        title="Skeleton"
        note="Three shapes, one slow sweep, and no animation at all when the person has asked for reduced motion."
      >
        <div className={styles.skeletonBoard}>
          <Skeleton shape="circle" width="40px" height="40px" />
          <SkeletonText lines={3} />
        </div>
      </Block>
    </div>
  )
}
