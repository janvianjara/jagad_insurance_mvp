/**
 * The harness the collections tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts the queue behind its own address. The drawer opens
 * into the page rather than into the shell's drawer slot, because there is no
 * shell here — `<WorkQueue>` renders it inline when no slot is provided, which is
 * the same tree with one fewer portal.
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
import CollectionQueueScreen from './CollectionQueueScreen'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Back office — the desk §9 makes verification the job of. */
  priya: 'usr-priya-desai',
  /** Admin — the whole business, and back-office rights with it. */
  vivek: 'usr-vivek-jagad',
  /** Agent. Took the money on `col-0001`, and is not back-office staff. */
  kiran: 'usr-kiran-solanki',
} as const

/** The on-field cheque canvas 3.4 and 3.5 are about. */
export const WAITING_COLLECTION = 'col-0001'

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

export function renderCollections(
  repositories: MockRepositories,
  path = '/back-office/collections',
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/back-office/collections" element={<CollectionQueueScreen />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
