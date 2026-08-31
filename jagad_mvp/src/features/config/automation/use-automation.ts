/**
 * The read the automation screen opens with — the same shape as
 * `useEnsureConfig` and `useEnsureMarket`, so the screen renders loading, error
 * and ready honestly rather than flashing an empty list.
 */

import { useEffect } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import type { ConfigReadState } from '../shared'
import { useAutomationStore } from './automation-store'

export function useEnsureAutomation(): ConfigReadState {
  const repositories = useRepositories()
  const status = useAutomationStore((state) => state.status)
  const error = useAutomationStore((state) => state.error)
  const hydrate = useAutomationStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate(repositories.config)
  }, [hydrate, repositories])

  return { status, error, ready: status === 'ready' }
}
