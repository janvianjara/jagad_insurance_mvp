/**
 * The harness the claim tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts the module's three routes — so a scenario reads as
 * "sign in as this person, open this address, do this" and nothing about the
 * assertions depends on a fixture import inside a component.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { ClaimDetailScreen } from './ClaimDetailScreen'
import { ClaimIntimationScreen } from './ClaimIntimationScreen'
import { ClaimQueueScreen } from './ClaimQueueScreen'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  amit: 'usr-amit-rana',
  kiran: 'usr-kiran-solanki',
  sneha: 'usr-sneha-patel',
} as const

/** The channel ids the fixtures use. Meera's direct-updates toggle is OFF. */
export const AGENTS = {
  kiran: 'agt-kiran-solanki',
  meera: 'agt-meera-joshi',
} as const

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

/** What `useSessionBoot` does in the shell, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderClaims(repositories: MockRepositories, path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/claims" element={<ClaimQueueScreen />} />
            <Route path="/claims/new" element={<ClaimIntimationScreen />} />
            <Route path="/claims/:id" element={<ClaimDetailScreen />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
