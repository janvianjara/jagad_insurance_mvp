import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { useTaskNow } from './clock'
import { loadTaskContext } from './data/task-context'
import { taskDesk } from './data/task-desk'
import { taskQueueConfig } from './queue-config'
import styles from './Tasks.module.css'

/**
 * `/tasks` — plan §5's "Task queue" row, FR-15.
 *
 * The screen assembles what the configuration needs and hands it to
 * `<WorkQueue>`: who is signed in, the staff and subject names a row needs words
 * for, and the clock this module reads. Everything about how a list looks and
 * behaves was decided in P-08.
 *
 * The user is not a convenience here, it is the query. FR-15's pool is
 * "ABAC-filtered", so `taskDesk.pool` runs every candidate row through `can()`
 * with the task's own owner, team and agent attributes — which means the same
 * address shows a different queue to a back-office user (whole agency), a sales
 * manager (their team) and an agent (their own book). The number in the header
 * is the size of that scoped set, never of the table.
 */
export function TaskQueueScreen() {
  const repositories = useRepositories()
  const desk = taskDesk(repositories)
  const user = useSessionStore((state) => state.user)
  const now = useTaskNow()

  const context = useResource(() => loadTaskContext(repositories), 'tasks:context')

  if (context.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The task queue could not be loaded"
          explanation={context.error.message}
          action={
            <Button variant="primary" size="sm" onClick={context.reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  return (
    <WorkQueue
      config={taskQueueConfig({
        desk,
        user,
        users: context.data.users,
        subjectNames: context.data.subjectNames,
        now,
        canComplete: can(user, 'edit', 'tasks'),
      })}
    />
  )
}

export default TaskQueueScreen
