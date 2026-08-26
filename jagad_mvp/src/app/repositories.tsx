import { useState } from 'react'
import type { ReactNode } from 'react'
import { createMockRepositories } from '../data/mock'
import type { Repositories } from '../data/repo'
import { RepositoriesContext } from './repositories-context'

/**
 * The composition root for data — plan §7, "Repository interfaces returning
 * Promises, with a mock adapter behind them."
 *
 * This is the one file in the app that knows the mock adapter exists. Everything
 * below it takes `Repositories`, an interface, so swapping in an HTTP adapter is
 * a change here and nowhere else. It is also the seam every test uses: a test
 * builds its own store with no latency, wraps the tree in this provider, and
 * gets the same screens the app runs with no fixture import anywhere in sight.
 */
export function RepositoriesProvider({
  repositories,
  children,
}: {
  /** Omit in the app; pass one in tests. */
  repositories?: Repositories
  children: ReactNode
}) {
  // Built once per provider, not per render: the mock store holds the whole
  // in-memory database and rebuilding it would silently discard every mutation.
  const [fallback] = useState<Repositories>(() => repositories ?? createMockRepositories())

  return <RepositoriesContext value={repositories ?? fallback}>{children}</RepositoriesContext>
}
