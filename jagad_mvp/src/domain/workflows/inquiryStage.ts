/**
 * The engagement pipeline — FR-06.12, and the one place stage rules are read.
 *
 * Every other lifecycle in this product is a machine: a frozen state set, an
 * adjacency map, guards on the edges, and the compiler proving that a move
 * nobody wrote down cannot be made. Stages are not that. They are rows an admin
 * edits, because an agency that works its pipeline differently should not wait
 * for a release to add "awaiting documents" — and that is a deliberate trade,
 * not an oversight.
 *
 * What it costs: the compiler no longer proves a stage move is legal. What is
 * done about it: the proof moves here, and only here. `allowedFromKeys` on the
 * stage row is exactly the adjacency a transition table would have held, this
 * module is the only thing that reads it, and it answers in the same
 * allow/refuse-with-a-sentence shape every §9 machine answers in — so a blocked
 * stage move prints why, rather than a button doing nothing.
 *
 * Two boundaries are worth stating because they are easy to lose:
 *
 *   1. A stage is a position *inside* `accepted`. The lifecycle machine in
 *      `inquiry.ts` still owns new → assigned → accepted → converted/lost and its
 *      whole TAT chain; nothing here can move an inquiry between those. A stage
 *      change on an inquiry that has not been accepted is refused.
 *   2. A stage never invents an obligation. `requiresNextAction` says leaving
 *      this stage needs a dated next action; whether that date is any good is
 *      `nextAction.ts`'s question, not this one's.
 */

import { allow, refuse } from './machine'
import type { TransitionResult } from './machine'

/** The configured stage, as `InquiryStage` in the data layer supplies it. */
export type StageRule = {
  readonly key: string
  readonly label: string
  /** Stages this one may be entered from. Empty means "from anywhere". */
  readonly allowedFromKeys: readonly string[]
  readonly requiresNextAction: boolean
  readonly countsAsOpen: boolean
  readonly terminal: boolean
  /** This is where a cold lead is parked. See `parkingStage` below. */
  readonly parksTheLead: boolean
  readonly active: boolean
}

export type StageContext = {
  /** The inquiry's lifecycle state. Only `accepted` carries a pipeline. */
  readonly status: string
  /** Where it sits now. Null when nobody has made contact yet. */
  readonly fromKey: string | null
  /** Whether the move being attempted carries a dated next action. */
  readonly hasNextAction: boolean
}

/** The lifecycle state in which an inquiry has a pipeline position at all. */
export const STAGED_STATUS = 'accepted'

export function stageByKey(
  stages: readonly StageRule[],
  key: string | null,
): StageRule | null {
  if (key === null) return null
  return stages.find((stage) => stage.key === key) ?? null
}

/**
 * May this inquiry enter that stage?
 *
 * Reads in the order a person would ask it: is this inquiry even in the pipeline,
 * is that a stage we have, can you get there from here, and does leaving where
 * you are owe anybody a date.
 */
export function canEnterStage(
  toKey: string,
  stages: readonly StageRule[],
  ctx: StageContext,
): TransitionResult {
  if (ctx.status !== STAGED_STATUS) {
    return refuse(
      `Only an accepted inquiry has a pipeline position, and this one is ${ctx.status}. Accept it first — routing and the turnaround clock come before the conversation.`,
    )
  }

  const to = stageByKey(stages, toKey)
  if (!to) {
    return refuse(
      `"${toKey}" is not a configured stage. Stages are edited in configuration, and an inquiry cannot be put in one that does not exist.`,
    )
  }

  if (!to.active) {
    return refuse(
      `"${to.label}" has been retired, so nothing new goes into it. Records already there keep it; pick a stage that is still in use.`,
    )
  }

  if (ctx.fromKey === toKey) {
    return refuse(`This inquiry is already at ${to.label}.`)
  }

  const from = stageByKey(stages, ctx.fromKey)

  if (from && from.terminal) {
    return refuse(
      `${from.label} is where this inquiry ended. Reopen it before moving it on, so the trail says that somebody did.`,
    )
  }

  // An empty list means the stage can be reached from anywhere — true of the
  // ones a single call can produce out of nothing. You can always fail to reach
  // somebody, whatever else was happening.
  if (to.allowedFromKeys.length > 0) {
    const cameFrom = ctx.fromKey ?? ''
    if (!to.allowedFromKeys.includes(cameFrom)) {
      const whereItIs = from ? from.label : 'not yet in the pipeline'
      return refuse(
        `${to.label} is not reachable from "${whereItIs}". The stages it follows are configured as: ${to.allowedFromKeys.join(', ')}.`,
      )
    }
  }

  if (from && from.requiresNextAction && !to.terminal && !ctx.hasNextAction) {
    return refuse(
      `Leaving ${from.label} needs a next action with a date. An open inquiry without one is how a lead goes quiet and nobody notices.`,
    )
  }

  return allow()
}

