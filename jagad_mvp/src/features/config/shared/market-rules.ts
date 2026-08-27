/**
 * The rules P-10b enforces, kept out of the screens that show them.
 *
 * Three of them are guards in the §9 sense — a plain function taking a context
 * and returning a `TransitionResult` — so a screen can call the same function
 * the store will call, disable its Confirm with the sentence the refusal would
 * have carried, and never invent a second wording for the same rule.
 *
 * What is deliberately NOT here: the sub-agent cap. P-03 already built
 * `subAgentShareWithinCap` in `src/domain/workflows/commissionShare`, and §9's
 * rule has two ceilings that a second implementation would get subtly wrong. The
 * store calls that guard directly; nothing below reimplements it.
 *
 * Also not here: any arithmetic over `Money`. Commission percentages are integer
 * basis points and stay percentages — the chain that turns one into an amount is
 * P-16's, and the boundary is the whole reason P-03's module is small.
 */

import { allow, formatPercentBp, isValidBasisPoints, refuse } from '../../../domain/workflows'
import type { TransitionResult } from '../../../domain/workflows'
import { AGENCY_TYPES } from '../../../data/repo'
import type { AgencyType, InsuranceLine } from '../../../data/repo'
import { LIFE_LINE, LINE_LABELS } from './market-types'

/* ---------------------------------------------------------- percentage entry */

/** Basis points as a person types them: 1500 reads 15. */
export function percentFromBp(basisPoints: number | null): number | null {
  return basisPoints === null ? null : basisPoints / 100
}

/** What a person typed, back to the integer the record stores. 12.5 becomes 1250. */
export function bpFromPercent(percent: number | null): number | null {
  if (percent === null || Number.isNaN(percent)) return null
  return Math.round(percent * 100)
}

/** A percentage for reading. Never a rate anything books against. */
export function readPercent(basisPoints: number | null): string {
  return basisPoints === null ? 'Not set' : formatPercentBp(basisPoints)
}

export function percentIsValid(basisPoints: number | null, what: string): TransitionResult {
  if (basisPoints === null) {
    return refuse(`Enter ${what} as a percentage between 0 and 100.`)
  }
  if (!isValidBasisPoints(basisPoints)) {
    return refuse(`${what} has to be a percentage between 0 and 100, in whole hundredths.`)
  }
  return allow()
}

/* ---------------------------------------------------------------- companies */

/**
 * A company row is one licensed entity, so it writes life or it writes general
 * lines — never both.
 *
 * This is plan §5's "per line" bullet made checkable. HDFC Life and HDFC Ergo
 * General are two companies in this system, with two appointment letters, two
 * commission schedules and two claims desks; one row carrying a "life as well"
 * flag would make every downstream count wrong the first time somebody filtered
 * by line.
 */
export function companyLinesFormOneLicence(lines: readonly InsuranceLine[]): TransitionResult {
  if (lines.length === 0) {
    return refuse('Name at least one line this company is appointed for. A company with no line is offered nowhere.')
  }

  const hasLife = lines.includes(LIFE_LINE)
  const general = lines.filter((line) => line !== LIFE_LINE)

  if (hasLife && general.length > 0) {
    const names = general.map((line) => LINE_LABELS[line]).join(', ')
    return refuse(
      `Life and general insurance are written by separately licensed companies, so one company row cannot hold both life and ${names}. Record the life arm as its own company — HDFC Life and HDFC Ergo General are two companies here, not one company with a flag.`,
    )
  }

  return allow()
}

/* ----------------------------------------------------------------- agencies */

export type AgencyAppointmentContext = {
  readonly type: AgencyType
  readonly companyIds: readonly string[]
  /** For the refusal sentence. */
  readonly agencyName?: string
}

/**
 * §9 and canvas 6.3: "An Individual agency locks to exactly one company; Broker
 * allows many."
 *
 * An Individual agency IS an appointment — one agency code issued by one insurer
 * against one licence. A second company on that code is not a bigger agency, it
 * is a second agency, and the refusal says which of the two ways out to take.
 */
