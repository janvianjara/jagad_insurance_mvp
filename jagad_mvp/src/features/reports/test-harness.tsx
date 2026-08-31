/**
 * The harness the report tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and pins the day — which matters more here than anywhere else,
 * because every report on this screen is a comparison against a date: which
 * bucket an expiry falls in, which financial year a policy was written in, whose
 * birthday is inside the window.
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
import { ReportClockBase } from './clock'
import ReportsScreen from './ReportsScreen'
import ReportScreen from './ReportScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** Admin holds `reports` at `level: 'all'`; nobody else in the seed set does. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
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

export function renderReports(repositories: MockRepositories, path = '/reports') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <ReportClockBase.Provider value={WALKTHROUGH_NOW}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/reports" element={<ReportsScreen />} />
              <Route path="/reports/:key" element={<ReportScreen />} />
              <Route path="/customers/:id" element={<h1>Customer file</h1>} />
            </Routes>
          </MemoryRouter>
        </ReportClockBase.Provider>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
