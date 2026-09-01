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
 *   Bulk assign names a person or lets routing name one. The gate offers the
 *   choice, and the preview under it answers for whichever was made: each
 *   selected row shows the owner it is about to get. Rows routing cannot resolve
 *   — or that have no category, so no turnaround allowance — go to `unrouted`
 *   with the admin alert instead of quietly staying put, whether or not somebody
 *   was named. Cancel writes nothing.
 */

import { DEFAULT_PAGE_SIZE } from '../../data/repo'
import type {
  Inquiry,
  InquiryCategory,
  InquiryStage,
  ListQuery,
  StaffUser,
} from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { DISCARDED_FILTER, RowDiscardAction, discardBulkAction } from '../../components/RecordCorrection'
import { dataTableColumns } from '../../ui/data'
import { Badge, Clock, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime } from '../../ui/type'
import type { IntakeRepository } from './data/intake'
import {
  INQUIRY_LABEL,
  INQUIRY_TONE,
  SOURCE_LABEL,
  engagementLapse,
  inquirySeverity,
  isPinned,
  pinRank,
  readTat,
} from './inquiry-view'

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
  /** The configured pipeline, so a row reads the label rather than the key. */
  readonly stages: readonly InquiryStage[]
}

function stageLabelOf(stages: readonly InquiryStage[], key: string | null): string {
  if (key === null) return 'Not contacted'
  return stages.find((stage) => stage.key === key)?.label ?? key
}

const column = dataTableColumns<Inquiry>()

