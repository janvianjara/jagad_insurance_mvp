/**
 * The two hooks every configuration screen — and every later form — reaches for.
 *
 * `useEnsureConfig` is the read: it asks the repository for the configuration
 * once, no matter how many components ask, and reports the same three states
 * `useResource` does so a screen can render loading, error and ready honestly.
 *
 * `useMasterOptions` is what makes `<InlineMasterAdd>` worth building here. A
 * form that offers a master-backed field asks for its options by master key and
 * gets back only the *active* values, in the admin's order, narrowed to a parent
 * when the master cascades. The form never learns where they came from, so the
 * day masters move behind a real API this hook changes and no form does.
 */

import { useEffect } from 'react'
import { useRepositories } from '../../../app/repositories-context'
import type { SelectOption } from '../../../ui/form'
import type { ConfigMasterType, ConfigMasterValue, ConfigStatus } from './config-types'
import { useConfigStore } from './config-store'

export type ConfigReadState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  readonly ready: boolean
}

export function useEnsureConfig(): ConfigReadState {
  const repositories = useRepositories()
  const status = useConfigStore((state) => state.status)
  const error = useConfigStore((state) => state.error)
  const hydrate = useConfigStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate(repositories.config)
  }, [hydrate, repositories])

  return { status, error, ready: status === 'ready' }
}

export type MasterOptions = {
  readonly type: ConfigMasterType | null
  /** Active values only, in the order configuration puts them in. */
  readonly values: readonly ConfigMasterValue[]
  readonly options: readonly SelectOption[]
  /** The parent master, when this one cascades from another (Make to Model). */
  readonly parentType: ConfigMasterType | null
}

export function useMasterOptions(
  masterTypeKey: string,
  parentValueId?: string | null,
): MasterOptions {
  const masterTypes = useConfigStore((state) => state.masterTypes)
  const masterValues = useConfigStore((state) => state.masterValues)

  const type = masterTypes.find((candidate) => candidate.key === masterTypeKey) ?? null
  const parentType = type?.parentTypeId
    ? (masterTypes.find((candidate) => candidate.id === type.parentTypeId) ?? null)
    : null

  const values = type
    ? masterValues
        .filter((value) => value.masterTypeId === type.id && value.active)
        // A cascading master shows only the children of the chosen parent; with
        // no parent chosen it offers nothing, which is the honest answer.
        .filter((value) =>
          parentType
            ? value.parentValueId !== null && value.parentValueId === (parentValueId ?? null)
            : true,
        )
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
    : []

  return {
    type,
    parentType,
    values,
    options: values.map((value) => ({ value: value.key, label: value.label })),
  }
}
