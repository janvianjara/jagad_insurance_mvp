/**
 * What a feed entry is, kept out of the component file.
 *
 * A module that exports a component may not also export constants — fast
 * refresh, and it is lint-enforced across this codebase.
 *
 * The four kinds are the prototype's two attribution lines plus the person's own
 * turn: `Assistant` for anything asked for, `Assistant · noticed just now` for
 * anything a threshold raised (FR-22.8), and `You` for the chip they pressed.
 */

export const TURN_KINDS = {
  /** The generated opening briefing (FR-22.1). */
  briefing: 'briefing',
  /** The person's own turn. */
  question: 'question',
  /** An answer to something they asked. */
  answer: 'answer',
  /** Raised by a threshold, not by a request (FR-22.8). */
  notice: 'notice',
} as const

export type TurnKind = (typeof TURN_KINDS)[keyof typeof TURN_KINDS]
