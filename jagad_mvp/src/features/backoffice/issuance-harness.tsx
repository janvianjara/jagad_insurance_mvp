/**
 * The harness the issuance tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts the queue behind its own address with the screens it
 * links to stubbed. Stubs rather than the real screens, deliberately: a test
 * about the issuance desk should fail when the issuance desk breaks, not when
 * the policy file does.
 *
 * The clock is pinned. "Waiting since" is a comparison against an instant, and
 * an unpinned one would drift a day every day.
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
import { CustomerClockBase } from '../customers/clock'
import IssuanceQueueScreen from './IssuanceQueueScreen'

/** The instant the walkthrough is written against, shared with the policy tests. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Back office — the desk this queue is for. Scope `all` on everything ops. */
  priya: 'usr-priya-desai',
  /** Admin — the whole business. */
  vivek: 'usr-vivek-jagad',
} as const

/**
 * The fixture policies these scenarios are written against, each chosen for the
 * one thing it can prove.
 */
export const CAST = {
  /** Dipika Shah. `proposal` — raised and not yet sent, so the send can be made. */
  raised: 'pol-draft-0227',
  /** Hitesh Mehta, KYC PENDING. Already `sent`, so a second send must be refused. */
  sent: 'pol-draft-0224',
  /** Rakesh Patel's issued floater, with the insurer's own number on it. */
  issued: 'pol-4388',
} as const

/** The references those policies carry, as §8 numbers them. */
export const REFERENCE = {
  raised: 'POL-DRAFT-0227',
  sent: 'POL-DRAFT-0224',
  issued: 'POL-4388',
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

export function renderIssuance(
  repositories: MockRepositories,
  path = '/back-office/issuance',
  now: Date = WALKTHROUGH_NOW,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <CustomerClockBase value={now}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/back-office/issuance" element={<IssuanceQueueScreen />} />
              <Route path="/back-office/ocr-review" element={<h1>OCR review</h1>} />
              <Route path="/policies/:policyId" element={<h1>Policy file</h1>} />
            </Routes>
          </MemoryRouter>
        </CustomerClockBase>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
