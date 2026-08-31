/**
 * The code challenge's arithmetic — plan §4's `/login/2fa`, FR-18.
 *
 * There is no authenticator in this build and this module does not pretend
 * there is one. What it owns is the part that is real regardless of who checks
 * the code: what a six-digit entry is, what counts as a legible attempt, how
 * many attempts the challenge allows, and when it is spent.
 *
 * `verify` therefore checks the shape of the code and nothing else, and the
 * screen says so in plain words. A fake secret that only the front end knows
 * would be a worse lie than an honest sentence.
 */

export const CODE_LENGTH = 6

/**
 * How many refusals the challenge absorbs before it locks. Three is the number
 * the sign-in screen states out loud; it is a constant here rather than a
 * literal in the screen so the sentence and the behaviour cannot drift.
 */
export const MAX_ATTEMPTS = 3

export const CHALLENGE_RESULTS = {
  accepted: 'accepted',
  refused: 'refused',
  locked: 'locked',
} as const

export type ChallengeResult = (typeof CHALLENGE_RESULTS)[keyof typeof CHALLENGE_RESULTS]

export type ChallengeVerdict = {
  readonly result: ChallengeResult
  /** Attempts spent after this submission, including it. */
  readonly attemptsUsed: number
  readonly attemptsLeft: number
  /** Null when the code was accepted. */
  readonly message: string | null
}

/** Digits only, capped at the code length. Used for typing and for paste alike. */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isComplete(code: string): boolean {
  return digitsOf(code).length === CODE_LENGTH
}

/**
 * Applies one submission to the attempt count.
 *
 * `attemptsUsed` is what the caller has already spent. A submission that is not
 * six digits is a refusal like any other and costs an attempt: an authenticator
 * would have rejected it too, and a challenge that only counted the failures it
 * found interesting would lock at a number nobody could predict.
 */
export function verify(code: string, attemptsUsed: number): ChallengeVerdict {
  if (attemptsUsed >= MAX_ATTEMPTS) {
    return {
      result: CHALLENGE_RESULTS.locked,
      attemptsUsed,
      attemptsLeft: 0,
      message: lockMessage(),
    }
  }

  if (isComplete(code)) {
    return {
      result: CHALLENGE_RESULTS.accepted,
      attemptsUsed,
      attemptsLeft: MAX_ATTEMPTS - attemptsUsed,
      message: null,
    }
  }

  const spent = attemptsUsed + 1
  const left = MAX_ATTEMPTS - spent

  if (left <= 0) {
    return {
      result: CHALLENGE_RESULTS.locked,
      attemptsUsed: spent,
      attemptsLeft: 0,
      message: lockMessage(),
    }
  }

  return {
    result: CHALLENGE_RESULTS.refused,
    attemptsUsed: spent,
    attemptsLeft: left,
    message: `That code was not accepted. ${left === 1 ? 'One attempt' : `${left} attempts`} left before this challenge locks.`,
  }
}

export function lockMessage(): string {
  return `This challenge is locked after ${MAX_ATTEMPTS} refused codes. Go back to sign in and start again; in a live environment an administrator would have to unlock the account.`
}
