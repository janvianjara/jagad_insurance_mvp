/**
 * The harness the vault tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, pins the clock so an access-log entry has a fixed timestamp, and
 * mounts the vault behind its own address with the records a document can open
 * stubbed.
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
import { DocumentClockBase } from './clock'
import DocumentVaultScreen from './DocumentVaultScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/**
 * The staff ids these tests turn on, chosen for what each template holds.
 *
 * `priya` is back office: `documents` at `level: 'all'`, with both the
 * `sensitive` and `document-content` grants — the widest view of the vault
 * anybody has. `kiran` is an agent: `documents` at `level: 'own'` with neither
 * grant, which is what makes the ACL and the class gates observable.
 */
export const WHO = {
  priya: 'usr-priya-desai',
  kiran: 'usr-kiran-solanki',
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

export function renderVault(repositories: MockRepositories, path = '/documents') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <DocumentClockBase.Provider value={WALKTHROUGH_NOW}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/documents" element={<DocumentVaultScreen />} />
              <Route path="/customers/:id" element={<h1>Customer file</h1>} />
              <Route path="/policies/:id" element={<h1>Policy file</h1>} />
            </Routes>
          </MemoryRouter>
        </DocumentClockBase.Provider>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
