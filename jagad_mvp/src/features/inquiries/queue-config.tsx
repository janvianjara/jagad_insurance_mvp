/**
 * The inquiry queue, as configuration (plan §5 row 1, §6).
 *
 * Not a table. `<WorkQueue>` was built once in P-08 and every list screen after
 * it is an object of this shape, which is why the filter bar, the stripe, the
 * selection bar and the keyboard model are identical here and in the fourteen
 * queues still to come.
 *
 * Two decisions in this file are worth reading:
 *
 *   Pinning is a rank, not a second query. §5 asks for "unassigned and
 *   TAT-at-risk pinned"; doing that as a separate fetch would give the screen two
 *   sets of rows that the URL no longer describes. Instead the rows the URL asked
 *   for are ordered by how much trouble they are in, and the page is cut after
 *   that — so the view is still exactly what the address bar says it is.
 *
 *   Bulk assign is routing, not a field write. Each selected row is put through
 *   `planRouting`, and the ones routing cannot resolve go to `unrouted` with the
 *   admin alert instead of quietly staying put. The preview inside `<ConfirmGate>`
 *   shows each destination before anything is written, and Cancel writes nothing.
 */

import { DEFAULT_PAGE_SIZE } from '../../data/repo'
import type { Inquiry, InquiryCategory, ListQuery, StaffUser } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { Badge, Clock, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime } from '../../ui/type'
import type { IntakeRepository } from './data/intake'
import { INQUIRY_LABEL, INQUIRY_TONE, SOURCE_LABEL, inquirySeverity, isPinned, pinRank, readTat } from './inquiry-view'

import { nameOf, planRouting, tatMinutesFor } from './routing'
import styles from './InquiryQueue.module.css'

const MINUTE_MS = 60_000
/** The pin pass needs every matching row, not one page of them. */
const SCAN_SIZE = 10_000
/** The queue's own ordering. It is not a field the repository can sort by. */
const PINNED_SORT_FIELD = 'pinned'

export type InquiryQueueDeps = {
  readonly intake: IntakeRepository
  readonly categories: readonly InquiryCategory[]
  readonly users: readonly StaffUser[]
  /** Injected: the module reads one clock so a row and its detail never disagree. */
  readonly now: Date
  readonly actorId: string
  /** False hides bulk assign entirely rather than offering a control that refuses. */
  readonly canAssign: boolean
}

const column = dataTableColumns<Inquiry>()

