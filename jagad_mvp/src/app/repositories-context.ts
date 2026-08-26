/**
 * The data seam. Kept apart from the provider component so a module that only
 * needs the hook does not drag a component export along with it — the same
 * split `src/ui/surface/toast-context.ts` uses.
 */

import { createContext, useContext } from 'react'
import type { Repositories } from '../data/repo'

export const RepositoriesContext = createContext<Repositories | null>(null)

/**
 * Throws rather than returning null. A screen that renders an empty queue
 * because its provider is missing is a screen that lies about the work.
 */
export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext)
  if (!repositories) {
    throw new Error('useRepositories must be used inside <RepositoriesProvider>.')
  }
  return repositories
}
