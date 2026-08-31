/**
 * The harness the renewal tests render through. Same shape as the claims one:
 * real repositories, a hydrated session, and the module's three routes.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { RenewalClockBase } from './clock'
import { InstalmentScreen } from './InstalmentScreen'
import { RenewalDetailScreen } from './RenewalDetailScreen'
import { RenewalPoolScreen } from './RenewalPoolScreen'

/**
 * The instant the story cast is written against, so the seeded expiries mean
 * what they say: POL-4437 expires in two days, Jayesh Kapadia's grace window
 * closes on 8 September.
 *
 * This is `FIXTURE_NOW` from `src/data/fixtures/clock.ts`, written out rather
 * than imported because `react-refresh/only-export-components` refuses a
 * re-exported binding here and every other harness in the build states it the
 * same way. Move one and this module's scenarios fail loudly on records that no
 * longer line up, which is the failure mode worth having.
 */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

export const WHO = {
  vivek: 'usr-vivek-jagad',
  sneha: 'usr-sneha-patel',
  kiran: 'usr-kiran-solanki',
} as const

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY, now: () => WALKTHROUGH_NOW })
}

export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderRenewals(
  repositories: MockRepositories,
  path: string,
  now: Date = WALKTHROUGH_NOW,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <RenewalClockBase value={now}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/renewals" element={<RenewalPoolScreen />} />
              <Route path="/renewals/instalments" element={<InstalmentScreen />} />
              <Route path="/renewals/:id" element={<RenewalDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </RenewalClockBase>
    </RepositoriesProvider>,
  )
}
