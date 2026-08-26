/**
 * Market — products and the document checklists they carry. Plan §8.
 *
 * A product is a company's named policy: HDFC Ergo Optima Secure, LIC Jeevan
 * Anand. It names the form schema its entry screen renders under (canvas 6.2)
 * and the checklist its KYC, policy and claim document lists come from — both by
 * id, so an admin changing either does not touch a product row.
 */

import type { InsuranceLine } from './companies'
import type { ReadRepository } from './query'

export type Product = {
  readonly id: string
  readonly companyId: string
  readonly code: string
  readonly name: string
  readonly line: InsuranceLine
  /** The inquiry category this product answers, so routing and catalogue agree. */
  readonly categoryId: string
  /** Absent means the object's fallback schema renders the entry form. */
  readonly formSchemaId: string | null
  readonly active: boolean
}

/** Which checklist a set of documents belongs to. */
export const CHECKLIST_PURPOSES = {
  kyc: 'kyc',
  policy: 'policy',
  claim: 'claim',
} as const

export type ChecklistPurpose = (typeof CHECKLIST_PURPOSES)[keyof typeof CHECKLIST_PURPOSES]

export type DocChecklist = {
  readonly id: string
  readonly companyId: string
  /** Null means the checklist applies to every product of this company. */
  readonly productId: string | null
  readonly purpose: ChecklistPurpose
  readonly items: readonly string[]
}

export type ProductRepository = ReadRepository<Product> & {
  forCompany(companyId: string): Promise<readonly Product[]>
  forLine(line: InsuranceLine): Promise<readonly Product[]>
  checklist(productId: string, purpose: ChecklistPurpose): Promise<DocChecklist | null>
  checklists(): Promise<readonly DocChecklist[]>
}
