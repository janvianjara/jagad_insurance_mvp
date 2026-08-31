/**
 * The harness the back-office tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts the home behind its own address with the three
 * queues it links to stubbed. Stubs rather than the real screens, deliberately:
 * a test about the ops home should fail when the home breaks, not when the KYC
 * queue does.
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
import BackOfficeHomeScreen from './BackOfficeHomeScreen'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Back office — the desk this screen is for. Scope `all` on everything ops. */
  priya: 'usr-priya-desai',
  /** Admin — the whole business. */
  vivek: 'usr-vivek-jagad',
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

export function renderBackOffice(repositories: MockRepositories, path = '/back-office') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/back-office" element={<BackOfficeHomeScreen />} />
            <Route path="/back-office/kyc" element={<h1>KYC queue</h1>} />
            <Route path="/back-office/drafts" element={<h1>Drafts queue</h1>} />
            <Route path="/deals" element={<h1>Deals</h1>} />
            <Route path="/inquiries" element={<h1>Inquiries</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
