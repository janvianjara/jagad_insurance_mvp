/**
 * The harness the endorsement tests render through.
 *
 * It builds the real mock repositories and hydrates the session the way the
 * shell does at boot, so a scenario reads as "sign in as this person, open this
 * address, do this". No fixture is imported by a component and no test reaches
 * past a repository.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { EndorsementCaptureScreen } from './EndorsementCaptureScreen'
import { EndorsementDetailScreen } from './EndorsementDetailScreen'
import { EndorsementQueueScreen } from './EndorsementQueueScreen'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  sneha: 'usr-sneha-patel',
} as const

/** The fixture endorsements this module's scenarios walk. */
export const ENDORSEMENT = {
  /** Non-financial: a nominee's name spelt wrong. Carries no money, ever. */
  correction: 'end-0031',
  /** Financial, waiting on the delta off the insurer's advice. */
  deltaAwaited: 'end-0032',
  /** Cancellation sitting on the claims-in-period check. */
  cancellation: 'end-0033',
  /** Financial, approved and versioned with both endorsement numbers. */
  versioned: 'end-0035',
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

export function renderEndorsements(repositories: MockRepositories, path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/endorsements" element={<EndorsementQueueScreen />} />
            <Route path="/endorsements/new" element={<EndorsementCaptureScreen />} />
            <Route path="/endorsements/:id" element={<EndorsementDetailScreen />} />
            <Route path="/policies/new" element={<h1>Policy entry</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
