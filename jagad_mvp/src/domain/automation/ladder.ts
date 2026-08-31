/**
 * The reminder ladder — plan §7 ("let mock recipes subscribe"), FR-21, FR-12.1/.3.
 *
 * A recipe carries the rungs at which a record is nudged: 45, 30, 15, 7 and 1
 * days before a policy expires, then 3 and 10 days after it while win-back is
 * still live. This module turns those parameters into rungs and refuses the
 * ones it cannot read, in the same allow/refuse-with-a-sentence shape every
 * machine in `src/domain/workflows` returns.
 *
 * Two decisions are worth stating, because both are the kind that get quietly
 * defaulted later.
 *
 * The rungs live in a `RecipeParameters` value, which holds scalars only — an
 * admin edits numbers and names, not JSON. So a ladder is written as
 * `'45,30,15,7,1'` and parsed here, strictly: a rung that will not parse stops
 * the whole ladder rather than being dropped from it, because a ladder silently
 * missing its 7-day rung is indistinguishable from one that never had it.
 *
 * And the ceiling is required. A ladder with no `maxReminders` is how a customer
 * gets five messages in a week from a recipe somebody widened without noticing
 * what else read it, so this refuses rather than treating "absent" as "no limit".
 *
 * A rung is signed, and the sign is the whole trick: `offsetDays` counts
 * BACKWARDS from the anchor, so 45 means "45 days before expiry" and -3 means
 * "3 days after it". One number line, ordered latest-last, which is what lets
 * `ticks.ts` pick the most recent rung without caring which side it fell on.
 */

/** The recipe fields this module reads. Structural, so `src/domain` imports no data type. */
export type AutomationParameters = Readonly<Record<string, string | number | boolean>>

export const LADDER_PARAMS = {
  /** Days before the anchor, as `'45,30,15,7,1'`. */
  offsets: 'offsetsDays',
  /** Days after the anchor, as `'3,10'`. Optional. */
  graceOffsets: 'graceOffsetsDays',
  /** The hard ceiling on sends, whatever the ladder holds. */
  ceiling: 'maxReminders',
} as const

export type Ladder = {
  /** Signed rungs, ordered earliest first: 45, 30, 15, 7, 1, -3, -10. */
  readonly rungs: readonly number[]
  /** The ceiling on sends per record. Authoritative over the ladder's length. */
  readonly maxSends: number
}

export type LadderResult = { readonly ok: true; readonly ladder: Ladder } | { readonly ok: false; readonly reason: string }

function refuse(reason: string): LadderResult {
  return { ok: false, reason }
}

/**
 * Parses one comma-separated day list. Whole non-negative days only: a rung at
 * 2.5 days is a rung nobody can describe to a customer, and a negative entry
 * here would mean the writer expected this field to carry both directions when
 * grace has a field of its own.
 */
function parseDays(raw: string, field: string): { readonly ok: true; readonly days: readonly number[] } | { readonly ok: false; readonly reason: string } {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  if (parts.length === 0) {
    return { ok: false, reason: `\`${field}\` is empty, so this recipe has no rungs to fire on.` }
  }

  const days: number[] = []
  for (const part of parts) {
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0) {
      return {
        ok: false,
        reason: `\`${field}\` holds "${part}", which is not a whole number of days. The ladder is read as written, never rounded.`,
      }
    }
    if (days.includes(value)) {
      return { ok: false, reason: `\`${field}\` lists ${value} twice. A rung fires once or it is not a rung.` }
    }
    days.push(value)
  }
  return { ok: true, days }
}

function readCeiling(parameters: AutomationParameters): { readonly ok: true; readonly maxSends: number } | { readonly ok: false; readonly reason: string } {
  const value = parameters[LADDER_PARAMS.ceiling]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      reason: `This recipe carries no \`${LADDER_PARAMS.ceiling}\`. A ladder without a ceiling is how a customer gets five messages in a week, so there is no default for it here.`,
    }
  }
  return { ok: true, maxSends: value }
}

/**
 * Reads the ladder off a recipe's parameters.
 *
 * The grace rungs are folded onto the same number line as negative offsets, and
 * a day listed on both sides is refused: "3 days before expiry" and "3 days
 * after it" are different messages, but one `firedFor` key cannot tell them
 * apart if they share a magnitude and a sign.
 */
export function readLadder(parameters: AutomationParameters): LadderResult {
  const rawOffsets = parameters[LADDER_PARAMS.offsets]
  if (typeof rawOffsets !== 'string') {
    return refuse(
      `This recipe carries no \`${LADDER_PARAMS.offsets}\`, so nothing tells it when to fire. The rungs are configuration and this module holds no default.`,
    )
  }

  const before = parseDays(rawOffsets, LADDER_PARAMS.offsets)
  if (!before.ok) return refuse(before.reason)

  const rawGrace = parameters[LADDER_PARAMS.graceOffsets]
  let after: readonly number[] = []
  if (typeof rawGrace === 'string' && rawGrace.trim() !== '') {
    const parsed = parseDays(rawGrace, LADDER_PARAMS.graceOffsets)
    if (!parsed.ok) return refuse(parsed.reason)
    if (parsed.days.includes(0)) {
      return refuse(
        `\`${LADDER_PARAMS.graceOffsets}\` lists 0, which is the anchor itself and already belongs to \`${LADDER_PARAMS.offsets}\`.`,
      )
    }
    after = parsed.days
  }

  const ceiling = readCeiling(parameters)
  if (!ceiling.ok) return refuse(ceiling.reason)

  const rungs = [...before.days, ...after.map((day) => -day)].sort((left, right) => right - left)

  return { ok: true, ladder: { rungs, maxSends: ceiling.maxSends } }
}

const DAY_MS = 86_400_000

/**
 * When a rung comes due. Pure, so a screen can count down to the next one and a
 * test can sit on either side of it.
 */
export function rungInstant(anchorDate: string, offsetDays: number): Date {
  const anchor = new Date(anchorDate)
  if (Number.isNaN(anchor.getTime())) {
    throw new Error(`"${anchorDate}" is not a date, so no rung can be measured against it.`)
  }
  return new Date(anchor.getTime() - offsetDays * DAY_MS)
}
