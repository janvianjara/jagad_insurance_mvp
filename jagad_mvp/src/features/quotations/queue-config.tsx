/**
 * The quotation and deal queues, as configuration (plan §5, §6).
 *
 * `<WorkQueue>` was built once in P-08; every list screen after it is an object
 * of this shape. `load` receives exactly what the URL said and nothing else, so
 * both views stay reconstructible from their address.
 */

import type { Customer, Deal, ListQuery, Page, Quotation, StaffUser } from '../../data/repo'
import type { QueueConfig, QueueRowControls } from '../../components/WorkQueue'
import { DISCARDED_FILTER, RowDiscardAction, discardBulkAction } from '../../components/RecordCorrection'
import type { DiscardReason } from '../../domain/amend'
import type { MutationResult } from '../../data/repo'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { Money as AmountText, RecordId, RelativeTime } from '../../ui/type'
import {
  DEAL_LABEL,
  DEAL_TONE,
  QUOTATION_LABEL,
  QUOTATION_TONE,
  dealSeverity,
  nameOf,
  quotationSeverity,
} from './quotation-view'
import styles from './QuotationQueue.module.css'

export type QuotationQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<Quotation>>
  readonly customers: readonly Customer[]
  readonly users: readonly StaffUser[]
  readonly now: Date
  readonly actorId?: string
  /**
   * Removal from the list. Optional, and its absence is the control: a caller
   * that cannot write - the gallery, a read-only harness - simply leaves it out
   * and the queue offers no discard rather than offering one that refuses.
   */
  readonly discard?: (
    id: string,
    command: { readonly reason: DiscardReason; readonly actorId: string },
  ) => Promise<MutationResult<Quotation>>
}

const quotationColumn = dataTableColumns<Quotation>()

export function quotationQueueConfig(deps: QuotationQueueDeps): QueueConfig<Quotation> {
  const { load, customers, users, now, actorId, discard } = deps
  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.fullName ?? id

  return {
    key: 'quotations',
    title: 'Quotations',
    noun: 'quotation',
    getRowId: (row) => row.id,
    columns: quotationColumn.columns([
      quotationColumn.accessor('systemNo', {
        header: 'Reference',
        cell: ({ row }) => (
          <span className={styles.reference}>
            <RecordId systemNo={row.original.systemNo} showInsurer={false} />
          </span>
        ),
      }),
      quotationColumn.accessor('customerId', {
        header: 'Customer',
        enableSorting: false,
        cell: ({ row }) => customerName(row.original.customerId),
      }),
      quotationColumn.accessor('status', {
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={QUOTATION_TONE[row.original.status]}>
            {QUOTATION_LABEL[row.original.status]}
          </StatusPill>
        ),
      }),
      quotationColumn.accessor('version', {
        header: 'Version',
        cell: ({ row }) => <span className={styles.version}>v{row.original.version}</span>,
      }),
      quotationColumn.accessor('companyIds', {
        header: 'Companies',
        enableSorting: false,
        cell: ({ row }) => String(row.original.companyIds.length),
      }),
      quotationColumn.accessor('ownerId', {
        header: 'Owner',
        enableSorting: false,
        cell: ({ row }) => nameOf(users, row.original.ownerId),
      }),
      quotationColumn.accessor('finalPayablePremium', {
        header: 'Accepted premium',
        enableSorting: false,
        cell: ({ row }) => (
          <AmountText
            paise={row.original.finalPayablePremium?.paise ?? null}
            absentText="not accepted yet"
          />
        ),
      }),
      quotationColumn.accessor('createdAt', {
        header: 'Age',
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
      }),
    ]),
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: Object.entries(QUOTATION_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'ownerId',
        label: 'Owner',
        options: users
          .filter((user) => user.active)
          .map((user) => ({ value: user.id, label: user.name })),
      },
      // The queues hide a discarded row by default, so this is the way back to
      // one. It lives in the URL like every other filter, so the view survives a
      // reload and can be handed to somebody else.
      DISCARDED_FILTER,
    ],
    ...(discard && actorId
      ? {
          rowActions: (row: Quotation, queue: QueueRowControls) => (
            <RowDiscardAction
              entity="Quotation"
              subject={row.systemNo}
              actorId={actorId}
              onDiscard={(command) => discard(row.id, command)}
              onDiscarded={queue.reload}
            />
          ),
          bulkActions: [
            discardBulkAction<Quotation>({
              noun: 'quotation',
              plural: 'quotations',
              actorId,
              discard,
            }),
          ],
        }
      : {}),
    sortable: ['createdAt', 'systemNo', 'version'],
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchPlaceholder: 'Quotation reference',
    stripeMapping: quotationSeverity,
    load,
    empty: {
      title: 'No quotations have been raised',
      explanation:
        'A quotation compares one customer’s options across the companies the agency is appointed for. Start one with New quotation, pick the policies to compare, and the composer opens on the union of their benefits.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/quotations/${row.id}`,
  }
}

