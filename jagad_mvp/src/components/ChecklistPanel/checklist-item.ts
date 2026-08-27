/**
 * One line of a document checklist.
 *
 * The checklist itself is configuration — `DocChecklist` on the company or the
 * product (plan §8) — so this type carries a resolved line rather than the rule
 * that produced it. `present` is presence, never content: §14.1 lets a screen
 * (and the Assistant projection) know a document exists, and nothing here holds
 * a file name, an extraction or a word of what it says.
 */

import type { Tone } from '../../ui/tone'

export const CHECKLIST_STATES = {
  outstanding: 'outstanding',
  received: 'received',
  verified: 'verified',
  rejected: 'rejected',
} as const

export type ChecklistState = (typeof CHECKLIST_STATES)[keyof typeof CHECKLIST_STATES]

export const CHECKLIST_STATE_READING: Readonly<
  Record<ChecklistState, { label: string; tone: Tone }>
> = {
  outstanding: { label: 'Outstanding', tone: 'attn' },
  received: { label: 'Received', tone: 'warn' },
  verified: { label: 'Verified', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
}

export type ChecklistItem = {
  readonly key: string
  /** The checklist's own wording, from configuration. Never rewritten here. */
  readonly label: string
  readonly state: ChecklistState
  /** One line of context — who supplied it, when, why it was rejected. */
  readonly note?: string
}

/** Received or verified both count as on file; only outstanding blocks. */
export function isOnFile(item: ChecklistItem): boolean {
  return item.state === CHECKLIST_STATES.received || item.state === CHECKLIST_STATES.verified
}

export function outstandingItems(items: readonly ChecklistItem[]): readonly ChecklistItem[] {
  return items.filter((item) => !isOnFile(item))
}

/** "3 of 4 on file". The number a completeness gate is read against. */
export function checklistProgress(items: readonly ChecklistItem[]): {
  readonly onFile: number
  readonly total: number
  readonly complete: boolean
} {
  const onFile = items.filter(isOnFile).length
  return { onFile, total: items.length, complete: items.length > 0 && onFile === items.length }
}
