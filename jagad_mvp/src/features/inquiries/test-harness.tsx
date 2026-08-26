/**
 * The harness the inquiry tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and pins the module's clock — so a scenario reads as "sign in as
 * this person, open this address, do this" and nothing about the assertions
 * depends on the wall clock or on a fixture import in a component.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { InquiryClockBase, useInquiryClockStore } from './clock'
import { InquiryCaptureScreen } from './InquiryCaptureScreen'
import { InquiryDetailScreen } from './InquiryDetailScreen'
import { InquiryQueueScreen } from './InquiryQueueScreen'

/** The instant the story cast is written against, so the seeded TATs mean what they say. */
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
  useInquiryClockStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

/** What `useSessionBoot` does in the shell, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderInquiries(
  repositories: MockRepositories,
  path: string,
  now: Date = WALKTHROUGH_NOW,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <InquiryClockBase value={now}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/inquiries" element={<InquiryQueueScreen />} />
              <Route path="/inquiries/new" element={<InquiryCaptureScreen />} />
              <Route path="/inquiries/:id" element={<InquiryDetailScreen />} />
              <Route path="/quotations/new" element={<h1>Quotation composer</h1>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </InquiryClockBase>
    </RepositoriesProvider>,
  )
}
