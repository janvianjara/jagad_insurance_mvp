/**
 * The harness the portal tests render through.
 *
 * It builds the real mock repositories, pins the clock so an expiry and a
 * renewal window read the same on every run, and mounts the five portal routes
 * under the portal's own shell — which is the arrangement the router is asked to
 * wire, so a test walks the pages the way a person does.
 *
 * What it deliberately does NOT do is hydrate a session. The staff harnesses
 * call `signIn` before rendering; this one has nothing to sign in to, and adding
 * it would quietly make the portal depend on the store §11.1 keeps it away from.
 * No fixture is imported here or in any screen: every record arrives through a
 * repository.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { CustomerClockBase } from '../customers/clock'
import PortalShell from './PortalShell'
import PortalOverviewScreen from './PortalOverviewScreen'
import PortalPoliciesScreen from './PortalPoliciesScreen'
import PortalDocumentsScreen from './PortalDocumentsScreen'
import PortalClaimsScreen from './PortalClaimsScreen'
import PortalClaimNewScreen from './PortalClaimNewScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/**
 * The two customers these tests turn on.
 *
 * Rakesh Patel holds three policies in force, three claims and an unanswered
 * consent link — the fullest file on the cast. Falguni Shah is the control: a
 * different person entirely, whose records must never appear on his pages.
 */
export const WHO = {
  rakesh: 'cus-rakesh-patel',
  falguni: 'cus-falguni-shah',
} as const

/** Numbers belonging to each, used to assert the scope holds. */
export const NUMBERS = {
  rakeshPolicy: 'POL-4388',
  rakeshClaim: 'CLM-0412',
  falguniPolicy: 'POL-4441',
  falguniLapsedPolicy: 'POL-4377',
  falguniClaim: 'CLM-0419',
} as const

export function freshRepositories(): MockRepositories {
  return createMockRepositories({ latency: NO_LATENCY })
}

/** `/portal` for one customer, or the picker when `customerId` is null. */
export function portalPath(path: string, customerId: string | null): string {
  return customerId === null ? path : `${path}?as=${customerId}`
}

export function renderPortal(repositories: MockRepositories, path: string) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <CustomerClockBase.Provider value={WALKTHROUGH_NOW}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/portal" element={<PortalShell />}>
              <Route index element={<PortalOverviewScreen />} />
              <Route path="policies" element={<PortalPoliciesScreen />} />
              <Route path="documents" element={<PortalDocumentsScreen />} />
              <Route path="claims" element={<PortalClaimsScreen />} />
              <Route path="claims/new" element={<PortalClaimNewScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CustomerClockBase.Provider>
    </RepositoriesProvider>,
  )
}