/**
 * Where a cold lead is parked — the stage the win-back list is read from.
 *
 * Read off the configured rows rather than from a key written in code, for the
 * same reason `allowedFromKeys` is: stages are configuration. An agency that
 * renames Dormant to "Cold storage" keeps its win-back list, and one that
 * retires the row has no parking stage at all rather than a query that quietly
 * returns nothing — so dormancy does not fire, exactly as an unconfigured
 * recipe does not fire.
 *
 * Two rows flagged is a configuration mistake and answered as one: the first by
 * sort order wins, and it is the only one anything reads.
 */
export function parkingStage(stages: readonly StageRule[]): StageRule | null {
  return stages.find((stage) => stage.parksTheLead && stage.active) ?? null
}

/** Is this inquiry parked? The question `recycle` and the win-back list ask. */
export function stageParksTheLead(
  stages: readonly StageRule[],
  key: string | null,
): boolean {
  return stageByKey(stages, key)?.parksTheLead ?? false
}

/**
 * Going cold, as the recipe defines it — FR-06.17.
 *
 * Two ways a lead stops being reachable, and the platform holds neither number:
 * `maxAttempts` calls nobody answered, or `noContactDays` since anybody last
 * spoke to them. Both are parameters on the `inquiry.dormancy` recipe, read the
 * way §9 already has the TAT read — an admin who wants five attempts instead of
 * three edits a row, and there is nowhere in this module for a default to live.
 *
 * A missing or inactive recipe means no dormancy, not a guessed threshold. That
 * is the same posture as everything else here: an unconfigured rule does not
 * fire, rather than firing on a number somebody in this file chose.
 */
export type DormancyRule = {
  /** Calls nobody answered before the lead is parked. Zero or absent disables it. */
  readonly maxAttempts: number | null
  /** Days since the last actual contact. Zero or absent disables it. */
  readonly noContactDays: number | null
}

export type DormancyContext = {
  readonly now: Date
  readonly contactAttempts: number
  readonly lastActivityAt: string | null
}

export type DormancyVerdict =
  | { readonly dormant: false }
  | { readonly dormant: true; readonly because: string }

export function readDormancyRule(
  parameters: Readonly<Record<string, string | number | boolean>> | null,
): DormancyRule {
  const number = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  if (!parameters) return { maxAttempts: null, noContactDays: null }
  return {
    maxAttempts: number(parameters.maxAttempts),
    noContactDays: number(parameters.noContactDays),
  }
}

/**
 * Has this lead gone cold?
 *
 * The sentence comes back with the verdict because it is written on the record:
 * "parked after 5 attempts nobody answered" is a thing somebody can act on, and
 * a bare state change is not.
 */
export function dormancyVerdict(
  rule: DormancyRule,
  ctx: DormancyContext,
): DormancyVerdict {
  if (rule.maxAttempts !== null && ctx.contactAttempts >= rule.maxAttempts) {
    return {
      dormant: true,
      because: `Parked after ${ctx.contactAttempts} attempts nobody answered. The threshold is ${rule.maxAttempts}, set on the dormancy recipe.`,
    }
  }

  if (rule.noContactDays !== null && ctx.lastActivityAt !== null) {
    const last = new Date(ctx.lastActivityAt)
    if (!Number.isNaN(last.getTime())) {
      const days = Math.floor((ctx.now.getTime() - last.getTime()) / 86_400_000)
      if (days >= rule.noContactDays) {
        return {
          dormant: true,
          because: `Parked after ${days} days with no contact. The threshold is ${rule.noContactDays}, set on the dormancy recipe.`,
        }
      }
    }
  }

  return { dormant: false }
}

/**
 * Is this inquiry still being worked?
 *
 * The population the pipeline counts and the next-action KPI divides into. An
 * inquiry with no stage at all is open by this reading — accepted and never
 * contacted is the most open an inquiry gets, and hiding it would defeat the
 * measurement.
 */
export function stageCountsAsOpen(
  stages: readonly StageRule[],
  key: string | null,
): boolean {
  const stage = stageByKey(stages, key)
  return stage === null ? true : stage.countsAsOpen
}
