/**
 * The read every market and channel screen opens with.
 *
 * Same shape as `useEnsureConfig`, and for the same reason: the five screens and
 * every drawer inside them ask on mount without coordinating, the store answers
 * once, and the screen renders loading, error and ready honestly rather than
 * flashing an empty list while the repositories are still talking.
 */

import { useEffect } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import type { ConfigReadState } from './use-config'
import { useMarketStore } from './market-store'

export function useEnsureMarket(): ConfigReadState {
  const repositories = useRepositories()
  const status = useMarketStore((state) => state.status)
  const error = useMarketStore((state) => state.error)
  const hydrate = useMarketStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate(repositories)
  }, [hydrate, repositories])

  return { status, error, ready: status === 'ready' }
}
