/**
 * The read the compliance screen opens with — the same shape as
 * `useEnsureConfig` and `useEnsureMarket`, so all three sections can ask on
 * mount without coordinating and the screen renders loading, error and ready
 * honestly.
 */

import { useEffect } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import type { ConfigReadState } from '../shared'
import { useComplianceStore } from './compliance-store'

export function useEnsureCompliance(): ConfigReadState {
  const repositories = useRepositories()
  const status = useComplianceStore((state) => state.status)
  const error = useComplianceStore((state) => state.error)
  const hydrate = useComplianceStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate(repositories)
  }, [hydrate, repositories])

  return { status, error, ready: status === 'ready' }
}
