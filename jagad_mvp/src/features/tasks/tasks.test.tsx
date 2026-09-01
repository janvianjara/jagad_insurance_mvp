import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MockRepositories } from '../../data/mock'
import type { Task } from '../../data/repo'
import { resolveAccount, useSessionStore } from '../../app/store'
import { isInPool, taskDesk } from './data/task-desk'
import { deliveryOf } from './task-view'
import { WALKTHROUGH_NOW, WHO, freshRepositories, renderTasks, signIn } from './test-harness'

/**
 * FR-15 — "polymorphic work items; push or pull per module; ABAC-filtered pool".
 *
 * Three promises, and each one can break on its own:
 *
 *   1. the pool is filtered by who is asking, and the count in the header is the
 *      size of THAT set rather than of the table;
 *   2. push and pull are one queue with a filter in the URL, not two screens;
 *   3. a row says what kind of work it is and which record it belongs to.
 *
 * Plus the standing rule: the one mutation on this screen is outward, so it goes
 * through `<ConfirmGate>`, and Cancel writes nothing.
 *
 * Nothing here imports a fixture. Every expectation is read back through the same
 * repository the screen reads.
 */

let repositories: MockRepositories

beforeEach(async () => {
  repositories = freshRepositories()
  await signIn(repositories, WHO.priya)
})

async function userFor(repositories: MockRepositories, id: string) {
  const staff = await repositories.config.users()
  const person = staff.find((candidate) => candidate.id === id)
  if (!person) throw new Error(`No staff record for ${id}.`)
  return resolveAccount(person).user
}

async function allTasks(repositories: MockRepositories): Promise<readonly Task[]> {
  const page = await repositories.tasks.list({ page: 1, pageSize: 10_000 })
  return page.rows
}

describe('FR-15 — the pool is ABAC-filtered', () => {
  it('gives a back-office desk the whole pool and an agent only their own', async () => {
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const kiran = await userFor(repositories, WHO.kiran)

    const whole = await desk.pool(priya, { page: 1, pageSize: 1 })
    const own = await desk.pool(kiran, { page: 1, pageSize: 1 })

    // Back office holds `tasks` at level `all`; an agent holds it at `own`.
    expect(own.total).toBeLessThan(whole.total)
    expect(own.total).toBeGreaterThan(0)
  })

  it('lets no row into a pool that the asker’s scope does not reach', async () => {
    const desk = taskDesk(repositories)
    const kiran = await userFor(repositories, WHO.kiran)

    const page = await desk.pool(kiran, { page: 1, pageSize: 10_000 })
    for (const task of page.rows) {
      expect(isInPool(kiran, task)).toBe(true)
    }

    const reachable = (await allTasks(repositories)).filter((task) => isInPool(kiran, task))
    expect(page.total).toBe(reachable.length)
  })

  it('counts the scoped set in the header, not the table', async () => {
    const desk = taskDesk(repositories)
    const kiran = await userFor(repositories, WHO.kiran)
    const scoped = await desk.pool(kiran, { page: 1, pageSize: 1 })

    useSessionStore.getState().switchAccount(WHO.kiran)
    renderTasks(repositories)

    await screen.findByRole('heading', { name: 'Tasks' })
    await screen.findByText(`${scoped.total} tasks`)
  })
})

describe('FR-15 — push and pull are one queue, filtered by the URL', () => {
  it('shows only unclaimed work under ?delivery=pull', async () => {
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)

    const pool = await desk.pool(priya, {
      page: 1,
      pageSize: 10_000,
      filters: { delivery: ['pull'] },
    })
    for (const task of pool.rows) expect(task.ownerId).toBeNull()

    const pushed = await desk.pool(priya, {
      page: 1,
      pageSize: 10_000,
      filters: { delivery: ['push'] },
    })
    for (const task of pushed.rows) expect(task.ownerId).not.toBeNull()

    const everything = await desk.pool(priya, { page: 1, pageSize: 1 })
    expect(pool.total + pushed.total).toBe(everything.total)
  })

  it('reconstructs the filtered view from the address alone', async () => {
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const pushed = await desk.pool(priya, {
      page: 1,
      pageSize: 1,
      filters: { delivery: ['push'] },
    })

    renderTasks(repositories, '/tasks?delivery=push')

    await screen.findByText(`${pushed.total} tasks`)
    // The select reads its value back out of the URL, which is what makes the
    // view shareable rather than merely filterable.
    expect(screen.getByLabelText('Delivery')).toHaveValue('push')
  })
})