export function inquiryQueueConfig(deps: InquiryQueueDeps): QueueConfig<Inquiry> {
  const { intake, categories, users, now, actorId, canAssign, stages } = deps
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
      cell: ({ row }) => <span className={styles.contactName}>{row.original.contactName}</span>,
    }),
    column.accessor('contactMobile', {
      header: 'Mobile',
      enableSorting: false,
      cell: ({ row }) => <span className={styles.contactMobile}>{row.original.contactMobile}</span>,
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
    /**
     * Where the conversation has got to, and whether anything is booked —
     * FR-06.12, FR-06.15.
     *
     * One column rather than two because they are read as one fact: a stage with
     * no date under it is what a lead going quiet looks like, and separating them
     * puts the two halves of that sentence in different places on the row.
     */
    column.accessor((row) => row.stageKey ?? '', {
      id: 'stage',
      header: 'Stage · next',
      cell: ({ row }) => {
        const inquiry = row.original
        if (inquiry.status !== 'accepted') {
          return <span className={styles.noClock}>—</span>
        }
        const lapse = engagementLapse(inquiry, now)
        const label = stageLabelOf(stages, inquiry.stageKey)
        return (
          <span className={styles.stage}>
            <span>{label}</span>
            {lapse === 'unplanned' ? (
              <Badge tone="attn" caps>
                Nothing booked
              </Badge>
            ) : lapse === 'overdue' ? (
              <Badge tone="bad" caps>
                Overdue
              </Badge>
            ) : inquiry.nextActionAt === null ? null : (
              <RelativeTime value={inquiry.nextActionAt} now={now} />
            )}
          </span>
        )
      },
    }),
    column.accessor('createdAt', {
      header: 'Age',
      cell: ({ row }) => <RelativeTime value={row.original.createdAt} now={now} />,
    }),
  ])

  /**
   * What one selected row will do, given who the person picked.
   *
   * Naming the person is the whole choice; the allowance is not part of it. It
   * comes from the row's own category, so a row with no category has no
   * allowance to measure anybody against and goes to unrouted with the alert
   * whether or not a person was named. That is §9's rule and picking an assignee
   * does not buy a way round it.
   */
  function planFor(row: Inquiry, chosenId: string) {
    const auto = planRouting(row, categories, users)
    if (chosenId === '') return auto

    const category = categories.find((entry) => entry.id === row.categoryId)
    const person = users.find((entry) => entry.id === chosenId && entry.active)
    if (!category) {
      return {
        ok: false as const,
        reason:
          'This inquiry has no category, so there is no turnaround allowance to hand anybody. It goes to the unrouted queue with the admin alert; set a category and it can be assigned.',
      }
    }
    if (!person) {
      return { ok: false as const, reason: 'That person is no longer active.' }
    }
    return { ok: true as const, category, assignee: person, tatMinutes: category.tatMinutes }
  }

  const bulkAssign: QueueBulkAction<Inquiry> = {
    key: 'assign',
    label: 'Assign',
    icon: 'users',
    variant: 'primary',
    confirmLabel: 'Assign and notify',
    choice: {
      key: 'assignee',
      label: 'Assign to',
      emptyLabel: 'Let routing pick, per inquiry',
      hint: 'Name somebody and every selected inquiry goes to them. Left alone, each one goes to the next person in its own category.',
      options: users
        .filter((person) => person.active)
        .map((person) => ({ value: person.id, label: person.name })),
    },
    confirmTitle: (selection, choice) => {
      const count = `${selection.ids.length} ${selection.ids.length === 1 ? 'inquiry' : 'inquiries'}`
      return choice === ''
        ? `Route ${count}`
        : `Assign ${count} to ${nameOf(users, choice)}`
    },
    preview: (selection, choice) =>
      selection.rows.map((row) => {
        const plan = planFor(row, choice)
        return {
          key: row.id,
          label: row.systemNo,
          from: nameOf(users, row.ownerId),
          to: plan.ok
            ? `${plan.assignee.name} · TAT ${plan.tatMinutes} min`
            : 'Unrouted, admin alerted',
        }
      }),
    note: (_selection, choice) =>
      choice === ''
        ? 'Each assignee is notified and their turnaround clock starts. The allowance comes from the category in configuration, not from this screen. Anything routing cannot resolve goes to the unrouted queue with an admin alert rather than staying where it is.'
        : `${nameOf(users, choice)} is notified once per inquiry and a turnaround clock starts on each. The allowance still comes from each inquiry's own category, so anything without one goes to the unrouted queue with an admin alert instead.`,
    run: async (selection, choice) => {
      const refusals: string[] = []
      let routed = 0
      let parked = 0

      for (const row of selection.rows) {
        const plan = planFor(row, choice)
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

      const who = choice === '' ? 'routed and notified' : `assigned to ${nameOf(users, choice)}`
      const parts = [
        routed > 0 ? `${routed} ${who}` : null,
        parked > 0 ? `${parked} moved to unrouted with an admin alert` : null,
      ].filter((part): part is string => part !== null)

      return { ok: true, message: parts.join('; ') || 'Nothing to route.' }
    },
  }

  return {
    key: 'inquiries',
    title: 'Inquiries',
    noun: 'inquiry',
    nounPlural: 'inquiries',
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
        advanced: true,
        label: 'Source',
        options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'categoryId',
        advanced: true,
        label: 'Category',
        options: categories.map((category) => ({ value: category.id, label: category.label })),
      },
      {
        key: 'ownerId',
        label: 'Owner',
        options: users.filter((user) => user.active).map((user) => ({ value: user.id, label: user.name })),
      },
      {
        key: 'stageKey',
        advanced: true,
        label: 'Stage',
        anyLabel: 'Any stage',
        options: stages
          .filter((stage) => stage.active)
          .map((stage) => ({ value: stage.key, label: stage.label })),
      },
      // A discarded inquiry has left this queue by default. This is the way back
      // to it, and it lives in the URL like every other narrowing.
      DISCARDED_FILTER,
    ],
    sortable: ['pinned', 'createdAt', 'tatDueAt', 'systemNo', 'nextActionAt'],
    defaultSort: { field: 'pinned', direction: 'asc' },
    searchPlaceholder: 'Name, mobile or reference',
    stripeMapping: (row) => inquirySeverity(row, now, tatOf(row)),
    rowActions: (row, queue) => (
      <RowDiscardAction
        entity="Inquiry"
        subject={row.systemNo}
        actorId={actorId}
        onDiscard={(command) => intake.discard(row.id, command)}
        onDiscarded={queue.reload}
      />
    ),
    bulkActions: [
      ...(canAssign ? [bulkAssign] : []),
      discardBulkAction<Inquiry>({
        noun: 'inquiry',
        plural: 'inquiries',
        actorId,
        discard: (id, command) => intake.discard(id, command),
      }),
    ],
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
