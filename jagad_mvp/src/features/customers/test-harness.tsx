/**
 * The harness the customer, KYC and consent tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and pins the clock — so a scenario reads as "sign in as this
 * person, open this address, do this" and nothing about the assertions depends
 * on the wall clock or on a fixture import in a component.
 *
 * The consent page is registered in the same router on purpose. Canvas 3.1 is
 * one story across two surfaces — the back office collects what it can, the
 * customer supplies the rest — and the test has to be able to walk both. The
 * page still holds no session: it simply does not read the store the harness
 * hydrated, which is exactly the property `consent-isolation.test.ts` proves
 * structurally.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import ConsentTokenScreen from '../consent/ConsentTokenScreen'
import { KycQueueScreen } from '../kyc'
import { CustomerClockBase } from './clock'
import { Customer360Screen } from './Customer360Screen'
import { CustomerListScreen } from './CustomerListScreen'

/** The instant the story cast is written against, so the seeded expiries mean what they say. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
  kiran: 'usr-kiran-solanki',
  priya: 'usr-priya-desai',
} as const

/** The walkthrough record: KYC in progress, consent link out and unanswered. */
export const RAKESH = 'cus-rakesh-patel'

export function freshRepositories(): MockRepositories {
  useSessionStore.getState().reset()
  window.localStorage.clear()
  return createMockRepositories({ latency: NO_LATENCY, now: () => WALKTHROUGH_NOW })
}

/** What `useSessionBoot` does in the shell, without the shell. */
export async function signIn(repositories: MockRepositories, userId: string): Promise<void> {
  const staff = await repositories.config.users()
  useSessionStore
    .getState()
    .hydrate(staff.filter((person) => person.active).map(resolveAccount), userId)
}

export function renderCustomers(
  repositories: MockRepositories,
  path: string,
  now: Date = WALKTHROUGH_NOW,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <CustomerClockBase value={now}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/customers" element={<CustomerListScreen />} />
              <Route path="/customers/:id" element={<Customer360Screen />} />
              <Route path="/back-office/kyc" element={<KycQueueScreen />} />
              <Route path="/consent/:token" element={<ConsentTokenScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </CustomerClockBase>
    </RepositoriesProvider>,
  )
}
