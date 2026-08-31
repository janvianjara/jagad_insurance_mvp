/**
 * The task pool, filtered by who is asking — FR-15's "ABAC-filtered pool".
 *
 * `TaskRepository` has `list`, `forOwner` and `open`, and none of them is the
 * pool FR-15 describes. `forOwner` is one person's pushed work and excludes the
 * unclaimed rows a member is meant to be able to pull; `list` is everybody's.
 * The pool is neither: it is every task this user's attribute scope reaches,
 * pushed and pooled together, which is a record-level question that only
 * `can()` can answer.
 *
 * So this desk does what the inquiry queue already does for pinning: it asks the
 * repository for the whole matched set, applies the rule the repository cannot
 * express, and cuts the page itself. Three things follow, and each is the reason
 * for the shape:
 *
 *   - `total` is the size of the SCOPED set. A header that said 812 while a
 *     team lead could open four of them would be worse than no header (§7);
 *   - the URL still decides everything else. Search, the declared filters, the
 *     sort and the page all go to the repository untouched, so the view is still
 *     reconstructible from its address;
 *   - `delivery` is applied here rather than sent onward. The repository
 *     declares no such filter, and `runQuery` refuses an undeclared one rather
 *     than silently returning every row — so the key is lifted out of the query
 *     before it travels, and applied to the scoped rows.
 *
 * There is exactly one mutation, `complete`, and it is delegated untouched. A
 * task has no machine of its own (§9), so completion is a single recorded fact;
 * the desk adds nothing to it and the screen still routes it through
 * `<ConfirmGate>`.
 *
 * What is deliberately NOT here: taking a pooled task. `TaskRepository` has no
 * `assign`, and inventing one in a feature would mean writing an owner onto a
 * record behind the data layer's back. The pool is visible and filterable;
 * claiming one needs a repository method that does not exist yet.
 */

import type {
  CompleteTaskCommand,
  ListQuery,
  MutationResult,
  Page,
  Repositories,
  Task,
  TaskRepository,
} from '../../../data/repo'
import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
import { can } from '../../../domain/permissions'
import type { ScopedRecord, User } from '../../../domain/permissions'
import { TASK_DELIVERIES, deliveryOf } from '../task-view'
import type { TaskDelivery } from '../task-view'

/** Big enough to hold the whole in-memory set; a scope pass needs every row. */
const SCAN_SIZE = 10_000

/**
 * The filter this module owns rather than the repository. Declared here so the
 * queue configuration and the loader cannot disagree about its name.
 */
export const DELIVERY_FILTER = 'delivery'

/**
 * A task's scope attributes, in the shape `can()` evaluates.
 *
 * The entity stores `null` for "not set" and `ScopedRecord` uses `undefined`;
 * the difference matters, because `record.teamId === user.teamId` would be true
 * for two nulls and would hand every unowned task to every user without a team.
 */
export function scopedRecordOf(task: Task): ScopedRecord {
  return {
    ...(task.ownerId === null ? {} : { ownerId: task.ownerId }),
    ...(task.teamId === null ? {} : { teamId: task.teamId }),
    ...(task.agentId === null ? {} : { agentId: task.agentId }),
  }
}

export function isInPool(user: User, task: Task): boolean {
  return can(user, 'view', 'tasks', scopedRecordOf(task))
}

export type TaskDesk = {
  /** Every task this user's scope reaches, narrowed by whatever the URL asked. */
  pool(user: User, query: ListQuery): Promise<Page<Task>>
  complete(id: string, command: CompleteTaskCommand): Promise<MutationResult<Task>>
}

const CACHE = new WeakMap<TaskRepository, TaskDesk>()

export function taskDesk(repositories: Repositories): TaskDesk {
  const existing = CACHE.get(repositories.tasks)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories.tasks, built)
  return built
}

/** Splits the queue's own filter out of the query the repository will see. */
function splitDelivery(query: ListQuery): {
  readonly wanted: readonly TaskDelivery[]
  readonly rest: ListQuery
} {
  const filters = { ...(query.filters ?? {}) }
  const asked = filters[DELIVERY_FILTER] ?? []
  delete filters[DELIVERY_FILTER]

  const wanted = asked.filter(
    (value): value is TaskDelivery =>
      value === TASK_DELIVERIES.push || value === TASK_DELIVERIES.pull,
  )

  return { wanted, rest: { ...query, filters } }
}

function buildDesk(repositories: Repositories): TaskDesk {
  return {
    async pool(user, query) {
      const { wanted, rest } = splitDelivery(query)

      const wide = await repositories.tasks.list({ ...rest, page: 1, pageSize: SCAN_SIZE })

      const matched = wide.rows.filter(
        (task) =>
          isInPool(user, task) && (wanted.length === 0 || wanted.includes(deliveryOf(task))),
      )

      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
      const pageCount = Math.ceil(matched.length / pageSize)
      const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
      const start = (page - 1) * pageSize

      return {
        rows: matched.slice(start, start + pageSize),
        total: matched.length,
        page,
        pageSize,
        pageCount,
      }
    },

    complete(id, command) {
      return repositories.tasks.complete(id, command)
    },
  }
}
