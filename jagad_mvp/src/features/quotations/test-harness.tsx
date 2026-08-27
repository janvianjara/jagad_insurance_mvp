/**
 * The harness the quotation tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and pins the clock — so a scenario reads as "sign in as this
 * person, open this address, do this" and no assertion depends on the wall clock
 * or on a fixture import inside a component.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { DealQueueScreen } from './DealQueueScreen'
import { DealScreen } from './DealScreen'
import { QuotationComposerScreen } from './QuotationComposerScreen'
import { QuotationNewScreen } from './QuotationNewScreen'
import { QuotationQueueScreen } from './QuotationQueueScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
  kiran: 'usr-kiran-solanki',
  nita: 'usr-nita-shah',
  meera: 'usr-meera-joshi',
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

export function renderQuotations(repositories: MockRepositories, path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/quotations" element={<QuotationQueueScreen />} />
            <Route path="/quotations/new" element={<QuotationNewScreen />} />
            <Route path="/quotations/:id" element={<QuotationComposerScreen />} />
            <Route path="/quotations/:id/v/:version" element={<QuotationComposerScreen />} />
            <Route path="/deals" element={<DealQueueScreen />} />
            <Route path="/deals/:id" element={<DealScreen />} />
            <Route path="/policies/new" element={<h1>Policy entry</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
