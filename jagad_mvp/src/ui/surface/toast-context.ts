import { createContext, useContext } from 'react'
import type { Tone } from '../tone'

export type ToastAction = {
  label: string
  onAction: () => void
}

export type ToastInput = {
  /** One line. What happened, in the past tense. */
  title: string
  /** Optional second line: the record it happened to, or why it did not. */
  detail?: string
  tone?: Tone
  /** Milliseconds on screen. Pass 0 to make the toast stay until dismissed. */
  duration?: number
  action?: ToastAction
}

export type ToastRecord = ToastInput & { id: string }

export type ToasterApi = {
  /** Puts a toast on screen and returns its id. */
  notify: (toast: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const ToasterContext = createContext<ToasterApi | null>(null)

/**
 * Reaches the toaster from anywhere under `<ToastProvider>`.
 *
 * Throws rather than no-oping when the provider is missing: a receipt that
 * silently fails to appear is exactly the failure mode a receipt exists to
 * prevent.
 */
export function useToaster(): ToasterApi {
  const api = useContext(ToasterContext)
  if (!api) throw new Error('useToaster must be used inside <ToastProvider>.')
  return api
}
