/**
 * The rows of one notice batch, as a configured queue — plan §5 ("match/review
 * → unmatched blocked from send → send-all"), §9, canvas n34–n36.
 *
 * The bulk send is where §9's hard block lives. `preview` returns an empty list
 * the moment the selection holds a row that cannot go out, and `<ConfirmGate>`
 * refuses to confirm an empty preview — so the Confirm control is dead and the
 * note under it says which rows and why. `run` is unreachable from there, and
 * the repository refuses the same send independently if it is ever reached
 * another way. A warning somebody clicks past at five in the evening is exactly
 * what §9 is refusing, and neither of those two is one.
 */

import type { ReactNode } from 'react'
import type { QueueActionOutcome, QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import type { ListQuery, NoticeBatch, NoticeMatch, Page, Policy } from '../../data/repo'
import { NOTICE_ROW_STATES } from '../../domain/workflows'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, Money } from '../../ui/type'
import {
  ROW_LABEL,
  ROW_TONE,
  rowsBlockingSend,
  sendBlockNote,
  unconfirmedFields,
} from './notice-view'
import styles from './Notices.module.css'

export type NoticeRowsQueueDeps = {
  readonly batch: NoticeBatch
  readonly title: string
  readonly policies: readonly Policy[]
  readonly load: (query: ListQuery) => Promise<Page<NoticeMatch>>
  readonly send: (rowIds: readonly string[]) => Promise<QueueActionOutcome>
  /** False hides the send entirely rather than offering a control that refuses. */
  readonly canSend: boolean
  readonly renderDrawer: (row: NoticeMatch) => ReactNode
}

export function noticeRowsQueue(deps: NoticeRowsQueueDeps): QueueConfig<NoticeMatch> {
  const column = dataTableColumns<NoticeMatch>()

  const policyOf = (row: NoticeMatch) =>
    row.matchedPolicyId === null
      ? null
      : (deps.policies.find((policy) => policy.id === row.matchedPolicyId) ?? null)

  const send: QueueBulkAction<NoticeMatch> = {
    key: 'send',
    label: 'Send renewal notices',
    icon: 'msg',
    variant: 'primary',
    confirmLabel: 'Send the notices',
    confirmTitle: (selection) =>
      `Send ${selection.ids.length} renewal ${selection.ids.length === 1 ? 'notice' : 'notices'}`,
    preview: (selection) => {
      // §9's hard block. Nothing to preview means nothing to confirm, and the
      // gate's own rule takes it from there.
      if (rowsBlockingSend(selection.rows).length > 0) return []
      return selection.rows.map((row) => ({
        key: row.id,
        label: row.noticePolicyNo,
        to: `${row.noticeCustomerName} — renewal notice and request`,
      }))
    },
    note: (selection) => {
      const blockers = rowsBlockingSend(selection.rows)
      if (blockers.length > 0) return sendBlockNote(blockers)
      return 'Each matched customer gets their own PDF and a renewal request. The amounts on it are the ones printed on the insurer’s notice, year by year — nothing here works a premium out.'
    },
    run: (selection) => deps.send(selection.ids),
  }

  return {
    key: `notice-rows-${deps.batch.id}`,
    title: deps.title,
    noun: 'notice row',
    nounPlural: 'notice rows',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('rowNumber', { header: 'Row' }),
      column.accessor('noticePolicyNo', {
        header: 'Policy number, as printed',
        enableSorting: false,
        cell: ({ row }) => <span className={styles.printed}>{row.original.noticePolicyNo}</span>,
      }),
      column.accessor('noticeCustomerName', {
        header: 'Insured name, as printed',
        enableSorting: false,
      }),
      column.accessor('noticeExpiryDate', {
        header: 'Expiry',
        cell: ({ row }) =>
          row.original.noticeExpiryDate ? (
            <DateTime value={row.original.noticeExpiryDate} mode="date" />
          ) : (
            <span className={styles.absent}>not read</span>
          ),
      }),
      column.accessor((row) => row.noticePremium?.paise ?? null, {
        id: 'noticePremium',
        header: 'Premium, as printed',
        enableSorting: false,
        cell: ({ row }) => (
          <Money
            paise={row.original.noticePremium?.paise ?? null}
            absentText="not read"
          />
        ),
      }),
      column.accessor((row) => policyOf(row)?.systemNo ?? '', {
        id: 'policy',
        header: 'Policy we hold',
        enableSorting: false,
        cell: ({ row }) => {
          const policy = policyOf(row.original)
          return policy ? (
            <span className={styles.printed}>{policy.systemNo}</span>
          ) : (
            <span className={styles.absent}>nothing matched</span>
          )
        },
      }),
      column.accessor('state', {
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={ROW_TONE[row.original.state]}>
            {ROW_LABEL[row.original.state]}
          </StatusPill>
        ),
      }),
      column.accessor((row) => unconfirmedFields(row).length, {
        id: 'extraction',
        header: 'Extraction',
        enableSorting: false,
        cell: ({ row }) => {
          const waiting = unconfirmedFields(row.original).length
          return waiting === 0 ? (
            <Badge tone="ok">Confirmed</Badge>
          ) : (
            <Badge tone="attn">{waiting} need a person</Badge>
          )
        },
      }),
    ]),

    filters: [
      {
        key: 'state',
        label: 'Row status',
        options: Object.values(NOTICE_ROW_STATES).map((state) => ({
          value: state,
          label: ROW_LABEL[state],
        })),
      },
    ],

    sortable: ['rowNumber', 'noticeExpiryDate'],
    defaultSort: { field: 'rowNumber', direction: 'asc' },
    searchPlaceholder: 'Printed policy number or insured name',
    stripeMapping: (row) => {
      if (row.state === 'unmatched') return 'attn'
      if (row.state === 'rejected') return 'cool'
      return unconfirmedFields(row).length > 0 ? 'attn' : 'good'
    },

    ...(deps.canSend && deps.batch.state === 'review' ? { bulkActions: [send] } : {}),

    load: deps.load,

    empty: {
      title: 'This batch holds no rows',
      explanation:
        'Extraction has not produced any rows for this batch yet. Once it finishes, every notice on the insurer’s PDF appears here as a row to match against the policies this agency holds.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => `Row ${row.rowNumber} · ${row.noticePolicyNo}`,
    drawerSubtitle: (row) => row.noticeCustomerName,
    renderDrawer: deps.renderDrawer,
  }
}
