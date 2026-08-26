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
    won: { event: 'quotation.won', note: 'A Deal is created from here.' },
    lost: { event: 'quotation.lost', guards: [quotationLostRequiresReason] },
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
