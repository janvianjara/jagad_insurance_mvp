/**
 * The data layer's public surface — plan §7.
 *
 * Everything a screen may know about persistence is here: the entity types and
 * one repository interface per cluster. Fixtures are not exported and never
 * imported by a component; the only way to a record is through a repository, and
 * the only implementation of these interfaces in the MVP is the mock adapter in
 * `src/data/mock/`. Swapping in a real API means writing a second implementation,
 * not editing a screen.
 */

export * from './query'
export * from './result'
export * from './classification'

export * from './config'
export * from './recipes'
export * from './companies'
export * from './products'
export * from './benefits'
export * from './agencies'
export * from './agents'
export * from './customers'
export * from './inquiries'
export * from './quotations'
export * from './deals'
export * from './policies'
export * from './tasks'
export * from './activities'
export * from './requirements'
export * from './documents'
export * from './commission'
export * from './claims'
export * from './endorsements'
export * from './notices'
export * from './templates'
export * from './integrations'

import type { AgencyRepository } from './agencies'
import type { AgentRepository } from './agents'
import type { BenefitRepository } from './benefits'
import type { ClaimRepository } from './claims'
import type { CommissionRepository } from './commission'
import type { CompanyRepository } from './companies'
import type { ConfigRepository } from './config'
import type { CustomerRepository } from './customers'
import type { DealRepository } from './deals'
import type { DocumentRepository } from './documents'
import type { EndorsementRepository } from './endorsements'
import type { InquiryRepository } from './inquiries'
import type { IntegrationRepository } from './integrations'
import type { NoticeBatchRepository, OcrTemplateRepository } from './notices'
import type {
  CollectionRepository,
  PolicyRepository,
  PremiumScheduleRepository,
} from './policies'
import type { ProductRepository } from './products'
import type { QuotationRepository } from './quotations'
import type { RecipeRunRepository } from './recipes'
import type { ActivityRepository } from './activities'
import type { RequirementRepository } from './requirements'
import type { RenewalRepository, TaskRepository } from './tasks'
import type { MessageTemplateRepository } from './templates'

/**
 * Every repository, in one bag. The app resolves this once at boot and passes it
 * down; a feature takes the one interface it needs, never the bag.
 */
export type Repositories = {
  readonly config: ConfigRepository
  /** FR-21.5's run ledger. Written by the dispatcher, read by /config/automation. */
  readonly recipeRuns: RecipeRunRepository
  readonly companies: CompanyRepository
  readonly products: ProductRepository
  readonly benefits: BenefitRepository
  readonly agencies: AgencyRepository
  readonly agents: AgentRepository
  readonly customers: CustomerRepository
  readonly inquiries: InquiryRepository
  readonly quotations: QuotationRepository
  readonly deals: DealRepository
  readonly policies: PolicyRepository
  readonly schedules: PremiumScheduleRepository
  readonly collections: CollectionRepository
  readonly tasks: TaskRepository
  readonly activities: ActivityRepository
  readonly requirements: RequirementRepository
  readonly renewals: RenewalRepository
  readonly documents: DocumentRepository
  readonly commission: CommissionRepository
  readonly claims: ClaimRepository
  readonly endorsements: EndorsementRepository
  readonly noticeBatches: NoticeBatchRepository
  readonly ocrTemplates: OcrTemplateRepository
  readonly templates: MessageTemplateRepository
  readonly integrations: IntegrationRepository
}
