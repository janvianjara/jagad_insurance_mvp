/**
 * Quotation — plan §9, FR-06.5 to .10, canvas n9-n16, M0.
 *
 *   draft -> composed -> generated -> shared -+- revision requested -> generated (v+1)
 *                                             +- won  -> Deal created
 *                                             +- lost (reason mandatory)
 *
 * The two rules that carry the product: a revision needs a reason and leaves the
 * prior version readable, and Final Payable Premium is typed per column before
 * anything is generated. The second one is D3 at its sharpest — the composer will
 * happily add up the components a person typed, and it will not produce the final
 * figure for them.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const QUOTATION_STATES = {
  draft: 'draft',
  composed: 'composed',
  generated: 'generated',
  shared: 'shared',
  revisionRequested: 'revision_requested',
  /**
   * The customer has said yes and named the columns they are taking. Nothing is
   * placed yet and no application exists — this is the decision, on the record,
   * in the gap that used to be a single guardless hop into `won`.
   */
  awarded: 'awarded',
  won: 'won',
  lost: 'lost',
} as const

export type QuotationState = (typeof QUOTATION_STATES)[keyof typeof QUOTATION_STATES]

/**
 * Where a premium figure came from. `typed` is the only value that lets a
 * quotation generate; the other two exist so a repository can record what it saw
 * and be refused, rather than have the refusal live only in a code review.
 */
export const PREMIUM_SOURCES = {
  typed: 'typed',
  insurerAdvice: 'insurer_advice',
  computed: 'computed',
} as const

export type PremiumSource = (typeof PREMIUM_SOURCES)[keyof typeof PREMIUM_SOURCES]

/** One company-and-product column of the comparison the customer receives. */
export type QuotationColumn = {
  /**
   * The stable key a column is identified by across versions and on the award.
   * Optional only because the older callers that build columns for the premium
   * guards have no key to give; anything naming an accepted column must set it.
   */
  readonly columnKey?: string
  readonly label: string
  readonly companyId: string
  readonly productId: string
  /** Optional in the type because it is genuinely absent until somebody types it. */
  readonly finalPayablePremium?: Money
  readonly finalPremiumSource?: PremiumSource
}

export type QuotationVersion = {
  readonly version: number
  readonly columns: readonly QuotationColumn[]
  /** Set by `archiveQuotationVersion` when a newer version supersedes this one. */
  readonly locked?: boolean
}

export const QUOTATION_ORIGINS = ['generated', 'uploaded'] as const
export type QuotationOrigin = (typeof QUOTATION_ORIGINS)[number]

export type QuotationShareConfig = {
  /** FR-06.9's config fork. One switch, both origins. */
  readonly autoShare: boolean
}

export type QuotationContext = {
  readonly columns: readonly QuotationColumn[]
  readonly version: number
  readonly priorVersions?: readonly QuotationVersion[]
  readonly revisionReason?: string
  readonly lostReason?: string
  /** The columns the customer accepted. Named on the award, never inferred. */
  readonly acceptedColumnKeys?: readonly string[]
  /** The application opened off this award. `won` is not reachable without one. */
  readonly dealId?: string
  readonly awardVoidReason?: string
}

/**
 * §9: "Prior versions are immutable and remain viewable." Freezing here rather
 * than trusting callers is what makes the guard below checkable at all.
 */
export function archiveQuotationVersion(version: QuotationVersion): QuotationVersion {
  return Object.freeze({ ...version, columns: Object.freeze([...version.columns]), locked: true })
}

/**
 * §9: "Final Payable Premium must be present per column before generate."
 * Presence only. This guard reads an amount and never produces one.
 */
export function finalPayablePremiumPresentPerColumn(ctx: QuotationContext): TransitionResult {
  if (ctx.columns.length === 0) {
    return refuse('This quotation has no columns yet. Add at least one company and product before generating.')
  }

  const missing = ctx.columns.filter((column) => !isMoney(column.finalPayablePremium))
  if (missing.length > 0) {
    const labels = missing.map((column) => column.label).join(', ')
    return refuse(
      `Final Payable Premium is missing for: ${labels}. Type the figure from each insurer's quote — the platform does not work it out.`,
    )
  }
  return allow()
}

