/**
 * The harness the renewal-notice tests render through.
 *
 * Real mock repositories, the session hydrated the way the shell hydrates it,
 * and the two routes under test. No fixture is imported by a component and no
 * test reaches past a repository.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { NoticeBatchScreen } from './NoticeBatchScreen'
import { NoticeQueueScreen } from './NoticeQueueScreen'

export const WHO = {
  vivek: 'usr-vivek-jagad',
  sneha: 'usr-sneha-patel',
} as const

/**
 * The Tata AIG batch canvas n32–n36 walks: four rows, one matched and checked,
 * one matched but never checked, one matching nothing this agency holds, and one
 * rejected outright.
 */
export const BATCH = 'ntb-0001'

export const ROW = {
  /** Matched and confirmed. The only row in the batch that can go out as it is. */
  clean: 'ntm-0001-1',
  /** Matched, but holding a read nobody has checked. */
  unchecked: 'ntm-0001-2',
  /** Matched nothing this agency holds. §9's hard block. */
  unmatched: 'ntm-0001-3',
  rejected: 'ntm-0001-4',
} as const

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderNotices(repositories: MockRepositories, path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/renewals/notices" element={<NoticeQueueScreen />} />
            <Route path="/renewals/notices/:batchId" element={<NoticeBatchScreen />} />
            <Route path="/renewals" element={<h1>Renewal pool</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
