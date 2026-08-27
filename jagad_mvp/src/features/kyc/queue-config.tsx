/**
 * The KYC queue, as configuration (plan §5 "KYC queue + detail", §6).
 *
 * Not a table. `<WorkQueue>` was built once in P-08, so this file says what a
 * KYC row is and nothing about how a list behaves.
 *
 * Two decisions worth reading:
 *
 *   The queue is the outstanding set, always. `kycState` is a filter the
 *   repository already declares, so the queue narrows to `pending` and `partial`
 *   through the same mechanism a person uses — and a URL that asks for
 *   `complete` gets nothing rather than a second, quieter query. The queue is
 *   what its address says it is.
 *
 *   A row leads to the customer, not to a KYC-only screen. There is one file per
 *   person and §4's route map has no `/back-office/kyc/:id`; opening the row on
 *   `/customers/:id?tab=kyc` puts the work next to the household, the policies
 *   and the timeline it is about.
 */

import { emptyPage } from '../../data/repo'
import type { Customer, ListQuery, Page, StaffUser } from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import { ConsentBadge } from '../../components/ConsentBadge'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import type { Severity } from '../../ui/tone'
import { RecordId, RelativeTime } from '../../ui/type'
import { KYC_LABEL, KYC_TONE } from '../customers/customer-view'
import type { CustomerDesk } from '../customers/data/customer-desk'

/** The two states that still owe work. `complete` is not a KYC queue row. */
export const OUTSTANDING_KYC: readonly string[] = ['pending', 'partial']

export type KycQueueDeps = {
  readonly desk: CustomerDesk
  readonly users: readonly StaffUser[]
  /** Injected: a row and the file it opens must never disagree about now. */
  readonly now: Date
}

const column = dataTableColumns<Customer>()

/** A part-filled file with an expired link is the hottest row in the queue. */
export function kycSeverity(customer: Customer): Severity {
  if (customer.consentState === 'expired') return 'hot'
  if (customer.kycState === 'pending') return 'attn'
  if (customer.consentState === 'link_issued') return 'warm'
  return 'cool'
}

export function kycQueueConfig(deps: KycQueueDeps): QueueConfig<Customer> {
  const { desk, users, now } = deps
  const nameOf = (id: string | null) =>
    id === null ? 'Unassigned' : (users.find((user) => user.id === id)?.name ?? id)

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Reference',
      cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
    }),
    column.accessor('fullName', {
      header: 'Customer',
      enableSorting: false,
    }),
    column.accessor('kycState', {
      header: 'KYC',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={KYC_TONE[row.original.kycState]}>
          {KYC_LABEL[row.original.kycState]}
        </StatusPill>
      ),
    }),
    column.accessor('consentState', {
      header: 'Consent link',
      enableSorting: false,
      cell: ({ row }) => <ConsentBadge state={row.original.consentState} now={now} />,
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => nameOf(row.original.ownerId),
    }),
    column.accessor('createdAt', {
      header: 'On the books',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
    }),
  ])

  return {
    key: 'kyc',
    title: 'KYC completion',
    description:
      'Every customer whose file is not yet complete. A file completes when its checklist is on file, every extracted value has been confirmed, and consent is recorded.',
    noun: 'file',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'kycState',
        label: 'KYC state',
        options: [
          { value: 'pending', label: KYC_LABEL.pending },
          { value: 'partial', label: KYC_LABEL.partial },
        ],
      },
      {
        key: 'consentState',
        label: 'Consent',
        options: [
          { value: 'not_sent', label: 'No link sent' },
          { value: 'link_issued', label: 'Link out, unanswered' },
          { value: 'submitted', label: 'Consent recorded' },
          { value: 'expired', label: 'Link expired' },
        ],
      },
    ],
    sortable: ['createdAt', 'fullName', 'systemNo'],
    defaultSort: { field: 'createdAt', direction: 'desc' },
    searchPlaceholder: 'Name, mobile or reference',
    stripeMapping: kycSeverity,
    load: (query: ListQuery) => loadOutstanding(desk, query),
    empty: {
      title: 'No KYC files are waiting',
      explanation:
        'A file lands here when a deal is won and the customer still owes documents or consent. Completing one issues their portal credentials automatically.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/customers/${row.id}?tab=kyc`,
  }
}

/**
 * The outstanding set, narrowed by whatever else the URL asked for.
 *
 * The intersection is done on the filter values rather than on the rows, so the
 * repository still does the paging and `total` still counts the filtered set
 * (§7: a header that says "812" when four are showing is the bug `Page.total`
 * exists to prevent).
 */
export async function loadOutstanding(desk: CustomerDesk, query: ListQuery): Promise<Page<Customer>> {
  const asked = query.filters?.kycState ?? []
  const kycState =
    asked.length === 0 ? OUTSTANDING_KYC : asked.filter((state) => OUTSTANDING_KYC.includes(state))

  // An empty selection means "filter nothing" to the repository, so a URL asking
  // only for `complete` would widen the queue instead of emptying it. It empties.
  if (kycState.length === 0) return emptyPage<Customer>(query.pageSize)

  return desk.list({ ...query, filters: { ...query.filters, kycState } })
}
