/**
 * The task queue, as configuration (plan §5 "Task queue", FR-15, §6).
 *
 * Not a table. `<WorkQueue>` was built once in P-08 and every list screen after
 * it is an object of this shape, which is why the filter bar, the stripe, the
 * selection bar and the keyboard model are identical here and in every other
 * queue. This file says what a task ROW is, and nothing about how a list
 * behaves.
 *
 * Three decisions worth reading:
 *
 *   **Push and pull are one queue, filtered.** FR-15 asks for "push or pull per
 *   module", and two separate screens is how that ends up meaning two different
 *   ideas of what is outstanding. `ownerId` already records the difference, so
 *   `delivery` is an ordinary filter in the URL: `?delivery=pull` is the pool a
 *   member can take from, `?delivery=push` is what has been handed to a person,
 *   and the unfiltered queue is everything the asker's scope reaches.
 *
 *   **The row names its record.** A task is polymorphic, so the row carries the
 *   kind of work as a badge and the record it belongs to as a link — resolved to
 *   a reference or a person's name, never left as an id. An entity with no
 *   screen in §4 renders as a type without a link rather than as a broken one.
 *
 *   **The only mutation is completion, in bulk, gated.** There is no per-row
 *   action and no self-assign: `TaskRepository` has no `assign`, and a feature
 *   that wrote an owner onto a record itself would be reaching behind the data
 *   layer. Marking work done is an outward move, so it goes through
 *   `<ConfirmGate>`, which `<WorkQueue>`'s selection bar supplies.
 */

import type { ListQuery, StaffUser, Task } from '../../data/repo'
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATES } from '../../data/repo'
import type { QueueBulkAction, QueueConfig } from '../../components/WorkQueue'
import { dataTableColumns } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { RecordId, RelativeTime, TruncatedText } from '../../ui/type'
import { DELIVERY_FILTER } from './data/task-desk'
import type { TaskDesk } from './data/task-desk'
import { subjectKey } from './data/task-context'
import {
  SUBJECT_ENTITIES,
  TASK_DELIVERIES,
  TASK_DELIVERY_LABEL,
  TASK_KIND_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATE_LABEL,
  TASK_STATE_TONE,
  deliveryOf,
  isLive,
  isOverdue,
  subjectLabel,
  taskSeverity,
} from './task-view'
import { TaskDrawer } from './TaskDrawer'
import type { User } from '../../domain/permissions'
import styles from './Tasks.module.css'

export type TaskQueueDeps = {
  readonly desk: TaskDesk
  /** Whose pool this is. Every read is filtered through this user's scope. */
  readonly user: User
  readonly users: readonly StaffUser[]
  /** `${entity}:${id}` to the name a person recognises. */
  readonly subjectNames: Readonly<Record<string, string>>
  /** Injected: a row and its drawer must never disagree about now. */
  readonly now: Date
  /** False hides completion entirely rather than offering a control that refuses. */
  readonly canComplete: boolean
}

const column = dataTableColumns<Task>()

