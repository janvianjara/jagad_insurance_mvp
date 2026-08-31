/**
 * The endorsement queue, as configuration — plan §5 ("Endorsement"), §6.
 *
 * One column is worth reading. The amount column asks `figureOf` what this row
 * carries, and for a non-financial endorsement the answer is nothing — so the
 * cell prints a dash and the word "no premium" rather than an empty money slot.
 * §9's rule holds in the list as well as on the form: a correction has no money
 * on it anywhere.
 */

import type { QueueConfig } from '../../components/WorkQueue'
import type { Customer, Endorsement, ListQuery, Page, Policy } from '../../data/repo'
import { ENDORSEMENT_STATES, ENDORSEMENT_TYPES } from '../../domain/workflows'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, Money, RecordId } from '../../ui/type'
import {
  ENDORSEMENT_LABEL,
  ENDORSEMENT_TONE,
  ENDORSEMENT_TYPE_LABEL,
  endorsementSeverity,
  figureOf,
} from './endorsement-view'
import styles from './Endorsements.module.css'

export type EndorsementQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<Endorsement>>
  readonly policies: readonly Policy[]
  readonly customers: readonly Customer[]
}

export function endorsementsQueue(deps: EndorsementQueueDeps): QueueConfig<Endorsement> {
  const column = dataTableColumns<Endorsement>()
  const policyOf = (row: Endorsement) => deps.policies.find((policy) => policy.id === row.policyId)
  const customerOf = (row: Endorsement) =>
    deps.customers.find((customer) => customer.id === row.customerId)

  return {
    key: 'endorsements',
    title: 'Endorsements',
    noun: 'endorsement',
    nounPlural: 'endorsements',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('systemNo', {
        header: 'Reference',
        cell: ({ row }) => (
          <RecordId
            systemNo={row.original.systemNo}
            insurerNo={row.original.insurerEndorsementNo}
            awaitedText="insurer endorsement no. awaited"
          />
        ),
      }),
      column.accessor('type', {
        header: 'Type',
        enableSorting: false,
        cell: ({ row }) => <Badge caps>{ENDORSEMENT_TYPE_LABEL[row.original.type]}</Badge>,
      }),
      column.accessor((row) => customerOf(row)?.fullName ?? 'Customer not on file', {
        id: 'customer',
        header: 'Customer',
        enableSorting: false,
      }),
      column.accessor((row) => policyOf(row)?.systemNo ?? row.policyId, {
        id: 'policy',
        header: 'Policy',
        enableSorting: false,
        cell: ({ row }) => {
          const policy = policyOf(row.original)
          return policy ? (
            <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
          ) : (
            <span className={styles.absent}>policy not on file</span>
          )
        },
      }),
      column.accessor('state', {
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={ENDORSEMENT_TONE[row.original.state]}>
            {ENDORSEMENT_LABEL[row.original.state]}
          </StatusPill>
        ),
      }),
      /**
       * The money column. `figureOf` returns nothing for a correction, and the
       * cell says so in words — an empty money cell would read as an amount
       * nobody has typed yet, which is a different fact entirely.
       */
      column.accessor((row) => figureOf(row)?.figure.amount?.paise ?? null, {
        id: 'amount',
        header: 'Amount',
        enableSorting: false,
        cell: ({ row }) => {
          const reading = figureOf(row.original)
          if (reading === null) return <span className={styles.absent}>no premium</span>
          return (
            <span className={styles.amountCell}>
              <Money paise={reading.figure.amount?.paise ?? null} absentText="not yet typed" />
              <span className={styles.amountLabel}>{reading.label}</span>
            </span>
          )
        },
      }),
      column.accessor('effectiveFrom', {
        header: 'Effective from',
        cell: ({ row }) =>
          row.original.effectiveFrom ? (
            <DateTime value={row.original.effectiveFrom} mode="date" />
          ) : (
            <span className={styles.absent}>not set</span>
          ),
      }),
      column.accessor('requestedAt', {
        header: 'Raised',
        cell: ({ row }) => <DateTime value={row.original.requestedAt} mode="date" />,
      }),
    ]),

    filters: [
      {
        key: 'state',
        label: 'Status',
        options: Object.values(ENDORSEMENT_STATES).map((state) => ({
          value: state,
          label: ENDORSEMENT_LABEL[state],
        })),
      },
      {
        key: 'type',
        label: 'Type',
        options: Object.values(ENDORSEMENT_TYPES).map((type) => ({
          value: type,
          label: ENDORSEMENT_TYPE_LABEL[type],
        })),
      },
    ],

    sortable: ['requestedAt', 'systemNo', 'effectiveFrom'],
    defaultSort: { field: 'requestedAt', direction: 'desc' },
    searchPlaceholder: 'Our reference or the insurer’s',
    stripeMapping: endorsementSeverity,

    load: deps.load,

    empty: {
      title: 'No endorsements are open',
      explanation:
        'An endorsement is a mid-term change to a policy already in force — a corrected nominee, a member added, a cover cancelled. Raise one from a policy, and the form will reshape to the kind of change it is.',
    },

    rowTarget: 'route',
    rowHref: (row) => `/endorsements/${row.id}`,
  }
}
