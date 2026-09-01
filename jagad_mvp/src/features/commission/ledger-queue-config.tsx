/**
 * The commission ledger, as configuration - FR-14.3, plan §9.
 *
 * Not a table. `<WorkQueue>` was built once, so this file says what a commission
 * LINE is and nothing about how a list behaves: the filter bar, the URL
 * contract, the severity stripe, the pager and the drawer all come from the
 * shared component.
 *
 * Three decisions worth reading:
 *
 *   Two amount columns, never one. `Computed` is what the chain worked out from
 *   the percentages in configuration; `Booked` is what a person recorded off an
 *   insurer's statement. They are different kinds of fact and a single "Amount"
 *   column would have to pick one and quietly drop the other, which is exactly
 *   the silence an accountant opens a ledger to break.
 *
 *   The reconciliation column names the disagreement and does not measure it.
 *   Both figures are on the row; the state says whether they agree; the drawer
 *   says which way a difference goes. Nothing subtracts one from the other,
 *   because D3 allows two operations on money and this is neither - and because
 *   a variance is a conversation with the insurer, not a number a screen may
 *   assert on its own authority.
 *
 *   No bulk action. Every line here is a read of something already computed;
 *   there is nothing on this screen to do to forty rows at once, and a ticked-
 *   forty affordance over money with nothing behind it would be theatre. The
 *   outward act in this module is a payout, and it lives on `/commission/payouts`
 *   where it is gated.
 */

import type { QueueConfig } from '../../components/WorkQueue'
import { formatPercentBp } from '../../domain/workflows'
import type { ListQuery, Page } from '../../data/repo'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, Money, RecordId } from '../../ui/type'
import { LedgerLineDrawer } from './LedgerLineDrawer'
import type { CommissionChainRow } from './commission-view'
import {
  LEDGER_LEVELS,
  LEDGER_LEVEL_LABELS,
  LEDGER_ORIGINS,
  LEDGER_SORT_FIELDS,
  LEDGER_SOURCES,
  RECONCILIATIONS,
  RECONCILIATION_LABELS,
  RECONCILIATION_TONES,
  SOURCE_LABELS,
  pageOfLines,
  partiesIn,
  periodLabel,
  periodsIn,
} from './ledger-view'
import type { LedgerLine } from './ledger-view'
import styles from './Ledger.module.css'

export type LedgerQueueDeps = {
  /** Every line this viewer may read, derived once for the whole book. */
  readonly lines: readonly LedgerLine[]
  /** The chains behind them, so a drawer can show the whole waterfall for a line. */
  readonly chains: readonly CommissionChainRow[]
}

const column = dataTableColumns<LedgerLine>()