export function taskQueueConfig(deps: TaskQueueDeps): QueueConfig<Task> {
  const { desk, user, users, subjectNames, now, canComplete } = deps

  const nameOf = (id: string | null) =>
    id === null ? 'Unclaimed' : (users.find((person) => person.id === id)?.name ?? id)

  const subjectNameOf = (task: Task) =>
    subjectNames[subjectKey(task.subjectEntity, task.subjectId)] ?? subjectLabel(task)

  const columns = column.columns([
    column.accessor('systemNo', {
      header: 'Reference',
      cell: ({ row }) => <RecordId systemNo={row.original.systemNo} showInsurer={false} />,
    }),
    column.accessor('kind', {
      header: 'Work',
      enableSorting: false,
      cell: ({ row }) => <Badge caps>{TASK_KIND_LABEL[row.original.kind]}</Badge>,
    }),
    column.accessor('title', {
      header: 'What it is',
      enableSorting: false,
      cell: ({ row }) => <TruncatedText text={row.original.title} lines={1} />,
    }),
    column.accessor('subjectId', {
      header: 'About',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={styles.subject}>
          <span className={styles.subjectName}>{subjectNameOf(row.original)}</span>
          <span className={styles.subjectKind}>{subjectLabel(row.original)}</span>
        </span>
      ),
    }),
    column.accessor((row) => deliveryOf(row), {
      id: DELIVERY_FILTER,
      header: 'Delivery',
      enableSorting: false,
      cell: ({ row }) => {
        const delivery = deliveryOf(row.original)
        return (
          <Badge tone={delivery === TASK_DELIVERIES.pull ? 'attn' : 'neutral'}>
            {TASK_DELIVERY_LABEL[delivery]}
          </Badge>
        )
      },
    }),
    column.accessor('ownerId', {
      header: 'Owner',
      enableSorting: false,
      cell: ({ row }) => nameOf(row.original.ownerId),
    }),
    column.accessor('priority', {
      header: 'Priority',
      cell: ({ row }) => (
        <Badge tone={TASK_PRIORITY_TONE[row.original.priority]}>
          {TASK_PRIORITY_LABEL[row.original.priority]}
        </Badge>
      ),
    }),
    column.accessor('state', {
      header: 'State',
      enableSorting: false,
      cell: ({ row }) => (
        <StatusPill tone={TASK_STATE_TONE[row.original.state]}>
          {TASK_STATE_LABEL[row.original.state]}
        </StatusPill>
      ),
    }),
    column.accessor('dueAt', {
      header: 'Due',
      cell: ({ row }) => (
        <span className={styles.due} data-overdue={isOverdue(row.original, now) ? '' : undefined}>
          <RelativeTime value={row.original.dueAt} now={now} />
        </span>
      ),
    }),
  ])

  const markDone: QueueBulkAction<Task> = {
    key: 'complete',
    label: 'Mark done',
    icon: 'check',
    variant: 'primary',
    confirmLabel: 'Record as done',
    confirmTitle: (selection) =>
      `Close ${selection.ids.length} ${selection.ids.length === 1 ? 'task' : 'tasks'}`,
    // Only the live rows are previewed, because only they will change. A gate
    // that listed a finished task as changing would be describing a write that
    // does not happen.
    preview: (selection) =>
      selection.rows
        .filter(isLive)
        .map((row) => ({
          key: row.id,
          label: row.systemNo,
          from: TASK_STATE_LABEL[row.state],
          to: TASK_STATE_LABEL.done,
        })),
    note: (selection) => {
      const finished = selection.rows.filter((row) => !isLive(row)).length
      const base =
        'Completion is recorded against the task and stamped with the time. It does not close the record the task is about — that happens on the record’s own screen.'
      if (finished === 0) return base
      return `${base} ${finished} of the selected ${finished === 1 ? 'task has' : 'tasks have'} already stopped and will be left alone.`
    },
    run: async (selection) => {
      const live = selection.rows.filter(isLive)
      const refusals: string[] = []
      let closed = 0

      for (const row of live) {
        const outcome = await desk.complete(row.id, { actorId: user.id, now })
        if (!outcome.ok) refusals.push(`${row.systemNo}: ${outcome.reason}`)
        else closed += 1
      }

      // The machine's own sentence, unedited — a generic failure here would send
      // somebody to a developer to find out which rule fired.
      if (refusals.length > 0) return { ok: false, message: refusals[0] }
      if (closed === 0) return { ok: true, message: 'Nothing was still open, so nothing changed.' }
      return { ok: true, message: `${closed} ${closed === 1 ? 'task' : 'tasks'} recorded as done.` }
    },
  }

  return {
    key: 'tasks',
    title: 'Tasks',
    noun: 'task',
    nounPlural: 'tasks',
    getRowId: (row) => row.id,
    columns,
    filters: [
      {
        key: DELIVERY_FILTER,
        label: 'Delivery',
        anyLabel: 'Pushed and pool',
        options: [
          { value: TASK_DELIVERIES.push, label: 'Pushed to a person' },
          { value: TASK_DELIVERIES.pull, label: 'Pool — unclaimed' },
        ],
      },
      {
        key: 'state',
        label: 'State',
        options: Object.values(TASK_STATES).map((value) => ({
          value,
          label: TASK_STATE_LABEL[value],
        })),
      },
      {
        key: 'kind',
        label: 'Work',
        options: Object.values(TASK_KINDS).map((value) => ({
          value,
          label: TASK_KIND_LABEL[value],
        })),
      },
      {
        key: 'priority',
        label: 'Priority',
        options: Object.values(TASK_PRIORITIES).map((value) => ({
          value,
          label: TASK_PRIORITY_LABEL[value],
        })),
      },
      {
        key: 'subjectEntity',
        label: 'About',
        options: SUBJECT_ENTITIES.map((entity) => ({ value: entity, label: entity })),
      },
      {
        key: 'ownerId',
        label: 'Owner',
        options: users
          .filter((person) => person.active)
          .map((person) => ({ value: person.id, label: person.name })),
      },
    ],
    sortable: ['dueAt', 'createdAt', 'priority'],
    defaultSort: { field: 'dueAt', direction: 'asc' },
    searchPlaceholder: 'Title or reference',
    stripeMapping: (row) => taskSeverity(row, now),
    ...(canComplete ? { bulkActions: [markDone] } : {}),
    load: (query: ListQuery) => desk.pool(user, query),
    empty: {
      title: 'Nothing is on your list',
      explanation:
        'Tasks are raised by the automation recipes — a bounced cheque, a failed mandate, a KYC chase — and by people handing work on. This queue shows every task your access reaches, both the ones pushed to you and the unclaimed pool; filter by Delivery to see one or the other.',
    },
    rowTarget: 'drawer',
    drawerTitle: (row) => row.title,
    drawerSubtitle: (row) => `${row.systemNo} · ${TASK_KIND_LABEL[row.kind]}`,
    renderDrawer: (row) => (
      <TaskDrawer
        task={row}
        now={now}
        ownerName={nameOf(row.ownerId)}
        raisedByName={raisedByLabel(row, users)}
        subjectName={subjectNameOf(row)}
      />
    ),
  }
}

/**
 * Who or what raised this task.
 *
 * `raisedBy` holds either a recipe key or a user id (§8). A recipe key is shown
 * as written, because "mandate.failureFollowUp" is the automation an admin can
 * find in configuration, and softening it into "the system" would hide that.
 */
function raisedByLabel(task: Task, users: readonly StaffUser[]): string {
  const person = users.find((user) => user.id === task.raisedBy)
  return person ? person.name : `${task.raisedBy} (automation)`
}
