/**
 * When the platform is allowed to speak — FR-21, FR-08.4.
 *
 * These numbers were written down in `src/features/kyc/chase-rules.ts` with a
 * note saying nothing read them because no scheduler existed. The scheduler
 * exists now, and `src/domain` cannot import a feature, so the definition moves
 * here and `chase-rules.ts` re-exports it.
 *
 * That direction matters. The alternative — a second copy of quiet hours in the
 * worker — is how a customer gets a 2 a.m. WhatsApp from the renewal ladder and
 * nothing from the consent chase, both behaving exactly as configured. One
 * definition, imported by both, is the only version of this that stays true after
 * somebody widens one of them.
 */

export const CONSENT_CADENCE = {
  /** One link window. A resend before the last link expires is two live links. */
  resendAfterDays: 7,
  /** After this many, chasing is a person's job rather than a button's. */
  maxAttempts: 3,
  /**
   * Local hours to stay silent between, as [start, end) across midnight: quiet
   * from 21:00 until 09:00. Read by `inQuietHours` below and by nothing else.
   */
  quietHours: [21, 9],
} as const

const DAY_MS = 86_400_000

/**
 * Whether an instant falls inside the quiet window.
 *
 * The window wraps midnight, which is the whole reason this is a function rather
 * than a comparison written at each call site: `hour >= 21 && hour < 9` is never
 * true, and it is the kind of wrong that tests clean and ships silent.
 *
 * The hour is read in the runtime's local zone deliberately. Quiet hours are a
 * fact about the person receiving the message, and this is a single-tenant
 * product whose staff and customers share one.
 */
export function inQuietHours(at: Date, window: readonly number[] = CONSENT_CADENCE.quietHours): boolean {
  const [start, end] = window
  if (start === undefined || end === undefined) return false

  const hour = at.getHours()
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}

/**
 * The next instant outside the quiet window, or the one given when it is already
 * outside it. A held message is delayed to the edge of the window rather than
 * dropped: FR-21 defers a send, it does not cancel one.
 */
export function afterQuietHours(
  at: Date,
  window: readonly number[] = CONSENT_CADENCE.quietHours,
): Date {
  if (!inQuietHours(at, window)) return at

  const [, end] = window
  if (end === undefined) return at

  const next = new Date(at)
  next.setHours(end, 0, 0, 0)
  // Past the window's end already means the window wrapped midnight and we are
  // on the late side of it, so the release is tomorrow morning rather than today.
  return next.getTime() <= at.getTime() ? new Date(next.getTime() + DAY_MS) : next
}
