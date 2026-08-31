/**
 * What has already fired — FR-21.
 *
 * The engine is re-entrant by design: `dueTicks` asks "given these records and
 * this instant, what should have fired by now?" and answers the same way every
 * time it is asked. That is the property that makes a missed week harmless — the
 * next evaluation still sees the rung as passed — and it is also the property
 * that would send the same reminder on every evaluation if nothing remembered.
 *
 * So the ledger stores keys, and only keys. It is deliberately not a second
 * message log: it answers one question, and a record of what was said to whom
 * belongs in the message log that already exists.
 *
 * The key has four parts and each one is load-bearing:
 *
 *   recordId      two policies renewing the same week are not one send
 *   recipeKey     the reminder ladder and the notice batch fire independently
 *   offsetDays    without it the 30-day rung suppresses the 15-day one
 *   recipeVersion an admin who edits the parameters gets the rung back
 *
 * The last is free rather than clever: `automation-store` already publishes a
 * new version on every parameter edit, precisely so that what ran on Monday can
 * be shown to have run under Monday's numbers. Folding that version into the key
 * means a widened ladder re-fires under the new configuration instead of being
 * suppressed by a key written under the old one.
 */

export type FiredKeyParts = {
  readonly recordId: string
  readonly recipeKey: string
  readonly recipeVersion: number
  /** Signed: positive is before the anchor, negative is after it. */
  readonly offsetDays: number
}

/**
 * The idempotency key for one rung on one record under one version of one
 * recipe. `d` and `g` rather than a bare minus sign, so the key stays readable
 * in a log line and a grace rung is visibly a grace rung.
 */
export function firedKey(parts: FiredKeyParts): string {
  const rung = parts.offsetDays >= 0 ? `d${parts.offsetDays}` : `g${Math.abs(parts.offsetDays)}`
  return `${parts.recordId}:${parts.recipeKey}:v${parts.recipeVersion}:${rung}`
}

/**
 * The other key: one evaluation of one recipe against one trigger — FR-21.5.
 *
 * `firedKey` above answers "has this rung been sent?" for a ladder walking a
 * date. This answers "has this recipe already been evaluated for this
 * occurrence?" for a recipe reacting to something that happened, and the two are
 * separate because they are keyed on different things: a rung is identified by
 * its offset from an anchor, an evaluation by the occurrence that provoked it.
 *
 * `occurrence` is the discriminator and it is always an id, never an instant.
 * For an event-triggered recipe it is the triggering event's own id; for a
 * time-triggered one it is the rung key `firedKey` produced. Putting a timestamp
 * here instead would make every re-run a new key, which is the same as having no
 * key at all — the run would fire again on resume, again on replay, and again in
 * every test that moved the clock.
 */
export type RunKeyParts = {
  readonly recipeKey: string
  readonly recipeVersion: number
  readonly subjectId: string
  /** The rung, when a ladder produced this run. `null` for a plain trigger. */
  readonly phase: string | null
  readonly occurrence: string
}

export function runKey(parts: RunKeyParts): string {
  const phase = parts.phase ?? 'trigger'
  return `${parts.recipeKey}:v${parts.recipeVersion}:${parts.subjectId}:${phase}:${parts.occurrence}`
}
