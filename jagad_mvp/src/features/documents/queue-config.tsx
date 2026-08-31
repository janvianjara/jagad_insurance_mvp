/**
 * The document vault, as configuration (plan §5 "Document vault", §14.1, §6).
 *
 * Not a table. `<WorkQueue>` was built once in P-08, so this file says what a
 * vault ROW is and nothing about how a list behaves.
 *
 * The rule that shapes every line below: **the list is metadata**. Not one
 * column reads a `document-content` field — no file name, no MIME type, no
 * extracted text, no OCR value — because a vault list is a search surface and a
 * search surface that carries content is a content leak with a filter box on it.
 * The columns are exactly the `operational` fields plus `uploadedByName`, which
 * is `contact`.
 *
 * A row opens in the shell's drawer rather than at an address of its own,
 * because §4 has no `/documents/:id` and because the open is an event: the
 * screen watches `?record=` and records the access as the drawer appears. That
 * is where "every open logged" is actually kept — see `DocumentVaultScreen`.
 */

import type { DocumentRecord, ListQuery, RetentionClass, StaffUser } from '../../data/repo'
import { DOCUMENT_REVIEW_STATES, DOCUMENT_TYPES } from '../../data/repo'
import type { QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime } from '../../ui/type'
import type { User } from '../../domain/permissions'
import { RETENTION_FILTER, subjectOf } from './data/vault'
import type { Vault, VaultSubjects } from './data/vault'
import {
  DOCUMENT_SUBJECT_ENTITIES,
  DOC_TYPE_LABEL,
  REVIEW_LABEL,
  REVIEW_TONE,
  documentSeverity,
} from './document-view'
import { DocumentDrawer } from './DocumentDrawer'
import styles from './Documents.module.css'

export type VaultQueueDeps = {
  readonly vault: Vault
  /** Whose vault this is. Every read is filtered through this user's scope. */
  readonly user: User
  readonly subjects: VaultSubjects
  readonly retentionClasses: readonly RetentionClass[]
  readonly users: readonly StaffUser[]
  /** Injected: a row and its drawer must never disagree about now. */
  readonly now: Date
}

const column = dataTableColumns<DocumentRecord>()

export function vaultQueueConfig(deps: VaultQueueDeps): QueueConfig<DocumentRecord> {
  const { vault, user, subjects, retentionClasses, users, now } = deps

  const actorName = (id: string) => users.find((person) => person.id === id)?.name ?? id

  const retentionLabel = (key: string) =>
    retentionClasses.find((entry) => entry.key === key)?.label ?? key

  const retentionYears = (key: string) =>
    retentionClasses.find((entry) => entry.key === key)?.years ?? null

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Reference',
      enableSorting: false,
      cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
    }),
    column.accessor('docType', {
      header: 'Type',
      cell: ({ row }) => <Badge caps>{DOC_TYPE_LABEL[row.original.docType]}</Badge>,
    }),
    column.accessor('subjectId', {
      header: 'About',
      enableSorting: false,
      cell: ({ row }) => {
        const subject = subjectOf(subjects, row.original)
        return (
          <span className={styles.subject}>
            <span className={styles.subjectName}>{subject?.label ?? 'Not resolved'}</span>
            <span className={styles.subjectKind}>{row.original.subjectEntity}</span>
          </span>
        )
      },
    }),
    column.accessor('version', {
      header: 'Version',
      enableSorting: false,
      cell: ({ row }) => <Badge caps>v{row.original.version}</Badge>,
    }),
    column.accessor('reviewState', {
      header: 'Review',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={REVIEW_TONE[row.original.reviewState]}>
          {REVIEW_LABEL[row.original.reviewState]}
        </StatusPill>
      ),
    }),
    column.accessor('isPresent', {
      header: 'On file',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isPresent ? (
          <Badge tone="ok" icon="check">
            On file
          </Badge>
        ) : (
          <Badge tone="attn">Not yet</Badge>
        ),
    }),
    column.accessor('retentionClass', {
      header: 'Retention',
      enableSorting: false,
      cell: ({ row }) => {
        const years = retentionYears(row.original.retentionClass)
        return (
          <span className={styles.retention}>
            <span>{retentionLabel(row.original.retentionClass)}</span>
            {years === null ? null : <span className={styles.retentionYears}>{years} years</span>}
          </span>
        )
      },
    }),
    // `uploadedByName` is `contact`, not `document-content`. It is the last
    // column on this side of the boundary; everything about the file itself
    // stays out of the list entirely.
    column.accessor('uploadedByName', {
      header: 'Uploaded by',
      enableSorting: false,
      cell: ({ row }) => row.original.uploadedByName ?? 'Nobody yet',
    }),
    column.accessor('submittedAt', {
      header: 'Submitted',
      cell: ({ row }) => <RelativeTime value={row.original.submittedAt} now={now} />,
    }),
  ])

  return {
    key: 'documents',
    title: 'Documents',
    noun: 'document',
    nounPlural: 'documents',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'docType',
        label: 'Type',
        options: Object.values(DOCUMENT_TYPES).map((value) => ({
          value,
          label: DOC_TYPE_LABEL[value],
        })),
      },
      {
        key: 'reviewState',
        label: 'Review',
        options: Object.values(DOCUMENT_REVIEW_STATES).map((value) => ({
          value,
          label: REVIEW_LABEL[value],
        })),
      },
      {
        key: 'subjectEntity',
        label: 'About',
        options: DOCUMENT_SUBJECT_ENTITIES.map((entity) => ({ value: entity, label: entity })),
      },
      {
        key: RETENTION_FILTER,
        label: 'Retention class',
        options: retentionClasses.map((entry) => ({
          value: entry.key,
          label: `${entry.label} — ${entry.years} years`,
        })),
      },
    ],
    sortable: ['submittedAt', 'docType'],
    defaultSort: { field: 'submittedAt', direction: 'desc' },
    searchPlaceholder: 'Reference or type',
    stripeMapping: documentSeverity,
    load: (query: ListQuery) => vault.list(user, subjects, query),
    empty: {
      title: 'No documents are in reach',
      explanation:
        'The vault holds every paper the agency has taken in — identity proofs, proposal forms, insurer policy documents, cheques and claim files — against the customer, policy, quotation or claim it belongs to. You see the ones your access reaches; opening any of them is recorded.',
    },
    rowTarget: 'drawer',
    drawerTitle: (row) => `${DOC_TYPE_LABEL[row.docType]} · ${row.systemNo}`,
    drawerSubtitle: (row) => subjectOf(subjects, row)?.label,
    renderDrawer: (row) => (
      <DocumentDrawer
        document={row}
        subject={subjectOf(subjects, row)}
        retentionLabel={retentionLabel(row.retentionClass)}
        retentionYears={retentionYears(row.retentionClass)}
        user={user}
        now={now}
        accesses={vault.accessLog(row.id)}
        actorName={actorName}
      />
    ),
  }
}
