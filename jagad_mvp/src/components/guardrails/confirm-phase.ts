/**
 * The two phases of a gate, and the promise attached to each.
 *
 * A `const … as const` map rather than an enum (`erasableSyntaxOnly`), and in a
 * module of its own because a file that exports a component exports nothing else
 * (fast refresh, lint-enforced).
 */
export const CONFIRM_PHASES = {
  preview: 'Showing what will happen; nothing has been sent',
  done: 'The mutation was emitted; this is the receipt',
} as const

export type ConfirmPhase = keyof typeof CONFIRM_PHASES
