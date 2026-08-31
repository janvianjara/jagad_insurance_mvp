/**
 * The notice-batch queue, as configuration — plan §5 ("Notice bulk ingest"), §6.
 *
 * A batch's trouble is not its state: a batch in review with two unmatched rows
 * needs a person, and a batch that has gone out does not. The stripe says so;
 * the state pill says which state it is in.
 */

import type { QueueConfig } from '../../components/WorkQueue'
import type { Company, ListQuery, NoticeBatch, Page } from '../../data/repo'
import { NOTICE_BATCH_STATES } from '../../domain/workflows'
import { dataTableColumns } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { DateTime, RecordId } from '../../ui/type'
import { BATCH_LABEL, BATCH_TONE, batchSeverity } from './notice-view'
import styles from './Notices.module.css'

export type NoticeQueueDeps = {
  readonly load: (query: ListQuery) => Promise<Page<NoticeBatch>>
  readonly companies: readonly Company[]
}

export function noticesQueue(deps: NoticeQueueDeps): QueueConfig<NoticeBatch> {
  const column = dataTableColumns<NoticeBatch>()
  const companyName = (id: string) =>
    deps.companies.find((company) => company.id === id)?.shortName ?? 'Company not on file'

  return {
    key: 'notice-batches',
    title: 'Renewal notices',
    noun: 'notice batch',
    nounPlural: 'notice batches',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor('systemNo', {
        header: 'Batch',
        cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
      }),
      column.accessor((row) => companyName(row.companyId), {
        id: 'company',
        header: 'Insurer',
        enableSorting: false,
      }),
      column.accessor('fileName', {
        header: 'File',
        enableSorting: false,
        cell: ({ row }) => <span className={styles.printed}>{row.original.fileName}</span>,
      }),
      column.accessor('expiryMonth', {
        header: 'Expiry month',
        enableSorting: false,
        cell: ({ row }) => <span className={styles.printed}>{row.original.expiryMonth}</span>,
      }),
      column.accessor('rowCount', { header: 'Rows' }),
      column.accessor('state', {
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={BATCH_TONE[row.original.state]}>
            {BATCH_LABEL[row.original.state]}
          </StatusPill>
        ),
      }),
      column.accessor('uploadedAt', {
        header: 'Uploaded',
        cell: ({ row }) => <DateTime value={row.original.uploadedAt} mode="date" />,
      }),
      column.accessor('sentAt', {
        header: 'Sent',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.sentAt ? (
            <DateTime value={row.original.sentAt} mode="date" />
          ) : (
            <span className={styles.absent}>not sent</span>
          ),
      }),
    ]),

    filters: [
      {
        key: 'state',
        label: 'Status',
        options: Object.values(NOTICE_BATCH_STATES).map((state) => ({
          value: state,
          label: BATCH_LABEL[state],
        })),
      },
      {
        key: 'companyId',
        label: 'Insurer',
        options: deps.companies.map((company) => ({
          value: company.id,
          label: company.shortName,
        })),
      },
    ],

    sortable: ['uploadedAt', 'rowCount', 'systemNo'],
    defaultSort: { field: 'uploadedAt', direction: 'desc' },
    searchPlaceholder: 'Batch number or file name',
    stripeMapping: batchSeverity,

    load: deps.load,

    empty: {
      title: 'No notice batches yet',
      explanation:
        'An insurer sends one PDF holding several hundred renewal notices. Upload it here and extraction runs against that insurer’s own template; the rows are then matched against the policies this agency actually holds.',
    },

    rowTarget: 'route',
    rowHref: (row) => `/renewals/notices/${row.id}`,
  }
}
