/**
 * Market — companies and their contacts. Plan §8, cluster "Market".
 *
 * Canvas 6.1: adding an insurer partnership makes the company available across
 * quotation, placement and claims "with its contacts". The contacts are part of
 * the record for that reason — a claims desk that has to phone the insurer needs
 * the name from the same place the quotation composer reads the company from.
 */

import type { ReadRepository } from './query'

/** The business lines the agency writes. A company is appointed per line. */
export const INSURANCE_LINES = {
  health: 'health',
  motor: 'motor',
  life: 'life',
  travel: 'travel',
  property: 'property',
} as const

export type InsuranceLine = (typeof INSURANCE_LINES)[keyof typeof INSURANCE_LINES]

export type Company = {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly shortName: string
  readonly lines: readonly InsuranceLine[]
  readonly claimsEmail: string
  readonly active: boolean
}

export type CompanyContact = {
  readonly id: string
  readonly companyId: string
  readonly name: string
  readonly role: string
  readonly mobile: string
  readonly email: string
}

export type CompanyRepository = ReadRepository<Company> & {
  byKey(key: string): Promise<Company | null>
  contacts(companyId: string): Promise<readonly CompanyContact[]>
  /** Companies appointed for a line — the placement picker reads this. */
  forLine(line: InsuranceLine): Promise<readonly Company[]>
}
