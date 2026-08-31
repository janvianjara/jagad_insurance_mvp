/**
 * The clock the vault reads.
 *
 * An access log entry is stamped with an instant, and a test that asserts "this
 * open was recorded at 09:30" cannot do so against the wall clock. So the base
 * is a context value: `null` — the default — means the wall clock, which is what
 * the running app uses, and a test supplies a fixed date and gets the same
 * entry every run.
 */

import { createContext, useContext } from 'react'

export const DocumentClockBase = createContext<Date | null>(null)

export function useDocumentNow(): Date {
  return useContext(DocumentClockBase) ?? new Date()
}
