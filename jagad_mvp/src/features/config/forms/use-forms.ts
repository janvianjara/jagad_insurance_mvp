/**
 * The read the form builder opens with — same shape as `useEnsureConfig` and
 * `useEnsureMarket`, for the same reason: the screen, its queue and its drawer
 * all ask on mount without coordinating, and the store answers once.
 */

import { useEffect } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import type { ConfigReadState } from '../shared'
import { useFormsStore } from './forms-store'

export function useEnsureForms(): ConfigReadState {
  const repositories = useRepositories()
  const status = useFormsStore((state) => state.status)
  const error = useFormsStore((state) => state.error)
  const hydrate = useFormsStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate(repositories.config)
  }, [hydrate, repositories])

  return { status, error, ready: status === 'ready' }
}
