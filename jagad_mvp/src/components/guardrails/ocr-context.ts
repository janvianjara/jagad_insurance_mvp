/**
 * The registry a form keeps of the extractions inside it.
 *
 * Every `<OcrField>` reports itself here on mount and reports again whenever a
 * person confirms it. The form asks one question of the result — is anything
 * still unconfirmed — and refuses to submit while the answer is yes (FR-16, U10).
 *
 * Lives in a `.ts` file of its own because a module that exports a context
 * cannot also export a component (fast refresh, lint-enforced).
 */
import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'

export type OcrRegistry = Readonly<Record<string, boolean>>

export const EMPTY_REGISTRY: OcrRegistry = {}

export type OcrRegistryAction =
  | { kind: 'report'; name: string; confirmed: boolean }
  | { kind: 'release'; name: string }

/**
 * Reducer rather than plain state on purpose: React guarantees `dispatch` keeps
 * its identity for the life of the component, so a field can list it in an effect
 * dependency array without the registration effect re-firing every render.
 */
export function ocrRegistryReducer(state: OcrRegistry, action: OcrRegistryAction): OcrRegistry {
  if (action.kind === 'release') {
    if (!(action.name in state)) return state
    const next = { ...state }
    delete next[action.name]
    return next
  }

  if (state[action.name] === action.confirmed) return state
  return { ...state, [action.name]: action.confirmed }
}

export function unconfirmedNames(registry: OcrRegistry): string[] {
  return Object.keys(registry).filter((name) => !registry[name])
}

export type OcrFormApi = {
  /** How a field registers, re-registers and deregisters itself. */
  notify: Dispatch<OcrRegistryAction>
  /** Names of the fields still carrying an unconfirmed extraction. */
  unconfirmed: readonly string[]
  /** False while any extraction is unconfirmed. The form's submit refuses on it. */
  canSubmit: boolean
}

export const OcrFormContext = createContext<OcrFormApi | null>(null)

/** The surrounding OCR form, or null when a field is used on its own. */
export function useOcrForm(): OcrFormApi | null {
  return useContext(OcrFormContext)
}