export function ledgerQueueConfig(deps: LedgerQueueDeps): QueueConfig<LedgerLine> {
  const { lines, chains } = deps
  const chainFor = (policyId: string) => chains.find((row) => row.policyId === policyId) ?? null

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Policy',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.systemNo === '' ? (
          <span className={styles.absent}>not in this book</span>
        ) : (
          <RecordId systemNo={row.original.systemNo} insurerNo={row.original.insurerNo} />
        ),
    }),
    column.accessor('partyName', {
      header: 'Paid to',
      cell: ({ row }) => (
        <span className={styles.party}>
          <span className={styles.partyName}>{row.original.partyName}</span>
          <span className={styles.partyCustomer}>{row.original.customerName}</span>
        </span>
      ),
    }),
    column.accessor('level', {
      header: 'Level',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge caps tone={row.original.level === LEDGER_LEVELS.agency ? 'info' : 'neutral'}>
          {LEDGER_LEVEL_LABELS[row.original.level]}
        </Badge>
      ),
    }),
    column.accessor('trigger', {
      header: 'Source',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.trigger === null ? (
          <span className={styles.absent}>unknown</span>
        ) : (
          SOURCE_LABELS[row.original.trigger]
        ),
    }),
    column.accessor('percentBp', {
      header: 'Rate',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.numeric}>
          {row.original.percentBp === null ? (
            <span className={styles.absent}>no rate</span>
          ) : (
            formatPercentBp(row.original.percentBp)
          )}
        </span>
      ),
    }),
    column.accessor('computed', {
      header: 'Computed',
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money
            paise={row.original.computed?.paise ?? null}
            symbol={false}
            absentText="no computation"
          />
        </span>
      ),
    }),
    column.accessor('booked', {
      header: 'Booked',
      enableSorting: false,
      /*
       * Stays even when every row reads the same.
       *
       * Computed and Booked are shown side by side precisely because the build
       * has no commission write API, so Booked is absent on most rows — and a
       * money column that vanishes when it is empty is a money column that hides
       * the gap it exists to name.
       */
      meta: { alwaysShow: true },
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money
            paise={row.original.booked?.paise ?? null}
            symbol={false}
            absentText={
              row.original.level === LEDGER_LEVELS.agency ? 'not booked' : 'not applicable'
            }
          />
        </span>
      ),
    }),
    column.accessor('reconciliation', {
      header: 'Reconciliation',
      enableSorting: false,
      meta: { alwaysShow: true },
      cell: ({ row }) => (
        <StatusPill tone={RECONCILIATION_TONES[row.original.reconciliation]}>
          {RECONCILIATION_LABELS[row.original.reconciliation]}
        </StatusPill>
      ),
    }),
    column.accessor('bookedAt', {
      header: 'Dated',
      cell: ({ row }) => <DateTime value={row.original.bookedAt} mode="date" />,
    }),
  ])

  return {
    key: 'commission-ledger',
    title: 'Commission ledger',
    noun: 'line',
    nounPlural: 'lines',
    getRowId: (row) => row.id,
    columns,

    // Party, period, source and reconciliation state - the four ways an
    // accountant narrows a book. The options are read off the lines rather than
    // written down here, so a filter can never offer a value the book has none
    // of, and can never miss one it does.
    filters: [
      {
        key: 'party',
        label: 'Paid to',
        options: partiesIn(lines).map((name) => ({ value: name, label: name })),
      },
      {
        key: 'period',
        label: 'Period',
        options: periodsIn(lines).map((period) => ({ value: period, label: periodLabel(period) })),
      },
      {
        key: 'source',
        label: 'Source',
        options: LEDGER_SOURCES.map((trigger) => ({
          value: trigger,
          label: SOURCE_LABELS[trigger],
        })),
      },
      {
        key: 'status',
        label: 'Reconciliation',
        options: [
          RECONCILIATIONS.agrees,
          RECONCILIATIONS.differs,
          RECONCILIATIONS.notBooked,
          RECONCILIATIONS.noComputation,
          RECONCILIATIONS.notApplicable,
        ].map((state) => ({ value: state, label: RECONCILIATION_LABELS[state] })),
      },
    ],

    sortable: [...LEDGER_SORT_FIELDS],
    // Newest first: a commission book is read from the last statement backwards.
    defaultSort: { field: 'bookedAt', direction: 'desc' },
    searchPlaceholder: 'Policy number, customer or party',

    // A line nobody can account for is the row to look at first, and a line
    // waiting on a statement is the row to look at second.
    stripeMapping: (row) => {
      if (
        row.reconciliation === RECONCILIATIONS.differs ||
        row.reconciliation === RECONCILIATIONS.noComputation
      ) {
        return 'hot'
      }
      if (row.reconciliation === RECONCILIATIONS.notBooked) return 'warm'
      if (row.reconciliation === RECONCILIATIONS.agrees) return 'good'
      return undefined
    },

    load: (query: ListQuery): Promise<Page<LedgerLine>> =>
      Promise.resolve(pageOfLines(lines, query)),

    // A commission line has no address of its own in §4's route map and should
    // not: it is a fact about a policy, so its detail opens beside the list.
    rowTarget: 'drawer',
    drawerTitle: (row) =>
      row.origin === LEDGER_ORIGINS.booked ? 'Booked, unaccounted' : row.partyName,
    drawerSubtitle: (row) => (row.systemNo === '' ? row.policyId : row.systemNo),
    renderDrawer: (row) => <LedgerLineDrawer line={row} chain={chainFor(row.policyId)} />,

    empty: {
      title: 'No commission line is in this book yet',
      explanation:
        'A line appears here when a policy is issued on an agency that has an active appointment with a percentage set against the company and the product. Lines are recomputed from that configuration on every read - nothing in this build books one.',
    },
  }
}