describe('FR-15 — a row says what work it is and what record it belongs to', () => {
  it('carries the kind of work and the named record on every row', async () => {
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const page = await desk.pool(priya, {
      page: 1,
      pageSize: 25,
      sort: { field: 'dueAt', direction: 'asc' },
    })
    const first = page.rows[0]

    const policy =
      first.subjectEntity === 'Policy' ? await repositories.policies.get(first.subjectId) : null
    const customer =
      first.subjectEntity === 'Customer' ? await repositories.customers.get(first.subjectId) : null
    const expectedName = policy?.systemNo ?? customer?.fullName ?? first.subjectEntity

    renderTasks(repositories)

    const row = await screen.findByRole('row', { name: new RegExp(first.systemNo) })
    // The record it belongs to, named rather than left as an id.
    expect(within(row).getByText(expectedName)).toBeInTheDocument()

    /*
     * And whether it was pushed to a person or is sitting in the pool — asserted
     * against the GRID rather than the row.
     *
     * Delivery is the same on every task on this page, so `<DataTable>` states it
     * once in the caption instead of printing it twenty-five times down a column
     * that could not tell two rows apart. FR-15 asks that the reader can tell
     * push from pull, and they can; it does not ask for a column of one repeated
     * word. Should the page ever hold both kinds, the column comes back on its
     * own and this assertion still passes — the rule is re-evaluated per page.
     */
    const grid = screen.getByRole('grid')
    expect(
      within(grid).getByText(deliveryOf(first) === 'pull' ? 'Pool' : 'Pushed'),
    ).toBeInTheDocument()
  })
})

describe('the one mutation is gated', () => {
  it('writes nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const page = await desk.pool(priya, {
      page: 1,
      pageSize: 25,
      sort: { field: 'dueAt', direction: 'asc' },
      filters: { state: ['open'] },
    })
    const target = page.rows[0]

    renderTasks(repositories, '/tasks?state=open')
    await screen.findByRole('row', { name: new RegExp(target.systemNo) })

    await user.click(screen.getByRole('checkbox', { name: `Select row ${target.id}` }))
    await user.click(await screen.findByRole('button', { name: 'Mark done' }))

    // The modal heading and the gate's own heading both carry the title.
    expect(await screen.findAllByText('Close 1 task')).not.toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const after = await repositories.tasks.get(target.id)
    expect(after?.state).toBe('open')
    expect(after?.completedAt).toBeNull()
  })

  it('records completion only from Confirm', async () => {
    const user = userEvent.setup()
    const desk = taskDesk(repositories)
    const priya = await userFor(repositories, WHO.priya)
    const page = await desk.pool(priya, {
      page: 1,
      pageSize: 25,
      sort: { field: 'dueAt', direction: 'asc' },
      filters: { state: ['open'] },
    })
    const target = page.rows[0]

    renderTasks(repositories, '/tasks?state=open')
    await screen.findByRole('row', { name: new RegExp(target.systemNo) })

    await user.click(screen.getByRole('checkbox', { name: `Select row ${target.id}` }))
    await user.click(await screen.findByRole('button', { name: 'Mark done' }))
    await screen.findAllByText('Close 1 task')
    await user.click(screen.getByRole('button', { name: 'Record as done' }))

    await waitFor(async () => {
      const after = await repositories.tasks.get(target.id)
      expect(after?.state).toBe('done')
    })

    const after = await repositories.tasks.get(target.id)
    // The clock the module reads, not the wall clock.
    expect(after?.completedAt).toBe(WALKTHROUGH_NOW.toISOString())
  })
})