export function inquiryQueueConfig(deps: InquiryQueueDeps): QueueConfig<Inquiry> {
  const { intake, categories, users, now, actorId, canAssign } = deps
  const tatOf = (row: Inquiry) => tatMinutesFor(row, categories)

  const columns = column.columns([
    /**
     * The pin, as a real column with a real sort.
     *
     * §5 wants unassigned and TAT-at-risk rows at the top, and this is what makes
     * that expressible in the URL rather than hidden in the loader: the queue's
     * default sort is this column, `load` produces the same order across every
     * page, and sorting by anything else replaces it — visibly, and reversibly.
     */
    column.accessor((row) => pinRank(row, now, tatOf(row)), {
      id: 'pinned',
      header: 'Pin',
      cell: ({ row }) =>
        isPinned(row.original, now, tatOf(row.original)) ? (
          <Badge tone="attn" caps>
            Pinned
          </Badge>
        ) : (
          <span className={styles.noClock}>—</span>
        ),
    }),
    column.accessor('systemNo', {
      header: 'Reference',
      cell: ({ row }) => (
        <span className={styles.reference}>
          <RecordId systemNo={row.original.systemNo} showInsurer={false} />
        </span>
      ),
    }),
    column.accessor('contactName', {
      header: 'Customer',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.contact}>
          <span className={styles.contactName}>{row.original.contactName}</span>
          <span className={styles.contactMobile}>{row.original.contactMobile}</span>
        </span>
      ),
    }),
    column.accessor('source', {
      header: 'Source',
      enableSorting: false,
      cell: ({ row }) => SOURCE_LABEL[row.original.source],
    }),
    column.accessor('categoryId', {
      header: 'Category',
      enableSorting: false,
      cell: ({ row }) =>
        categories.find((category) => category.id === row.original.categoryId)?.label ??
        'No category',
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => nameOf(users, row.original.ownerId),
    }),
    column.accessor('status', {
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={INQUIRY_TONE[row.original.status]}>
          {INQUIRY_LABEL[row.original.status]}
        </StatusPill>
      ),
    }),
    column.accessor('tatDueAt', {
      header: 'TAT remaining',
      cell: ({ row }) => {
        const inquiry = row.original
        const minutes = tatOf(inquiry)
        const reading = readTat(inquiry, now, minutes)
        if (!reading.running || inquiry.assignedAt === null || minutes === null) {
          return <span className={styles.noClock}>clock stopped</span>
        }
        return (
          <Clock
            mode="tat"
            start={inquiry.assignedAt}
            now={now}
            durationMs={minutes * MINUTE_MS}
          />
        )
      },
    }),
    column.accessor('createdAt', {
      header: 'Age',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
    }),
  ])

  const bulkAssign: QueueBulkAction<Inquiry> = {
    key: 'assign',
    label: 'Assign',
    icon: 'users',
    variant: 'primary',
    confirmLabel: 'Route and notify',
    confirmTitle: (selection) =>
      `Route ${selection.ids.length} ${selection.ids.length === 1 ? 'inquiry' : 'inquiries'}`,
    preview: (selection) =>
      selection.rows.map((row) => {
        const plan = planRouting(row, categories, users)
        return {
          key: row.id,
          label: row.systemNo,
          from: nameOf(users, row.ownerId),
          to: plan.ok
            ? `${plan.assignee.name} · TAT ${plan.tatMinutes} min`
            : 'Unrouted, admin alerted',
        }
      }),
    note: () =>
      'Each assignee is notified and their turnaround clock starts. The allowance comes from the category in configuration, not from this screen. Anything routing cannot resolve goes to the unrouted queue with an admin alert rather than staying where it is.',
    run: async (selection) => {
      const refusals: string[] = []
      let routed = 0
      let parked = 0

      for (const row of selection.rows) {
        const plan = planRouting(row, categories, users)
        const outcome = plan.ok
          ? await intake.assign(row.id, {
              actorId,
              nextOwnerId: plan.assignee.id,
              nextOwnerCategoryGroupId: plan.category.id,
              tatMinutes: plan.tatMinutes,
              routingMatchFound: true,
              teamId: plan.category.teamId,
              now,
            })
          : await intake.markUnrouted(row.id, { actorId, adminAlertRaised: true, now })

        if (!outcome.ok) refusals.push(`${row.systemNo}: ${outcome.reason}`)
        else if (plan.ok) routed += 1
        else parked += 1
      }

      // The machine's own sentence, unedited — a generic failure here would send
      // somebody to a developer to find out which rule fired.
      if (refusals.length > 0) return { ok: false, message: refusals[0] }

      const parts = [
        routed > 0 ? `${routed} routed and notified` : null,
        parked > 0 ? `${parked} moved to unrouted with an admin alert` : null,
      ].filter((part): part is string => part !== null)

      return { ok: true, message: parts.join('; ') || 'Nothing to route.' }
    },
  }

  return {
    key: 'inquiries',
    title: 'Inquiries',
    description:
      'Unassigned and TAT-at-risk inquiries are pinned to the top. Everything below them is in the order the filters asked for.',
    noun: 'inquiry',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: 'status',
        label: 'Status',
        options: Object.entries(INQUIRY_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'source',
        label: 'Source',
        options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'categoryId',
        label: 'Category',
        options: categories.map((category) => ({ value: category.id, label: category.label })),
      },
      {
        key: 'ownerId',
        label: 'Owner',
        options: users.filter((user) => user.active).map((user) => ({ value: user.id, label: user.name })),
      },
    ],
    sortable: ['pinned', 'createdAt', 'tatDueAt', 'systemNo'],
    defaultSort: { field: 'pinned', direction: 'asc' },
    searchPlaceholder: 'Name, mobile or reference',
    stripeMapping: (row) => inquirySeverity(row, now, tatOf(row)),
    ...(canAssign ? { bulkActions: [bulkAssign] } : {}),
    load: (query: ListQuery) => loadInquiries(intake, query, (row) => pinRank(row, now, tatOf(row))),
    empty: {
      title: 'No inquiries are waiting',
      explanation:
        'Inquiries arrive from the website, from walk-ins and from sub-agents in the field. Capture one with New inquiry, and routing will hand it to the matching person with a turnaround clock.',
    },
    rowTarget: 'route',
    rowHref: (row) => `/inquiries/${row.id}`,
  }
}

/**
 * Reads the page the URL asked for.
 *
 * The repository has no "pinned" sort to ask for, and pagination happens there
 * rather than in the table — so when the queue is in its default pinned order,
 * this asks for the whole matched set, ranks it, and cuts the page itself. Any
 * other sort is the repository's own and is passed straight through.
 *
 * `Array.prototype.sort` is stable, which is what keeps newest-first intact
 * inside each rank.
 */
export async function loadInquiries(
  intake: IntakeRepository,
  query: ListQuery,
  rank: (row: Inquiry) => number,
) {
  if (query.sort && query.sort.field !== PINNED_SORT_FIELD) return intake.list(query)

  const wide = await intake.list({
    ...query,
    sort: { field: 'createdAt', direction: 'desc' },
    page: 1,
    pageSize: SCAN_SIZE,
  })
  const ordered = [...wide.rows].sort((a, b) => rank(a) - rank(b))

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(ordered.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return {
    rows: ordered.slice(start, start + pageSize),
    total: ordered.length,
    page,
    pageSize,
    pageCount,
  }
}