export type DealQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<Deal>>
  readonly customers: readonly Customer[]
  readonly users: readonly StaffUser[]
  readonly now: Date
  readonly actorId?: string
  /**
   * Removal from the list. Optional, and its absence is the control: a caller
   * that cannot write - the gallery, a read-only harness - simply leaves it out
   * and the queue offers no discard rather than offering one that refuses.
   */
  readonly discard?: (
    id: string,
    command: { readonly reason: DiscardReason; readonly actorId: string },
  ) => Promise<MutationResult<Deal>>
}

const dealColumn = dataTableColumns<Deal>()

export function dealQueueConfig(deps: DealQueueDeps): QueueConfig<Deal> {
  const { load, customers, users, now, actorId, discard } = deps
  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.fullName ?? id

  return {
    key: 'deals',
    title: 'Deals',
    noun: 'deal',
    getRowId: (row) => row.id,
    columns: dealColumn.columns([
      dealColumn.accessor('systemNo', {
        header: 'Application no.',
        cell: ({ row }) => (
          <span className={styles.reference}>
            <RecordId systemNo={row.original.systemNo} showInsurer={false} />
          </span>
        ),
      }),
      dealColumn.accessor('customerId', {
        header: 'Customer',
        enableSorting: false,
        cell: ({ row }) => customerName(row.original.customerId),
      }),
      dealColumn.accessor('status', {
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={DEAL_TONE[row.original.status]}>
            {DEAL_LABEL[row.original.status]}
          </StatusPill>
        ),
      }),
      dealColumn.accessor('lineItems', {
        header: 'Line items',
        enableSorting: false,
        cell: ({ row }) => String(row.original.lineItems.length),
      }),
      dealColumn.accessor('ownerId', {
        header: 'Owner',
        enableSorting: false,
        cell: ({ row }) => nameOf(users, row.original.ownerId),
      }),
      dealColumn.accessor('createdAt', {
        header: 'Age',
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
      }),
    ]),
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: Object.entries(DEAL_LABEL).map(([value, label]) => ({ value, label })),
      },
      DISCARDED_FILTER,
    ],
    ...(discard && actorId
      ? {
          rowActions: (row: Deal, queue: QueueRowControls) => (
            <RowDiscardAction
              entity="Deal"
              subject={row.systemNo}
              actorId={actorId}
              onDiscard={(command) => discard(row.id, command)}
              onDiscarded={queue.reload}
            />
          ),
          bulkActions: [
            discardBulkAction<Deal>({
              noun: 'deal',
              plural: 'deals',
              actorId,
              discard,
            }),
          ],
        }
      : {}),
    sortable: ['createdAt', 'systemNo'],
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchPlaceholder: 'Application number',
    stripeMapping: dealSeverity,
    load,
    empty: {
      title: 'No deals are open',
      explanation:
        'A deal opens when a customer accepts a quotation. Mark a shared quotation won and the accepted columns become its line items, ready for policy entry.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/deals/${row.id}`,
  }
}
