import { dataTableColumns } from '../../../ui/data'
import { Badge } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import type { QueueConfig } from '../../../components/WorkQueue'
import { localPage } from '../shared'
import type { LocalListSpec } from '../shared'
import { AUDIT_KIND_LABELS } from './audit-trail'
import type { AuditEntry, AuditKind } from './audit-trail'
import { AuditEntryDetail } from './AuditEntryDetail'

export type AuditQueueInput = {
  readonly entries: readonly AuditEntry[]
  readonly retentionClasses: readonly string[]
}

const listSpec: LocalListSpec<AuditEntry> = {
  search: [
    (row) => row.action,
    (row) => row.subject,
    (row) => row.actor,
    (row) => row.recordNo,
    (row) => row.detail,
  ],
  filters: {
    kind: (row) => row.kind,
    actor: (row) => row.actor,
    retention: (row) => row.retentionClass,
  },
  sorts: {
    at: (row) => row.at,
    action: (row) => row.action,
    subject: (row) => row.subject,
    actor: (row) => row.actor,
  },
}

/**
 * The audit search — plan §4's third bullet for this screen.
 *
 * Every row points at a record the platform actually holds: a consent link's own
 * row, a document's review timestamps, a message that went. There is no separate
 * audit table in the MVP and this queue does not invent one, so an entry here is
 * always something that can be traced back.
 *
 * What the trail carries is metadata. A document contributes its type, its
 * review state and who verified it, never a word of what it says; a consent
 * record contributes its dates, never its token. That is not a filter applied
 * afterwards — `audit-trail.ts` never reads those fields at all.
 */
export function auditQueue(input: AuditQueueInput): QueueConfig<AuditEntry> {
  const column = dataTableColumns<AuditEntry>()
  const actors = [...new Set(input.entries.map((entry) => entry.actor))].toSorted()

  return {
    key: 'config-compliance-audit',
    title: 'Compliance',
    noun: 'entry',
    nounPlural: 'audit entries',
    getRowId: (row) => row.id,

    columns: column.columns([
      column.accessor((row) => row.at, {
        id: 'at',
        header: 'When',
        cell: (info) => <DateTime value={String(info.getValue())} mode="datetime" />,
      }),
      column.accessor((row) => AUDIT_KIND_LABELS[row.kind], {
        id: 'kind',
        header: 'Kind',
        enableSorting: false,
        cell: (info) => <Badge tone="neutral">{String(info.getValue())}</Badge>,
      }),
      column.accessor('action', { header: 'What happened' }),
      column.accessor('subject', { header: 'About' }),
      column.accessor('actor', { header: 'By' }),
      column.accessor((row) => row.recordNo ?? '', {
        id: 'record',
        header: 'Record',
        enableSorting: false,
      }),
      column.accessor((row) => row.retentionClass ?? '', {
        id: 'retention',
        header: 'Retention class',
        enableSorting: false,
        cell: (info) => {
          const label = String(info.getValue())
          return label === '' ? null : (
            <Badge tone="idle" caps>
              {label}
            </Badge>
          )
        },
      }),
    ]),

    filters: [
      {
        key: 'kind',
        label: 'Kind',
        options: Object.entries(AUDIT_KIND_LABELS).map(([value, label]) => ({
          value: value as AuditKind,
          label,
        })),
      },
      {
        key: 'actor',
        label: 'By',
        options: actors.map((actor) => ({ value: actor, label: actor })),
      },
      {
        key: 'retention',
        label: 'Retention class',
        options: input.retentionClasses.map((key) => ({ value: key, label: key })),
      },
    ],

    sortable: ['at', 'action', 'subject', 'actor'],
    defaultSort: { field: 'at', direction: 'desc' },
    searchPlaceholder: 'Search the audit trail',

    load: async (query) => localPage(input.entries, listSpec, query),

    empty: {
      title: 'Nothing in the trail yet',
      explanation:
        'The trail is built from what the platform can prove: consent links issued and used, documents submitted and reviewed, messages that went out. Once any of those happens it appears here, and nothing is ever removed from it.',
    },

    rowTarget: 'drawer',
    drawerTitle: (row) => row.action,
    drawerSubtitle: (row) => row.subject,
    renderDrawer: (row) => <AuditEntryDetail key={row.id} entry={row} />,
  }
}
