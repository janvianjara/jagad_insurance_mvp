/**
 * The harness the search tests render through.
 *
 * The palette is mounted directly rather than through the shell, because what is
 * under test is the fan-out and the keyboard model, not the shortcut that summons
 * it. A route sink stands in for the rest of the product so a test can assert
 * where Enter actually went.
 *
 * Nothing here imports a fixture. Every record is reached through a repository,
 * exactly as the palette reaches it.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import type { User } from '../../domain/permissions'
import { GlobalSearch } from './GlobalSearch'
import { RouteSink } from './route-sink'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Admin — sees every resource, so every group is queried. */
  vivek: 'usr-vivek-jagad',
  /** Sub-agent — the narrowest template in the product. */
  meera: 'usr-meera-joshi',
} as const

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

/** What the shell does at boot, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<User> {
  const staff = await repositories.config.users()
  const accounts = staff.filter((person) => person.active).map(resolveAccount)
  useSessionStore.getState().hydrate(accounts, userId)
  const user = useSessionStore.getState().user
  if (!user) throw new Error(`No account for ${userId}; the fixtures have moved.`)
  return user
}

export function renderSearch(repositories: MockRepositories, user: User) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/assistant']}>
          <GlobalSearch onClose={() => {}} user={user} />
          <Routes>
            <Route path="*" element={<RouteSink />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

export function currentRoute(): string {
  return screen.getByTestId('route').textContent ?? ''
}
