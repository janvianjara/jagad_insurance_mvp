/**
 * The harness the task tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, pins the clock, and mounts the queue behind its own address with
 * the records a row can open stubbed — a scenario about the task queue should
 * fail when the task queue breaks, not when the policy file does.
 *
 * Nothing here imports a fixture. Every record is reached through a repository,
 * exactly as a screen reaches it.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { TaskClockBase } from './clock'
import TaskQueueScreen from './TaskQueueScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/**
 * The story cast's staff ids, chosen for the scope each one carries.
 *
 * `priya` is back office — `tasks` at `level: 'all'`, so she is the widest pool
 * in the product. `kiran` is a channel agent — `tasks` at `level: 'own'`, so
 * hers is the narrowest. The difference between the two is what the ABAC test
 * measures.
 */
export const WHO = {
  priya: 'usr-priya-desai',
  kiran: 'usr-kiran-solanki',
  nita: 'usr-nita-shah',
} as const

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

/** What the shell does at boot, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderTasks(repositories: MockRepositories, path = '/tasks') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <TaskClockBase.Provider value={WALKTHROUGH_NOW}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/tasks" element={<TaskQueueScreen />} />
              <Route path="/policies/:id" element={<h1>Policy file</h1>} />
              <Route path="/customers/:id" element={<h1>Customer file</h1>} />
            </Routes>
          </MemoryRouter>
        </TaskClockBase.Provider>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
