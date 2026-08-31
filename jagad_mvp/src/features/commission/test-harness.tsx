/**
 * The harness the money-screen tests render through.
 *
 * It builds the real mock repositories, hydrates the session the way the shell
 * does at boot, and mounts a screen behind its own address. Drawers open into
 * the page rather than into the shell's drawer slot, because there is no shell
 * here - `<WorkQueue>` renders one inline when no slot is provided, which is the
 * same tree with one fewer portal.
 *
 * Nothing here imports a fixture. Every record is reached through a repository,
 * exactly as a screen reaches it, so an assertion that the screen agrees with
 * the book cannot quietly become an assertion that it agrees with a copy.
 */

import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import { RepositoriesProvider } from '../../app/repositories'
import { resolveAccount, useSessionStore } from '../../app/store'
import type { User } from '../../domain/permissions'
import { ToastProvider } from '../../ui/surface'
import LedgerQueueScreen from './LedgerQueueScreen'
import PayoutQueueScreen from './PayoutQueueScreen'

/** The story cast, as the fixtures set it. */
export const WHO = {
  /** Admin. The whole business, so `all` scope on every resource. */
  vivek: 'usr-vivek-jagad',
  /** Agent. `{ level: 'own', includeSubAgents: true }` on commission. */
  kiran: 'usr-kiran-solanki',
  /** Sub-agent reporting to Kiran. No commission grant at all; wallet only. */
  meera: 'usr-meera-joshi',
  /** Back office. No commission grant, and no agent record either. */
  priya: 'usr-priya-desai',
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

/** One resolved account, for calling the desk directly in an assertion. */
export async function viewerFor(
  repositories: MockRepositories,
  userId: string,
): Promise<User> {
  const staff = await repositories.config.users()
  const person = staff.find((row) => row.id === userId)
  if (!person) throw new Error(`No staff account ${userId} in the fixture set.`)
  return resolveAccount(person).user
}

export function renderAt(
  repositories: MockRepositories,
  path: string,
  routePath: string,
  element: ReactElement,
) {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </RepositoriesProvider>,
  )
}

export function renderLedger(repositories: MockRepositories, path = '/commission/ledger') {
  return renderAt(repositories, path, '/commission/ledger', <LedgerQueueScreen />)
}

export function renderPayouts(repositories: MockRepositories, path = '/commission/payouts') {
  return renderAt(repositories, path, '/commission/payouts', <PayoutQueueScreen />)
}