export function individualAgencyHoldsOneCompany(ctx: AgencyAppointmentContext): TransitionResult {
  const who = ctx.agencyName ? `"${ctx.agencyName}"` : 'This agency'

  if (ctx.companyIds.length === 0) {
    return refuse(`${who} is appointed to no company. An agency is an appointment, so name the company it holds.`)
  }

  const unique = new Set(ctx.companyIds)
  if (unique.size !== ctx.companyIds.length) {
    return refuse(`${who} names the same company twice.`)
  }

  if (ctx.type === AGENCY_TYPES.individual && ctx.companyIds.length > 1) {
    return refuse(
      `${who} is an Individual agency, which locks to exactly one company — ${ctx.companyIds.length} are chosen. A second company means a second agency code, or the Broker type on this one.`,
    )
  }

  return allow()
}

export type AgencyScopeContext = {
  /** The companies the agency is appointed to. */
  readonly appointedCompanyIds: readonly string[]
  /** The company each chosen policy belongs to, with the policy's name for the refusal. */
  readonly chosen: readonly { readonly companyId: string; readonly label: string }[]
}

/**
 * FR-07.4: the scope is what placement will offer, so nothing may enter it from
 * a company the agency was never appointed to.
 */
export function scopeInsideAppointedCompanies(ctx: AgencyScopeContext): TransitionResult {
  const offside = ctx.chosen.filter((row) => !ctx.appointedCompanyIds.includes(row.companyId))
  if (offside.length > 0) {
    return refuse(
      `This agency is not appointed to the company behind: ${offside.map((row) => row.label).join(', ')}. Appoint the company first, or drop the policy from the scope.`,
    )
  }
  return allow()
}

/* ------------------------------------------------------------ generated codes */

const AGENCY_TYPE_SEGMENT: Readonly<Record<AgencyType, string>> = {
  individual: 'IND',
  broker: 'BRK',
}

function initialsOf(seed: string): string {
  const words = seed
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) return 'NEW'
  if (words.length === 1) return words[0].slice(0, 3)
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
}

function uniqueCode(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/**
 * The agency code, generated rather than typed — FR-07.1.
 *
 * `JAG-IND-HE` for the individual appointment with HDFC Ergo, `JAG-BRK-JIG` for
 * a broker: house prefix, the type, then initials from whatever names the
 * appointment — the company for an Individual, the agency itself for a Broker.
 * Codes already on file are never regenerated; this runs once, at creation.
 */
export function nextAgencyCode(
  type: AgencyType,
  seed: string,
  taken: readonly string[],
): string {
  return uniqueCode(`JAG-${AGENCY_TYPE_SEGMENT[type]}-${initialsOf(seed)}`, taken)
}

/** `AGT-0020` after `AGT-0019`. Sequential, so a code never has to be chosen. */
export function nextAgentCode(taken: readonly string[]): string {
  const highest = taken.reduce((best, code) => {
    const digits = /^AGT-(\d+)$/.exec(code)
    return digits ? Math.max(best, Number(digits[1])) : best
  }, 0)
  return `AGT-${String(highest + 1).padStart(4, '0')}`
}

/* ------------------------------------------------------------- sub-agent team */

export type SubAgentTeamContext = {
  readonly agentName: string
  /** Canvas 6.4's grant: may this agent recruit sub-agents at all. */
  readonly canGrantSubAgents: boolean
  /** Null is §9's "no cap set", which is not the same as a cap of zero. */
  readonly capPercentBp: number | null
  readonly reporting: readonly { readonly name: string; readonly sharePercentBp: number }[]
}

/**
 * The two things that can go wrong to a sub-agent team from above it: the grant
 * being taken away while people still report, and the cap being lowered under a
 * share already agreed.
 *
 * Neither is the cap check itself — that is `subAgentShareWithinCap`, and it
 * decides a single share. This decides whether the settings around it are
 * survivable, and the store and the screen call the same function so the refusal
 * reads the same in both.
 */
export function subAgentTeamIsConsistent(ctx: SubAgentTeamContext): TransitionResult {
  if (!ctx.canGrantSubAgents && ctx.reporting.length > 0) {
    return refuse(
      `${ctx.agentName} has ${ctx.reporting.length} sub-agent${ctx.reporting.length === 1 ? '' : 's'} reporting. Move them to another agent before taking the grant away, or their share has nothing to be carved out of.`,
    )
  }

  const cap = ctx.capPercentBp
  if (cap !== null) {
    const overCap = ctx.reporting.filter((sub) => sub.sharePercentBp > cap)
    if (overCap.length > 0) {
      return refuse(
        `${overCap.map((sub) => sub.name).join(', ')} already hold a share above ${formatPercentBp(cap)}. Lower their shares before lowering the cap.`,
      )
    }
  }

  return allow()
}
