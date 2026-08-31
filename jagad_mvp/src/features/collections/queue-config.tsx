/**
 * The collection verification queue, as configuration — FR-08.3, plan §9, P1.
 *
 * Not a table. `<WorkQueue>` was built once, so this file says what a collection
 * row is and nothing about how a list behaves.
 *
 * Three decisions worth reading:
 *
 *   The queue is `recorded` and only `recorded`, always. §9 forks a collection on
 *   its route: money paid straight to the company is a reference and never
 *   touches the agency books, so there is nothing to verify; a bounced cheque is
 *   a follow-up task rather than a verification. `recorded` is precisely the
 *   waiting set. The state set is not written here at all: `awaitingVerification`
 *   on the desk pins it from `COLLECTION_VERIFICATION_STATES`, the same constant
 *   the ops board counts with, so a tile and this list cannot disagree.
 *
 *   The amount is rendered and never entered. This screen is the hardest place in
 *   the product to keep D3 honest, because it is a screen about money with a
 *   button on it — so the column is a read of `row.amount` and there is no
 *   control anywhere on the queue or in its drawer that accepts a figure.
 *
 *   Verification is per row, so there are no bulk actions. A ticked-forty-and-
 *   confirm affordance over this queue would let one click wave through a bounce,
 *   and the whole point of §9's rule is that a second person looked.
 */

import type {
  CollectionRecord,
  Customer,
  ListQuery,
  Page,
  Policy,
  StaffUser,
} from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import type { User } from '../../domain/permissions'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { Money, RecordId, RelativeTime } from '../../ui/type'
import {
  COLLECTION_LABEL,
  COLLECTION_TONE,
  INSTRUMENT_LABEL,
  MODE_LABEL,
  ROUTE_LABEL,
  blocksClosure,
  collectionSeverity,
} from './collection-view'
import { CollectionDrawer } from './CollectionDrawer'
import type { CollectionDesk } from './data/collection-desk'
import styles from './Collections.module.css'

export type CollectionQueueDeps = {
  readonly desk: CollectionDesk
  readonly customers: readonly Customer[]
  /** A collection is a fact about a policy; the row is read by the policy's number. */
  readonly policies: readonly Policy[]
  readonly users: readonly StaffUser[]
  /** Who is signed in, resolved. §9 refuses a verifier who collected the money. */
  readonly actor: User
  /** Injected: a row and the drawer it opens must never disagree about now. */
  readonly now: Date
}

const column = dataTableColumns<CollectionRecord>()

export function collectionQueueConfig(deps: CollectionQueueDeps): QueueConfig<CollectionRecord> {
  const { desk, customers, policies, users, actor, now } = deps

  const customerName = (id: string) =>
    customers.find((customer) => customer.id === id)?.fullName ?? id
  const staffName = (id: string | null) =>
    id === null ? 'Unrecorded' : (users.find((user) => user.id === id)?.name ?? id)
  const policyOf = (id: string) => policies.find((policy) => policy.id === id) ?? null

  const columns = column.columns([
    // A collection carries no number of its own — it is a fact about a policy, and
    // the policy's dual numbering is what an ops user recognises. §8.
    column.accessor('policyId', {
      header: 'Policy',
      enableSorting: false,
      cell: ({ row }) => {
        const policy = policyOf(row.original.policyId)
        return policy === null ? (
          row.original.policyId
        ) : (
          <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
        )
      },
    }),
    column.accessor('customerId', {
      header: 'Customer',
      enableSorting: false,
      cell: ({ row }) => customerName(row.original.customerId),
    }),
    column.accessor('amount', {
      header: 'Amount',
      enableSorting: false,
      // Read-only, and the absent text says "not recorded" rather than showing a
      // zero: an amount nobody typed is not an amount of nothing.
      cell: ({ row }) => <Money paise={row.original.amount?.paise ?? null} />,
    }),
    column.accessor('instrument', {
      header: 'Instrument',
      enableSorting: false,
      cell: ({ row }) => INSTRUMENT_LABEL[row.original.instrument],
    }),
    column.accessor('mode', {
      header: 'Taken',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.modeCell}>
          {MODE_LABEL[row.original.mode]}
          {blocksClosure(row.original) ? (
            <span className={styles.blocking}>blocks closure</span>
          ) : null}
        </span>
      ),
    }),
    column.accessor('reference', {
      header: 'Reference',
      enableSorting: false,
      cell: ({ row }) => row.original.reference ?? '—',
    }),
    column.accessor('collectedBy', {
      header: 'Collected by',
      enableSorting: false,
      cell: ({ row }) => staffName(row.original.collectedBy),
    }),
    column.accessor('collectedAt', {
      header: 'Collected',
      cell: ({ row }) =>
        row.original.collectedAt === null ? (
          '—'
        ) : (
          <RelativeTime value={row.original.collectedAt} now={now} />
        ),
    }),
    column.accessor('state', {
      header: 'State',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={COLLECTION_TONE[row.original.state]}>
          {COLLECTION_LABEL[row.original.state]}
        </StatusPill>
      ),
    }),
  ])

  return {
    key: 'collection-verification',
    title: 'Collections to verify',
    noun: 'collection',
    nounPlural: 'collections',
    getRowId: (row) => row.id,
    columns,

    // Every key here is one `COLLECTION_LIST_SPEC` already declares. `state` is
    // deliberately absent: it is what makes this queue this queue, not something
    // a person narrows within.
    filters: [
      {
        key: 'instrument',
        label: 'Instrument',
        options: Object.entries(INSTRUMENT_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'mode',
        label: 'Taken',
        options: Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'route',
        label: 'Route',
        options: Object.entries(ROUTE_LABEL).map(([value, label]) => ({ value, label })),
      },
    ],

    sortable: ['collectedAt'],
    // Oldest first. This is a chase list, and the money at the top has been in
    // somebody's pocket the longest.
    defaultSort: { field: 'collectedAt', direction: 'asc' },
    searchPlaceholder: 'Transaction reference',
    stripeMapping: (row) => collectionSeverity(row, now),

    load: (query: ListQuery): Promise<Page<CollectionRecord>> =>
      desk.awaitingVerification(query),

    // Verification happens beside the record, in the drawer. There is no
    // `/back-office/collections/:id` in §4's route map and there should not be:
    // a collection is a fact about a policy, not a screen of its own.
    rowTarget: 'drawer',
    drawerTitle: (row) => policyOf(row.policyId)?.systemNo ?? row.policyId,
    drawerSubtitle: (row) => customerName(row.customerId),
    renderDrawer: (row, queue) => (
      <CollectionDrawer
        collection={row}
        desk={desk}
        actor={actor}
        now={now}
        customerName={customerName(row.customerId)}
        collectedByName={staffName(row.collectedBy)}
        queue={queue}
      />
    ),

    empty: {
      title: 'Nothing is waiting to be verified',
      explanation:
        'A collection lands here when somebody records money taken through the agency. Verifying one takes it off this queue on its own.',
    },
  }
}
