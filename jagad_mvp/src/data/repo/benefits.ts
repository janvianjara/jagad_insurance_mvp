/**
 * Market — the benefit catalogue and the product maps. Plan §8, canvas 2.1-2.2.
 *
 * The quotation composer opens on "the union of mapped benefit rows, a column per
 * company, defaults pre-filled". Both halves of that sentence live here: the
 * catalogue of benefit items, and the per-product map that says which items apply
 * and what the default value reads as.
 *
 * Canvas 2.2 is the reason the catalogue is a repository read and not a constant:
 * an ad-hoc row added on one quotation appears on that quotation only and leaves
 * the catalogue untouched. The ad-hoc row therefore lives on the quotation
 * (`QuotationBenefitRow.adHoc`), never here.
 */

import type { InsuranceLine } from './companies'
import type { ReadRepository } from './query'

/** How a benefit value reads on the matrix. Values are typed text, never derived. */
export const BENEFIT_VALUE_KINDS = {
  amount: 'amount',
  text: 'text',
  covered: 'covered',
} as const

export type BenefitValueKind = (typeof BENEFIT_VALUE_KINDS)[keyof typeof BENEFIT_VALUE_KINDS]

export type BenefitItem = {
  readonly id: string
  readonly key: string
  readonly label: string
  readonly line: InsuranceLine
  readonly valueKind: BenefitValueKind
  readonly sortOrder: number
  readonly active: boolean
}

/**
 * One row of one product's benefit sheet. `defaultValue` is the text the composer
 * pre-fills, taken from the brochure by whoever configured the product — the
 * platform does not derive it and does not price it.
 */
export type PolicyBenefitMap = {
  readonly id: string
  readonly productId: string
  readonly benefitItemId: string
  readonly defaultValue: string
  readonly sortOrder: number
}

export type BenefitRepository = ReadRepository<BenefitItem> & {
  forLine(line: InsuranceLine): Promise<readonly BenefitItem[]>
  mapsForProduct(productId: string): Promise<readonly PolicyBenefitMap[]>
  /** The composer's opening state: the union of mapped rows across the picked products. */
  unionForProducts(productIds: readonly string[]): Promise<readonly PolicyBenefitMap[]>
}
