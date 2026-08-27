/**
 * The market and channel shapes configuration edits — plan §5's companies,
 * products, benefits, agencies and agents rows; decision D1, "the whole system
 * is configuration, not code".
 *
 * The same rule `config-types.ts` follows applies here: every type below extends
 * a `src/data/repo` record rather than replacing it. The repository owns what a
 * company or an agent *is*; configuration owns the handful of extra facts an
 * admin edits that the MVP's read-only adapter has nowhere to put yet — which
 * category a company contact answers for, the section a benefit sits under, and
 * whether a sub-agent cap has been set at all.
 *
 * Two of those extras carry a rule the repository's shape cannot state:
 *
 *   A commission percentage may be *unset*. `AgencyPolicyScope` types it as a
 *   number, so an appointment with no rate agreed yet would have to read as
 *   zero — and a zero rate is a real rate somebody could book against. Null says
 *   "nobody has agreed this yet", and the screen says so in those words.
 *
 *   A sub-agent cap may be *absent*, which §9 is explicit is not the same as a
 *   cap of zero: with no cap set the agent's own percentage is the ceiling. That
 *   is exactly the `capPercentBp?: number` that `subAgentShareWithinCap` reads,
 *   so null here maps to `undefined` there and the guard decides.
 *
 * Percentages are integer basis points throughout, matching
 * `src/domain/workflows/commissionShare`. Nothing here is a `Money`.
 */

import type {
  Agency,
  AgencyPolicyScope,
  AgencyType,
  Agent,
  BenefitItem,
  BenefitValueKind,
  ChecklistPurpose,
  Company,
  CompanyContact,
  DocChecklist,
  InsuranceLine,
  PolicyBenefitMap,
  Product,
} from '../../../data/repo'

/* ---------------------------------------------------------------- companies */

/**
 * A company as the market screen reads it. Unchanged from the repository record
 * on purpose: a company is per line of business already, which is what makes
 * HDFC Life and HDFC General two rows rather than one row with a flag.
 */
export type ConfigCompany = Company

/**
 * An insurer contact, filed under the inquiry category they answer for. Null is
 * "every category" — the relationship manager who takes any call.
 *
 * Plan §5 asks for "contacts per category" because the desk that needs the name
 * is the desk holding the record: a health claim wants the health contact, and a
 * motor renewal wants the motor one.
 */
export type ConfigCompanyContact = CompanyContact & {
  readonly categoryId: string | null
}

/* ----------------------------------------------------------------- products */

export type ConfigProduct = Product
export type ConfigChecklist = DocChecklist

/* ----------------------------------------------------------------- benefits */

/**
 * A benefit as the catalogue holds it — FR-06.4's "label, field type, options,
 * default, section, display order".
 *
 * `options` are the readings a configurator picked off the brochure, offered on
 * the product map so the same wording comes back every time. They are suggestions
 * for a *text* field, never a computed value: the composer still records what the
 * brochure says.
 */
export type ConfigBenefitItem = BenefitItem & {
  /** The heading this benefit sits under on the sheet. */
  readonly section: string
  /** Readings offered on the product map. Empty means free text. */
  readonly options: readonly string[]
  /** What a newly mapped product row starts on. Empty means nothing pre-filled. */
  readonly defaultValue: string
}

export type ConfigBenefitMap = PolicyBenefitMap

/* ----------------------------------------------------------------- agencies */

export type ConfigAgency = Agency

/** One appointed company-and-policy line. Null rate means nobody has agreed one. */
export type ConfigAgencyScope = Omit<AgencyPolicyScope, 'commissionPercentBp'> & {
  readonly commissionPercentBp: number | null
}

/* ------------------------------------------------------------------- agents */

/** Null cap is §9's "no cap set": the agent's own percentage is the ceiling. */
export type ConfigAgent = Omit<Agent, 'subAgentCapPercentBp'> & {
  readonly subAgentCapPercentBp: number | null
}

/* ------------------------------------------------------------------- labels */

export const LINE_LABELS: Readonly<Record<InsuranceLine, string>> = {
  health: 'Health',
  motor: 'Motor',
  life: 'Life',
  travel: 'Travel',
  property: 'Property',
}

export const AGENCY_TYPE_LABELS: Readonly<Record<AgencyType, string>> = {
  individual: 'Individual',
  broker: 'Broker',
}

export const CHECKLIST_PURPOSE_LABELS: Readonly<Record<ChecklistPurpose, string>> = {
  kyc: 'KYC documents',
  policy: 'Policy documents',
  claim: 'Claim documents',
}

export const BENEFIT_KIND_LABELS: Readonly<Record<BenefitValueKind, string>> = {
  amount: 'Amount, as the brochure prints it',
  text: 'Text',
  covered: 'Covered or not',
}

/**
 * Life is written by a separately licensed entity from every general line. It is
 * the reason HDFC Life and HDFC General are two companies here.
 */
export const LIFE_LINE: InsuranceLine = 'life'