/**
 * §9: "It is typed, never computed." A column carrying a computed provenance is
 * refused even when the number looks right.
 */
export function finalPremiumIsTypedNotComputed(ctx: QuotationContext): TransitionResult {
  const derived = ctx.columns.filter(
    (column) => column.finalPremiumSource !== undefined && column.finalPremiumSource === PREMIUM_SOURCES.computed,
  )
  if (derived.length > 0) {
    const labels = derived.map((column) => column.label).join(', ')
    return refuse(
      `Final Payable Premium is marked as computed for: ${labels}. This figure is typed from the insurer's quote, never derived.`,
    )
  }
  return allow()
}

export function revisionRequiresReason(ctx: QuotationContext): TransitionResult {
  if (!ctx.revisionReason || ctx.revisionReason.trim().length === 0) {
    return refuse('Record why this quotation is being revised before opening a new version.')
  }
  return allow()
}

/** A revision produces v+1; it never overwrites the version the customer already saw. */
export function revisionIncrementsVersion(ctx: QuotationContext): TransitionResult {
  const priors = ctx.priorVersions ?? []
  if (priors.length === 0) {
    return refuse('A revision must archive the version it replaces. No prior version was supplied.')
  }
  const highestPrior = Math.max(...priors.map((version) => version.version))
  if (ctx.version <= highestPrior) {
    return refuse(
      `A revision opens version ${highestPrior + 1}. Version ${ctx.version} would overwrite a quotation the customer has already seen.`,
    )
  }
  return allow()
}

export function priorVersionsRemainImmutable(ctx: QuotationContext): TransitionResult {
  const priors = ctx.priorVersions ?? []
  const unlocked = priors.filter((version) => version.locked !== true || !Object.isFrozen(version))
  if (unlocked.length > 0) {
    const numbers = unlocked.map((version) => `v${version.version}`).join(', ')
    return refuse(
      `Prior versions must be archived before a revision opens: ${numbers} are still editable. Earlier quotations stay viewable exactly as they were sent.`,
    )
  }
  return allow()
}

/**
 * Which columns the customer actually bought.
 *
 * This used to be optional, and a quotation could reach `won` without it — which
 * left the single most valuable fact of the sale recorded nowhere except an event
 * payload. Everything downstream then had to guess, or ask a person.
 */
export function acceptedColumnsExist(ctx: QuotationContext): TransitionResult {
  const accepted = ctx.acceptedColumnKeys ?? []
  if (accepted.length === 0) {
    return refuse(
      'Name the column the customer accepted before marking this quotation won. Which one they bought is the whole content of the decision.',
    )
  }

  const unknown = accepted.filter((key) => !columnFor(ctx, key))
  if (unknown.length > 0) {
    return refuse(
      `This quotation has no column called: ${unknown.join(', ')}. A deal can only be opened on a column the customer was actually shown.`,
    )
  }
  return allow()
}

/**
 * The column an accepted key names.
 *
 * Keyed by `columnKey` where there is one and by label otherwise, because the
 * columns handed to the premium guards are built from a draft that has no keys
 * yet. Falling back rather than refusing keeps one guard usable from both
 * callers without either having to lie about what it holds.
 */
function columnFor(ctx: QuotationContext, key: string): QuotationColumn | undefined {
  return ctx.columns.find((column) => (column.columnKey ?? column.label) === key)
}

/**
 * The accepted columns carry the figure the deal will be opened on.
 *
 * `generate` already refused the whole quotation without a typed premium per
 * column, so this can only fail on a quotation that reached `shared` some other
 * way. It is checked anyway, because the deal is about to copy these figures and
 * a missing one there is a sale with no price.
 */
export function acceptedColumnsHaveTypedPremium(ctx: QuotationContext): TransitionResult {
  const accepted = ctx.acceptedColumnKeys ?? []
  const chosen = accepted
    .map((key) => columnFor(ctx, key))
    .filter((column): column is QuotationColumn => column !== undefined)

  const missing = chosen.filter((column) => !isMoney(column.finalPayablePremium))
  if (missing.length > 0) {
    return refuse(
      `No Final Payable Premium was ever typed for: ${missing.map((column) => column.label).join(', ')}. The deal carries that figure, so it has to exist before the sale is recorded.`,
    )
  }

  const derived = chosen.filter(
    (column) => column.finalPremiumSource === PREMIUM_SOURCES.computed,
  )
  if (derived.length > 0) {
    return refuse(
      `Final Payable Premium is marked as computed for: ${derived.map((column) => column.label).join(', ')}. This figure is typed from the insurer's quote, never derived.`,
    )
  }
  return allow()
}

