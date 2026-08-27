/**
 * The shapes policy entry, the premium block and issuance all agree on.
 *
 * This file exists so the three halves of P-15 cannot drift, and so the one
 * rule that matters most in this module is stated once, as a type, rather than
 * repeated as a comment in three places:
 *
 *   **The Final Premium is typed. Nothing in this feature produces it.**
 *
 * D3 is usually written as "record-only money", which reads like a policy about
 * behaviour. Here it is closer to a structural claim about the code: there is no
 * function in `src/features/policies/` that returns a `Money`. Every amount that
 * reaches a repository command came out of a `<RecordOnlyAmount>` control or out
 * of an `<OcrField>` a person confirmed. `<RollUp>` performs the only arithmetic
 * the product allows — Net is the sum of the typed components and Final is Net
 * plus the typed GST — and it *renders* that arithmetic. It does not return it,
 * and this module never asks it to.
 *
 * The premium roll-up on screen is therefore a cross-check against the figure a
 * person read off the insurer's document, not a source for it. When the two
 * disagree the screen says so and stops; it never resolves the disagreement by
 * choosing one.
 */

import type { OcrExtraction, OcrFieldState } from '../../components/guardrails'
import type { FormSchema } from '../../domain/forms'
import { allFields, isRollUpField } from '../../domain/forms'
import type { Money } from '../../domain/money'
import type {
  CollectionInstrument,
  CollectionMode,
  CollectionRoute,
  PremiumSource,
} from '../../domain/workflows'

/* ------------------------------------------------------------------ premium */

/**
 * The provenances a person can produce, and the whole of the set this feature
 * can express. `computed` exists in `PREMIUM_SOURCES` so the machine can refuse
 * it; it is deliberately absent here, so no screen in this module can even name
 * it. The `satisfies` keeps the two in step: widening `PremiumSource` without
 * revisiting this line will not compile.
 */
export const TYPED_PREMIUM_SOURCES = {
  typed: 'typed',
  insurerAdvice: 'insurer_advice',
} as const satisfies Readonly<Record<string, PremiumSource>>

export type TypedPremiumSource =
  (typeof TYPED_PREMIUM_SOURCES)[keyof typeof TYPED_PREMIUM_SOURCES]

/** One typed component of the premium. `null` is unrecorded, which is not zero. */
export type PremiumComponent = {
  readonly key: string
  readonly label: string
  readonly amount: Money | null
}

/**
 * Everything the premium block holds.
 *
 * `components` and `gst` are optional forever (§9: "Components stay optional").
 * `finalPremium` is the figure issue is gated on, and it is typed — which is why
 * it sits beside the components rather than being read out of them.
 */
export type PremiumEntry = {
  readonly components: readonly PremiumComponent[]
  readonly gst: Money | null
  readonly finalPremium: Money | null
  readonly finalPremiumSource: TypedPremiumSource
}

/**
 * Which schema fields make up the premium block, read off the schema's own
 * roll-up definition rather than from a constant in code. A product whose form
 * names different components gets a different block with no code change — which
 * is canvas 6.2's promise, applied to money.
 */
export type PremiumShape = {
  readonly rollUpKey: string
  readonly componentKeys: readonly string[]
  readonly gstKey: string | null
}

export function premiumShapeOf(schema: FormSchema): PremiumShape | null {
  for (const field of allFields(schema)) {
    if (!isRollUpField(field)) continue
    return {
      rollUpKey: field.key,
      componentKeys: field.components,
      gstKey: field.gstField ?? null,
    }
  }
  return null
}

/* ---------------------------------------------------------------- the gates */

/** The two §9 gates on issue, plus the FR-16 one that sits in front of both. */
export const ISSUE_BLOCKERS = {
  kyc: 'kyc',
  finalPremium: 'final_premium',
  unconfirmedExtraction: 'unconfirmed_extraction',
} as const

export type IssueBlockerKey = (typeof ISSUE_BLOCKERS)[keyof typeof ISSUE_BLOCKERS]

/**
 * Why this policy cannot be issued yet. The message is the requirement: §9's
 * gates are only kept if the screen says which one refused and why, so a greyed
 * button with no sentence beside it fails this type's whole purpose.
 */
export type IssueBlocker = {
  readonly key: IssueBlockerKey
  readonly message: string
}

/* ---------------------------------------------------------------- issuance */

/** One field the mock extractor read off the uploaded policy PDF. */
export type IssuanceExtraction = {
  /** Unique within the review form; `<OcrFormProvider>` tracks confirmation by it. */
  readonly name: string
  readonly label: string
  readonly extraction: OcrExtraction
}

/** The review's state: every extraction, by name, after a person has looked. */
export type IssuanceReview = Readonly<Record<string, OcrFieldState>>

/**
 * The four values the policy document carries into the record. `finalPremium`
 * arrives as the digits a person confirmed, and is parsed by the same
 * `parseAmountDraft` the typed control uses — there is no second way in.
 */
export const ISSUANCE_FIELDS = {
  insurerNo: 'insurerNo',
  finalPremium: 'finalPremium',
  startDate: 'startDate',
  expiryDate: 'expiryDate',
} as const

export type IssuanceFieldName = (typeof ISSUANCE_FIELDS)[keyof typeof ISSUANCE_FIELDS]

/* ----------------------------------------------------------------- payment */

/**
 * The payment fork, as a screen holds it (§9's collection machine).
 * `direct_to_company` records a reference and never touches the agency books;
 * `via_agency` records a collection. A cheque puts the record on bounce-watch.
 */
export type PaymentEntry = {
  readonly route: CollectionRoute
  readonly instrument: CollectionInstrument
  readonly mode: CollectionMode
  readonly amount: Money | null
  readonly reference: string
}

/** A cheque is the only instrument that can bounce, so it is the only watch. */
export function isBounceWatched(entry: Pick<PaymentEntry, 'instrument'>): boolean {
  return entry.instrument === 'cheque'
}
