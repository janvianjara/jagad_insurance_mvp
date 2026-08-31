import { Link } from 'react-router'
import type { Task } from '../../data/repo'
import { Badge, StatusPill } from '../../ui/signal'
import { DateTime, RelativeTime } from '../../ui/type'
import {
  TASK_DELIVERIES,
  TASK_KIND_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATE_LABEL,
  TASK_STATE_TONE,
  deliveryOf,
  isOverdue,
  subjectHref,
  subjectLabel,
} from './task-view'
import styles from './Tasks.module.css'

export type TaskDrawerProps = {
  task: Task
  now: Date
  ownerName: string
  raisedByName: string
  subjectName: string
}

/**
 * The task, in the shell's drawer.
 *
 * Read-only by design. Everything a person can do about a task is done on the
 * record it points at, which is one click away here; the only write the queue
 * offers is completion, and that lives in the selection bar behind
 * `<ConfirmGate>` where the preview can show every row it will touch at once.
 */
export function TaskDrawer({ task, now, ownerName, raisedByName, subjectName }: TaskDrawerProps) {
  const href = subjectHref(task)
  const delivery = deliveryOf(task)

  return (
    <div className={styles.drawer}>
      <dl className={styles.facts}>
        <dt>Work</dt>
        <dd>{TASK_KIND_LABEL[task.kind]}</dd>

        <dt>State</dt>
        <dd>
          <StatusPill tone={TASK_STATE_TONE[task.state]}>{TASK_STATE_LABEL[task.state]}</StatusPill>
        </dd>

        <dt>Delivery</dt>
        <dd>
          {delivery === TASK_DELIVERIES.pull
            ? 'In the pool. Nobody has claimed it.'
            : `Pushed to ${ownerName}.`}
        </dd>

        <dt>Priority</dt>
        <dd>
          <Badge tone={TASK_PRIORITY_TONE[task.priority]}>
            {TASK_PRIORITY_LABEL[task.priority]}
          </Badge>
        </dd>

        <dt>Due</dt>
        <dd>
          <span className={styles.due} data-overdue={isOverdue(task, now) ? '' : undefined}>
            <DateTime value={task.dueAt} mode="datetime" />
          </span>
        </dd>

        <dt>Raised</dt>
        <dd>
          <RelativeTime value={task.createdAt} now={now} /> by {raisedByName}
        </dd>

        <dt>Completed</dt>
        <dd>
          {task.completedAt === null ? (
            'Not yet'
          ) : (
            <DateTime value={task.completedAt} mode="datetime" />
          )}
        </dd>
      </dl>

      <p className={styles.drawerSubject}>
        About {subjectLabel(task).toLowerCase()} <strong>{subjectName}</strong>.
      </p>

      {href ? (
        <Link className={styles.drawerLink} to={href}>
          Open the record
        </Link>
      ) : (
        <p className={styles.drawerNote}>
          {subjectLabel(task)} has no screen in the route map yet, so there is nowhere to open. The
          task still records what it is about.
        </p>
      )}
    </div>
  )
}
