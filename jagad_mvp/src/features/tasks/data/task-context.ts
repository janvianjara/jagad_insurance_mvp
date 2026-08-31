/**
 * What the task queue needs words for.
 *
 * A task names its subject as an entity plus an id — `Policy` and
 * `pol-4388` — which is exactly right for storage and useless in a row. So the
 * screen resolves those ids to the things a person recognises: a policy's
 * reference, a customer's name, a staff member's name.
 *
 * It reads the whole of each set rather than a page, for the same reason the
 * drafts queue does: which tasks sit on page one changes with the sort and the
 * filter, so a page-shaped read would leave half the rows unable to name
 * themselves. The sets are the agency's own book — hundreds, not millions — and
 * against a real API this collapses to the subject names arriving on the task
 * itself.
 *
 * Anything unresolved is not invented. `nameOfSubject` falls back to the entity
 * label, and the row shows a type rather than a wrong name.
 */

import type { Repositories, StaffUser } from '../../../data/repo'

/** Big enough to hold the whole in-memory set. */
const SCAN_SIZE = 10_000

export type TaskContext = {
  readonly users: readonly StaffUser[]
  /** `${subjectEntity}:${subjectId}` to the name a person would recognise. */
  readonly subjectNames: Readonly<Record<string, string>>
}

export function subjectKey(entity: string, id: string): string {
  return `${entity}:${id}`
}

export async function loadTaskContext(repositories: Repositories): Promise<TaskContext> {
  const [users, policies, customers] = await Promise.all([
    repositories.config.users(),
    repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
    repositories.customers.list({ page: 1, pageSize: SCAN_SIZE }),
  ])

  const subjectNames: Record<string, string> = {}
  for (const policy of policies.rows) {
    subjectNames[subjectKey('Policy', policy.id)] = policy.systemNo
  }
  for (const customer of customers.rows) {
    subjectNames[subjectKey('Customer', customer.id)] = customer.fullName
  }

  return { users, subjectNames }
}
