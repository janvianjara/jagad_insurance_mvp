/**
 * The harness the policy tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and pins the clock — so a scenario reads as "sign in as this
 * person, open this address, do this" and no assertion depends on the wall clock
 * or on a fixture import inside a component.
 *
 * The fixture ids are named here rather than typed into each test, because six
 * of them carry the specific shape a canvas row needs and a test that hard-codes
 * `pol-draft-0224` says nothing about why that one.
 */

import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import { ToastProvider } from '../../ui/surface'
import { useMarketStore } from '../config/shared'
import PolicyDetailScreen from './PolicyDetailScreen'
import PolicyDraftsScreen from './PolicyDraftsScreen'
import PolicyEntryScreen from './PolicyEntryScreen'
import PolicyQueueScreen from './PolicyQueueScreen'

/** The instant the story cast is written against. */
export const WALKTHROUGH_NOW = new Date('2026-08-26T09:30:00.000Z')

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
  kiran: 'usr-kiran-solanki',
  priya: 'usr-priya-desai',
  nita: 'usr-nita-shah',
  meera: 'usr-meera-joshi',
} as const

/**
 * The fixture rows P-15's scenarios are written against, each chosen for the
 * one thing it can prove.
 */
export const CAST = {
  /** Falguni Shah, KYC complete. `draft`, proposal path, entered off deal APP-0774. */
  proposalDraft: 'pol-draft-0219',
  /** Hitesh Mehta, KYC PENDING. Already `sent`, so only the KYC gate can refuse. */
  kycPendingSent: 'pol-draft-0224',
  /** Nilesh Bhatt, KYC complete. `draft` on the DIRECT path — it skips proposal. */
  directDraft: 'pol-draft-0230',
  /** Rakesh Patel's issued floater, with the insurer's own number on it. */
  issued: 'pol-4388',

  /** The deal `/policies/new?dealId=` pre-populates from. Two Tata AIG line items. */
  deal: 'app-0774',
  /** The deal with no line items, which §9 blocks. */
  emptyDeal: 'app-0775',

  /** A recorded on-field cheque against POL-4388. A bounce can be marked here. */
  chequeCollection: 'col-0001',
  /** A `pending` collection against POL-DRAFT-0224. The payment fork starts here. */
  pendingCollection: 'col-0002',

  falguni: 'cus-falguni-shah',
  hitesh: 'cus-hitesh-mehta',
  nilesh: 'cus-nilesh-bhatt',
  rakesh: 'cus-rakesh-patel',
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

/**
 * Renders a node inside the providers a policy screen expects, at an address.
 *
 * Component-level tests pass the component; the route-level tests in
 * `policy-routes.test.tsx` pass a `<Routes>` tree instead. Both get the same
 * providers, which is the point of having one harness.
 */
export function renderInApp(
  repositories: MockRepositories,
  node: ReactNode,
  path = '/policies',
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

/**
 * The three P-15 screens behind their real addresses.
 *
 * A route tree rather than a bare component, because half of what this step
 * promises happens *between* screens: `?dealId=` is read off the address, a
 * part-finished entry is meant to land on the completion queue, and a finished
 * one opens the policy's own file. A test that mounted one component could
 * assert none of that.
 *
 * `/policies/:id` is a stub here on purpose. The policy file is its own screen,
 * and a scenario about entry should fail when entry breaks rather than when the
 * detail screen does.
 *
 * The market store is reset alongside the session, for the same reason
 * `freshRepositories` resets the session: it is module state that outlives a
 * render, and a scope left over from the previous test would decide what the
 * next one is offered.
 */
export function renderPolicies(repositories: MockRepositories, path: string) {
  useMarketStore.getState().reset()

  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/policies" element={<PolicyQueueScreen />} />
            <Route path="/policies/new" element={<PolicyEntryScreen />} />
            <Route path="/policies/:id" element={<h1>Policy file</h1>} />
            <Route path="/back-office/drafts" element={<PolicyDraftsScreen />} />
            <Route path="/deals" element={<h1>Deals</h1>} />
            <Route path="/deals/:id" element={<h1>Deal</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

/**
 * The policy file itself, at its own address, with the real screen behind it.
 *
 * Kept apart from `renderPolicies` deliberately. That tree stubs `/policies/:id`
 * so an entry scenario fails when entry breaks; this one mounts the file so a
 * scenario about the file fails when the file breaks. One harness, two trees,
 * and neither test can be broken by the screen it is not about.
 */
export function renderPolicyFile(repositories: MockRepositories, policyId: string) {
  useMarketStore.getState().reset()

  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/policies/${policyId}`]}>
          <Routes>
            <Route path="/policies" element={<h1>Policies</h1>} />
            <Route path="/policies/:id" element={<PolicyDetailScreen />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}
