/**
 * Which proactive notices this person has already waved away.
 *
 * A feature slice rather than a session slice (plan §7 keeps feature drafts out
 * of the session store). It holds dismissals and nothing else: the notices
 * themselves are derived from the projection on every render, so there is no
 * cached copy of the data to fall out of step with the queue.
 *
 * Dismissal is keyed on the notice id, which `notice-rules.ts` derives from the
 * rule plus the subjects that matched. That is what makes dismissal survive a
 * navigation and a re-evaluation while still letting a genuinely new fact — a
 * third claim crossing thirty days — raise itself again.
 *
 * Nothing here writes to a record. Dismissing a notice is not a mutation of the
 * business, so it needs no confirmation gate; the work it pointed at is exactly
 * where it was.
 */

import { create } from 'zustand'

export type NoticesState = {
  readonly dismissed: readonly string[]
  dismiss(id: string): void
  restoreAll(): void
}

export const useNoticesStore = create<NoticesState>((set, get) => ({
  dismissed: [],

  dismiss(id) {
    if (get().dismissed.includes(id)) return
    set((state) => ({ dismissed: [...state.dismissed, id] }))
  },

  restoreAll() {
    set({ dismissed: [] })
  },
}))
