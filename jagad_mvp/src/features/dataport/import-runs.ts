/**
 * The import ledger — plan §7's "feature drafts: one Zustand slice per feature".
 *
 * A receipt that is only a toast is a receipt nobody can produce again. The
 * question an agency operator gets asked is "who loaded these four hundred
 * customers, when, and where did the six that failed go", and a product that
 * cannot answer it makes the person who ran the import personally responsible
 * for remembering. So every run is recorded: what was imported, by whom, from
 * which file, how many rows landed, how many were skipped and how many failed.
 *
 * It lives in a store rather than behind a repository for the same reason the
 * configuration working set does — there is no write API in the MVP's data
 * layer for a run ledger, and inventing one for this feature alone would be a
 * change to the shared repository interface. When one lands, `record` gains an
 * `await` and no screen changes.
 */

import { create } from 'zustand'

export type ImportRun = {
  readonly id: string
  readonly specKey: string
  readonly specLabel: string
  readonly fileName: string
  /** ISO instant. */
  readonly at: string
  readonly byId: string
  readonly byName: string
  /** Rows the file held, blanks excluded. */
  readonly rows: number
  readonly created: number
  /** Duplicates and anything the operator chose not to create. */
  readonly skipped: number
  readonly failed: number
}

export type ImportRunState = {
  readonly runs: readonly ImportRun[]
  record(run: ImportRun): void
  reset(): void
}

/** Newest first, and capped: this is a demo ledger, not an audit database. */
const MAX_RUNS = 50

export const useImportRunStore = create<ImportRunState>((set) => ({
  runs: [],
  record: (run) => set((state) => ({ runs: [run, ...state.runs].slice(0, MAX_RUNS) })),
  reset: () => set({ runs: [] }),
}))

/**
 * The batch reference a run is known by.
 *
 * It is written into every policy's `migrated` provenance, so a record on the
 * books can be traced back to the upload it came from — which is the difference
 * between a migration you can audit and a migration you have to trust.
 */
export function newRunId(now: Date, sequence: number): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `IMP-${stamp}-${String(sequence + 1).padStart(3, '0')}`
}
