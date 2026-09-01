/**
 * The payout cycle, as configuration - FR-14.4 and FR-14.7, plan §9.
 *
 * A row is one payee in one month, which is the shape money leaves an agency in.
 * The columns answer the four questions of a cycle in order: who, for when, how
 * much is due, and has any of it gone out.
 *
 * The bulk release is the module's one outward act, so it is a
 * `QueueBulkAction` - which means `<BulkActionGate>` wraps it in `<ConfirmGate>`
 * and there is no path from the selection bar to `run` that skips the preview.
 * Its `run` reports an honest refusal rather than a receipt, because this build
 * has no writer for the commission ledger; the same sentence is on the screen
 * above the table, in the gate's note and in the gate's preview, so nobody
 * reaches Confirm without having been told twice.
 */

import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import type { ListQuery, Page } from '../../data/repo'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { Money } from '../../ui/type'
import { PayoutDrawer } from './PayoutDrawer'
import { periodLabel } from './ledger-view'
import type { LedgerLine } from './ledger-view'
import {
  PAYEE_KINDS,
  PAYEE_KIND_LABELS,
  PAYOUT_SORT_FIELDS,
  PAYOUT_STATES,
  PAYOUT_STATE_LABELS,
  PAYOUT_STATE_TONES,
  RELEASE_WRITES_NOTHING,
  pageOfPayouts,
  payoutPeriods,
} from './payout-view'
import type { PayoutRow } from './payout-view'
import styles from './Ledger.module.css'

export type PayoutQueueDeps = {
  readonly rows: readonly PayoutRow[]
  /** Every line in the book, so a drawer can show what a figure was rolled up from. */
  readonly lines: readonly LedgerLine[]
  /**
   * `can(user, 'approve', 'commission')`. False hides the bulk release entirely
   * rather than offering a control the account may not use: a queue that shows
   * an act it will refuse teaches people to click through refusals.
   */
  readonly mayRelease: boolean
}

const column = dataTableColumns<PayoutRow>()

/**
 * The bulk release. Every field of it is honest about the same thing, and the
 * preview carries the constraint as a row of its own so it cannot be missed.
 */
function releaseAction(): QueueBulkAction<PayoutRow> {
  return {
    key: 'release',
    label: 'Release payouts',
    icon: 'coin',
    variant: 'primary',
    confirmTitle: (selection) =>
      `Release ${selection.ids.length} ${selection.ids.length === 1 ? 'payout' : 'payouts'}`,
    preview: (selection) => [
      ...selection.rows.map((row) => ({
        key: row.id,
        label: `${row.partyName} - ${row.periodLabel}`,
        from: PAYOUT_STATE_LABELS[row.state],
        to: <Money paise={row.due.paise} />,
      })),
      {
        key: 'ledger',
        label: 'Commission ledger',
        from: 'no payout entry',
        to: 'no payout entry - this build cannot write one',
      },
    ],
    note: () => RELEASE_WRITES_NOTHING,
    confirmLabel: 'Release',
    run: () =>
      // No writer exists, so this reports what actually happened rather than
      // inventing a receipt. The toast that follows carries the same sentence.
      Promise.resolve({ ok: false, message: RELEASE_WRITES_NOTHING }),
  }
}

export function payoutQueueConfig(deps: PayoutQueueDeps): QueueConfig<PayoutRow> {
  const { rows, lines, mayRelease } = deps

  const linesFor = (row: PayoutRow) =>
    lines.filter((line) => line.period === row.period && line.partyId === row.partyId)

  const columns = column.columns([
    column.accessor('partyName', {
      header: 'Payee',
      cell: ({ row }) => (
        <span className={styles.party}>
          <span className={styles.partyName}>{row.original.partyName}</span>
          <span className={styles.partyCustomer}>
            {row.original.lineCount} {row.original.lineCount === 1 ? 'line' : 'lines'}
          </span>
        </span>
      ),
    }),
    column.accessor('partyKind', {
      header: 'Kind',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge caps tone={row.original.partyKind === PAYEE_KINDS.agent ? 'info' : 'neutral'}>
          {PAYEE_KIND_LABELS[row.original.partyKind]}
        </Badge>
      ),
    }),
    column.accessor('period', {
      header: 'Period',
      cell: ({ row }) => <span className={styles.numeric}>{row.original.periodLabel}</span>,
    }),
    column.accessor('due', {
      header: 'Due',
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money paise={row.original.due.paise} symbol={false} />
        </span>
      ),
    }),
    column.accessor('recordedPaid', {
      header: 'Paid',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money
            paise={row.original.recordedPaid?.paise ?? null}
            symbol={false}
            absentText="nothing recorded"
          />
        </span>
      ),
    }),
    column.accessor('outstanding', {
      header: 'Outstanding',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money
            paise={row.original.outstanding?.paise ?? null}
            symbol={false}
            absentText="cannot be stated"
            emphasis="strong"
          />
        </span>
      ),
    }),
    // FR-14.7's GST column. It stands, and it is honest: nothing in the model
    // carries a GST figure against a commission line, so every cell says so.
    column.accessor('gst', {
      header: 'GST',
      enableSorting: false,
      // Never folded away for being constant: constant IS the disclosure here.
      meta: { alwaysShow: true },
      cell: ({ row }) => (
        <span className={styles.numeric}>
          <Money paise={row.original.gst?.paise ?? null} symbol={false} absentText="not recorded" />
        </span>
      ),
    }),
    column.accessor('state', {
      header: 'State',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={PAYOUT_STATE_TONES[row.original.state]}>
          {PAYOUT_STATE_LABELS[row.original.state]}
        </StatusPill>
      ),
    }),
  ])

  return {
    key: 'commission-payouts',
    title: 'Payouts',
    noun: 'payout',
    nounPlural: 'payouts',
    getRowId: (row) => row.id,
    columns,

    filters: [
      {
        key: 'period',
        label: 'Period',
        options: payoutPeriods(rows).map((period) => ({
          value: period,
          label: periodLabel(period),
        })),
      },
      {
        key: 'payee',
        label: 'Payee',
        options: [PAYEE_KINDS.agent, PAYEE_KINDS.subAgent].map((kind) => ({
          value: kind,
          label: PAYEE_KIND_LABELS[kind],
        })),
      },
      {
        key: 'state',
        label: 'State',
        options: [PAYOUT_STATES.unpaid, PAYOUT_STATES.recorded].map((state) => ({
          value: state,
          label: PAYOUT_STATE_LABELS[state],
        })),
      },
    ],

    sortable: [...PAYOUT_SORT_FIELDS],
    // The most recent cycle first: a payout run is worked newest backwards.
    defaultSort: { field: 'period', direction: 'desc' },
    searchPlaceholder: 'Payee name',
    stripeMapping: (row) => (row.state === PAYOUT_STATES.unpaid ? 'warm' : 'good'),

    ...(mayRelease ? { bulkActions: [releaseAction()] } : {}),

    load: (query: ListQuery): Promise<Page<PayoutRow>> =>
      Promise.resolve(pageOfPayouts(rows, query)),

    rowTarget: 'drawer',
    drawerTitle: (row) => row.partyName,
    drawerSubtitle: (row) => row.periodLabel,
    renderDrawer: (row) => (
      <PayoutDrawer row={row} lines={linesFor(row)} mayRelease={mayRelease} />
    ),

    empty: {
      title: 'Nobody is owed a payout in this book',
      explanation:
        'A payout row appears when a policy in this book carries an agent or sub-agent share. The agency keeps the rest of the pay-in, which is not a payout and never appears here.',
    },
  }
}