/**
 * §9's `won` now means something checkable: an application exists.
 *
 * Every screen already reads `won` as "this became a deal". Before this guard
 * that was a convention nobody enforced, and a failed deal creation left a
 * quotation permanently claiming a sale with no application behind it.
 */
export function dealExistsForAward(ctx: QuotationContext): TransitionResult {
  if (!ctx.dealId) {
    return refuse(
      'A quotation is won by the application it produced, and none has been opened yet. Open the deal first — marking it won on its own would record a sale with nothing behind it.',
    )
  }
  return allow()
}

/** Reversing a decision is a decision. It is recorded, not erased. */
export function awardVoidRequiresReason(ctx: QuotationContext): TransitionResult {
  if (!ctx.awardVoidReason || ctx.awardVoidReason.trim().length === 0) {
    return refuse('Record why this award is being reversed. The quotation goes back to shared, and the reason is what explains the round trip.')
  }
  return allow()
}

export function quotationLostRequiresReason(ctx: QuotationContext): TransitionResult {
  if (!ctx.lostReason || ctx.lostReason.trim().length === 0) {
    return refuse('Record why this quotation was lost. The mandatory reason is what makes lost-reason reporting worth reading.')
  }
  return allow()
}

/**
 * §9: "Auto-share is a config fork, applying identically to generated and
 * uploaded quotations." The origin is validated and then deliberately not
 * consulted — that identity is the rule.
 */
export function shouldAutoShare(config: QuotationShareConfig, origin: QuotationOrigin): boolean {
  if (!QUOTATION_ORIGINS.includes(origin)) {
    throw new RangeError(`Unknown quotation origin: ${origin}.`)
  }
  return config.autoShare
}

export const QUOTATION_TRANSITIONS = {
  draft: {
    composed: { event: 'quotation.composed', note: 'Columns and benefit rows are in place.' },
  },
  composed: {
    generated: {
      event: 'quotation.generated',
      guards: [finalPayablePremiumPresentPerColumn, finalPremiumIsTypedNotComputed],
      note: '§9: Final Payable Premium present per column, typed not computed.',
    },
  },
  generated: {
    shared: { event: 'quotation.shared', alsoEmits: ['message.sent'] },
  },
  shared: {
    revision_requested: {
      event: 'quotation.revision_requested',
      guards: [revisionRequiresReason],
    },
    awarded: {
      event: 'quotation.awarded',
      guards: [acceptedColumnsExist, acceptedColumnsHaveTypedPremium],
      note: 'The customer named the columns they are taking. Nothing is placed yet.',
    },
    lost: { event: 'quotation.lost', guards: [quotationLostRequiresReason] },
  },
  awarded: {
    won: {
      event: 'quotation.won',
      guards: [acceptedColumnsExist, dealExistsForAward],
      note: '§9: `won` is reachable only through the application it produced.',
    },
    shared: {
      event: 'quotation.award_voided',
      guards: [awardVoidRequiresReason],
      note: 'A decision reversed before placement. The quotation is live again.',
    },
  },
  revision_requested: {
    generated: {
      event: 'quotation.generated',
      guards: [
        revisionRequiresReason,
        revisionIncrementsVersion,
        priorVersionsRemainImmutable,
        finalPayablePremiumPresentPerColumn,
        finalPremiumIsTypedNotComputed,
      ],
      note: '§9: revision -> generated (v+1), prior versions immutable.',
    },
  },
} as const satisfies TransitionTable<QuotationState, QuotationContext>

export const quotationMachine = createMachine<QuotationState, QuotationContext>({
  name: 'quotation',
  states: Object.values(QUOTATION_STATES),
  initial: QUOTATION_STATES.draft,
  transitions: QUOTATION_TRANSITIONS,
})
