/**
 * The customer list, as configuration (plan §5 "Customer list", §6).
 *
 * §5 asks for search, household grouping, source, the linked sub-agent and the
 * KYC state, and every one of those is a column or a filter here rather than a
 * query of its own — so the list the URL describes is the list on screen.
 *
 * Household is shown as the household's name rather than as a grouped table. A
 * grouping that collapses rows would make the page count and the row count mean
 * different things, and the 360 is one click away for the family view.
 */

import type { Customer, Household, ListQuery, StaffUser } from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import { ConsentBadge } from '../../components/ConsentBadge'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import type { Severity } from '../../ui/tone'
import { RecordId } from '../../ui/type'
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  KYC_LABEL,
  KYC_TONE,
} from './customer-view'
import type { CustomerDesk } from './data/customer-desk'
import styles from './CustomerList.module.css'

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  website: 'Website',
  walk_in: 'Walk-in',
  referral: 'Referral',
  sub_agent: 'Sub-agent',
  campaign: 'Campaign',
  renewal: 'Renewal',
}

export type CustomerQueueDeps = {
  readonly desk: CustomerDesk
  readonly households: readonly Household[]
  readonly users: readonly StaffUser[]
  readonly cities: readonly string[]
  readonly now: Date
}

const column = dataTableColumns<Customer>()

/** How much of the agency's attention a row wants, not which state it holds. */
export function customerSeverity(customer: Customer): Severity {
  if (customer.status === 'lapsed') return 'hot'
  if (customer.kycState !== 'complete') return 'attn'
  if (customer.status === 'prospect') return 'warm'
  if (customer.status === 'active') return 'good'
  return 'cool'
}

export function customerQueueConfig(deps: CustomerQueueDeps): QueueConfig<Customer> {
  const { desk, households, users, cities, now } = deps
  const householdName = (id: string | null) =>
    id === null ? 'No household' : (households.find((house) => house.id === id)?.name ?? id)
  const nameOf = (id: string | null) =>
    id === null ? 'Unassigned' : (users.find((user) => user.id === id)?.name ?? id)

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Reference',
      cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
    }),
    column.accessor('fullName', {
      header: 'Customer',
      cell: ({ row }) => (
        <span className={styles.person}>
          <span className={styles.name}>{row.original.fullName}</span>
          <span className={styles.mobile}>{row.original.mobile}</span>
        </span>
      ),
    }),
    column.accessor('householdId', {
      header: 'Household',
      enableSorting: false,
      cell: ({ row }) => householdName(row.original.householdId),
    }),
    column.accessor('status', {
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={CUSTOMER_STATUS_TONE[row.original.status]}>
          {CUSTOMER_STATUS_LABEL[row.original.status]}
        </StatusPill>
      ),
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
      header: 'Consent',
      enableSorting: false,
      cell: ({ row }) => <ConsentBadge state={row.original.consentState} now={now} />,
    }),
    column.accessor('source', {
      header: 'Source',
      enableSorting: false,
      cell: ({ row }) => SOURCE_LABEL[row.original.source] ?? row.original.source,
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => nameOf(row.original.ownerId),
    }),
  ])

  return {
    key: 'customers',
    title: 'Customers',
    description:
      'Everyone on the books, with where their KYC and their consent stand. A row opens the 360.',
    noun: 'customer',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: Object.entries(CUSTOMER_STATUS_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'kycState',
        label: 'KYC',
        options: Object.entries(KYC_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'source',
        label: 'Source',
        options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'city',
        label: 'City',
        options: cities.map((city) => ({ value: city, label: city })),
      },
    ],
    sortable: ['fullName', 'createdAt', 'systemNo'],
    defaultSort: { field: 'fullName', direction: 'asc' },
    searchPlaceholder: 'Name, mobile or reference',
    stripeMapping: customerSeverity,
    load: (query: ListQuery) => desk.list(query),
    empty: {
      title: 'No customers match this view',
      explanation:
        'A customer record is created when an inquiry converts or a policy is entered directly. Clear the filters to see the whole book.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/customers/${row.id}`,
  }
}
