/**
 * The harness the sign-in tests render through.
 *
 * It builds the real mock repositories and mounts the two bare routes behind
 * their own addresses, with one addition the app does not need: a catch-all
 * route that prints wherever a successful sign-in landed. That is the only way
 * to assert the redirect without mounting the shell — and mounting the shell
 * here would defeat the point of §11.1, which is that these screens never reach
 * it.
 *
 * Nothing here imports a fixture. Every account is read through a repository,
 * exactly as the screen reads it.
 */

import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RepositoriesProvider } from '../../app/repositories'
import { useSessionStore } from '../../app/store'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import type { MockRepositories } from '../../data/mock'
import type { Repositories } from '../../data/repo'
import { useConfigStore } from '../config/shared/config-store'
import { LandingProbe } from './LandingProbe'
import SignInScreen from './SignInScreen'
import TwoFactorScreen from './TwoFactorScreen'

/** The story cast's staff ids, as the fixtures set them. */
export const WHO = {
  /** Admin. The two-factor matrix asks a code of this template at sign in. */
  vivek: 'usr-vivek-jagad',
  /** Agent, own customers only. No second factor, so it goes straight in. */
  kiran: 'usr-kiran-solanki',
  /** Sub-agent. No Assistant grant, so its landing is not the default one. */
  meera: 'usr-meera-joshi',
} as const

/**
 * A clean world: no session, and no two-factor policy recorded yet.
 *
 * Both stores are module singletons, so a test that did not reset them would
 * inherit the previous test's session and the policy this feature seeds on first
 * read. Resetting proves the seeding happens on the screen's own account rather
 * than by luck of test order.
 */
export function freshAuth(): MockRepositories {
  useSessionStore.getState().reset()
  useConfigStore.getState().reset()
  return createMockRepositories({ latency: NO_LATENCY })
}

export function renderAuth(repositories: Repositories, path = '/login') {
  return render(
    <RepositoriesProvider repositories={repositories}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<SignInScreen />} />
          <Route path="/login/2fa" element={<TwoFactorScreen />} />
          <Route path="*" element={<LandingProbe />} />
        </Routes>
      </MemoryRouter>
    </RepositoriesProvider>,
  )
}

/** The same repositories, with the staff read broken. For the error state. */
export function withBrokenStaffRead(repositories: MockRepositories, message: string): Repositories {
  return {
    ...repositories,
    config: {
      ...repositories.config,
      users: () => Promise.reject(new Error(message)),
    },
  }
}
