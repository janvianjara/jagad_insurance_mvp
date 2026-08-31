/**
 * The fixture set — plan §8.
 *
 * Three layers, assembled here: the configuration seed a client would recognise,
 * the hand-written story cast the prototype walkthrough runs on, and the volume
 * set generated from a fixed seed. `buildFixtures` is pure — same seed, same
 * anchor, same set — so the determinism test can compare two builds and the mock
 * adapter can hand every session an identical starting point.
 *
 * Nothing outside `src/data` imports this. Components read repositories; the
 * repositories read a store hydrated from here. That rule is what keeps the
 * loading, empty and error states real rather than something discovered in UAT.
 */

import type { Activity } from '../repo/activities'
import type { RequirementRecord } from '../repo/requirements'
import type { Agency, AgencyPolicyScope } from '../repo/agencies'
import type { Agent, CommissionSplit } from '../repo/agents'
import type { BenefitItem, PolicyBenefitMap } from '../repo/benefits'
import type { Claim } from '../repo/claims'
import type { CommissionRule, LedgerEntry } from '../repo/commission'
import type { Company, CompanyContact } from '../repo/companies'
import type {
  Disposition,
  FormSchema,
  InquiryCategory,
  InquiryStage,
  MasterType,
  MasterValue,
  MessageLog,
  MessageTemplate,
  Recipe,
  RetentionClass,
  StaffUser,
  Team,
} from '../repo/config'
import type {
  ConsentRecord,
  Customer,
  CustomerCredential,
  Household,
  Member,
} from '../repo/customers'
import type { Deal } from '../repo/deals'
import type { DocumentRecord } from '../repo/documents'
import type { Endorsement } from '../repo/endorsements'
import type { Inquiry } from '../repo/inquiries'
import type { IntegrationConfig } from '../repo/integrations'
import type { NoticeBatch, NoticeMatch, OcrTemplate } from '../repo/notices'
import type {
  CollectionRecord,
  InstalmentDue,
  Mandate,
  MandateEvent,
  Policy,
  PolicyDispatch,
  PolicyEntryDraft,
  PolicyNcb,
  PolicyPremiumComponent,
  PolicyVersion,
  PremiumSchedule,
} from '../repo/policies'
import type { DocChecklist, Product } from '../repo/products'
import type { Quotation, QuotationLine } from '../repo/quotations'
import type { RecipeRun } from '../repo/recipes'
import type { RenewalTask, Task } from '../repo/tasks'

import * as seed from './config-seed'
import * as servicing from './servicing-cast'
import * as story from './story-cast'
import { FIXTURE_NOW } from './clock'
import { DEFAULT_FIXTURE_SEED } from './prng'
import { DEFAULT_VOLUME, buildVolume } from './volume'
import type { VolumeCounts } from './volume'

export type FixtureSet = {
  /* configuration */
  readonly users: readonly StaffUser[]
  readonly teams: readonly Team[]
  readonly categories: readonly InquiryCategory[]
  readonly masterTypes: readonly MasterType[]
  readonly masterValues: readonly MasterValue[]
  /** The engagement vocabulary, FR-06.12 and .14. */
  readonly inquiryStages: readonly InquiryStage[]
  readonly dispositions: readonly Disposition[]
  readonly retentionClasses: readonly RetentionClass[]
  readonly formSchemas: readonly FormSchema[]
  readonly recipes: readonly Recipe[]
  /**
   * FR-21.5's ledger, seeded empty on purpose. Every other table here carries
   * rows because the agency has a history; this one starts blank because a run
   * is something the dispatcher did, and seeding it would be the same lie the
   * 800 seeded tasks told — a queue that looks alive because somebody dealt it.
   */
  readonly recipeRuns: readonly RecipeRun[]
  readonly messageTemplates: readonly MessageTemplate[]
  readonly ocrTemplates: readonly OcrTemplate[]
  readonly integrations: readonly IntegrationConfig[]

  /* market and channel */
  readonly companies: readonly Company[]
  readonly companyContacts: readonly CompanyContact[]
  readonly products: readonly Product[]
  readonly docChecklists: readonly DocChecklist[]
  readonly benefitItems: readonly BenefitItem[]
  readonly policyBenefitMaps: readonly PolicyBenefitMap[]
  readonly agencies: readonly Agency[]
  readonly agencyScopes: readonly AgencyPolicyScope[]
  readonly agents: readonly Agent[]
  readonly commissionSplits: readonly CommissionSplit[]
  readonly commissionRules: readonly CommissionRule[]

  /* customers */
  readonly households: readonly Household[]
  readonly customers: readonly Customer[]
  readonly members: readonly Member[]
  readonly consentRecords: readonly ConsentRecord[]
  readonly customerCredentials: readonly CustomerCredential[]

  /* demand */
  readonly inquiries: readonly Inquiry[]
  readonly quotations: readonly Quotation[]
  readonly quotationLines: readonly QuotationLine[]
  readonly deals: readonly Deal[]

  /* contract */
  readonly policies: readonly Policy[]
  readonly policyVersions: readonly PolicyVersion[]
  readonly policyPremiumComponents: readonly PolicyPremiumComponent[]
  readonly policyNcbs: readonly PolicyNcb[]
  readonly policyDispatches: readonly PolicyDispatch[]
  readonly policyDrafts: readonly PolicyEntryDraft[]
  readonly premiumSchedules: readonly PremiumSchedule[]
  readonly instalments: readonly InstalmentDue[]
  readonly mandates: readonly Mandate[]
  readonly mandateEvents: readonly MandateEvent[]
  readonly collections: readonly CollectionRecord[]
  readonly endorsements: readonly Endorsement[]

  /* work and records */
  readonly tasks: readonly Task[]
  /** What was said, FR-06.13. Append-only in the repository, seeded here. */
  readonly activities: readonly Activity[]
  /** Captured requirements, FR-06.16 — the composer's missing input. */
  readonly requirements: readonly RequirementRecord[]
  readonly renewalTasks: readonly RenewalTask[]
  readonly documents: readonly DocumentRecord[]
  readonly claims: readonly Claim[]
  readonly noticeBatches: readonly NoticeBatch[]
  readonly noticeMatches: readonly NoticeMatch[]
  readonly messageLogs: readonly MessageLog[]
  readonly ledgerEntries: readonly LedgerEntry[]
}

export type FixtureOptions = {
  readonly seed?: number
  /** The anchor every relative date is written against. */
  readonly now?: Date
  readonly volume?: VolumeCounts
}

/** No generated rows: the story cast alone, for a test that wants to read output. */
export const STORY_ONLY: VolumeCounts = { customers: 0, policies: 0, tasks: 0 }

export function buildFixtures(options: FixtureOptions = {}): FixtureSet {
  const {
    seed: fixtureSeed = DEFAULT_FIXTURE_SEED,
    now = FIXTURE_NOW,
    volume = DEFAULT_VOLUME,
  } = options

  const generated = buildVolume(fixtureSeed, now, volume)

  return {
    users: seed.USERS,
    teams: seed.TEAMS,
    categories: seed.INQUIRY_CATEGORIES,
    masterTypes: seed.MASTER_TYPES,
    masterValues: seed.MASTER_VALUES,
    inquiryStages: seed.INQUIRY_STAGES,
    dispositions: seed.DISPOSITIONS,
    retentionClasses: seed.RETENTION_CLASSES,
    formSchemas: seed.FORM_SCHEMAS,
    recipes: seed.RECIPES,
    recipeRuns: [],
    messageTemplates: seed.MESSAGE_TEMPLATES,
    ocrTemplates: servicing.OCR_TEMPLATES,
    integrations: servicing.INTEGRATIONS,

    companies: seed.COMPANIES,
    companyContacts: seed.COMPANY_CONTACTS,
    products: seed.PRODUCTS,
    docChecklists: seed.DOC_CHECKLISTS,
    benefitItems: seed.BENEFIT_ITEMS,
    policyBenefitMaps: seed.POLICY_BENEFIT_MAPS,
    agencies: seed.AGENCIES,
    agencyScopes: seed.AGENCY_SCOPES,
    agents: seed.AGENTS,
    commissionSplits: seed.COMMISSION_SPLITS,
    commissionRules: seed.COMMISSION_RULES,

    households: story.HOUSEHOLDS,
    // Story records first, so a table that opens unsorted shows the cast the
    // client recognises rather than three hundred generated strangers.
    customers: [...story.CUSTOMERS, ...generated.customers],
    members: story.MEMBERS,
    consentRecords: story.CONSENT_RECORDS,
    customerCredentials: story.CUSTOMER_CREDENTIALS,

    inquiries: story.INQUIRIES,
    quotations: story.QUOTATIONS,
    quotationLines: story.QUOTATION_LINES,
    deals: story.DEALS,

    policies: [...story.POLICIES, ...generated.policies],
    // Version 2 of POL-4388 was written by an endorsement, so it arrives with the
    // record that produced it rather than with the issue that produced version 1.
    policyVersions: [...story.POLICY_VERSIONS, ...servicing.ENDORSEMENT_POLICY_VERSIONS],
    policyPremiumComponents: story.POLICY_PREMIUM_COMPONENTS,
    policyNcbs: story.POLICY_NCBS,
    policyDispatches: story.POLICY_DISPATCHES,
    policyDrafts: story.POLICY_DRAFTS,
    premiumSchedules: story.PREMIUM_SCHEDULES,
    instalments: story.INSTALMENTS,
    mandates: story.MANDATES,
    mandateEvents: story.MANDATE_EVENTS,
    collections: story.COLLECTIONS,
    endorsements: servicing.ENDORSEMENTS,

    tasks: [...story.TASKS, ...generated.tasks],
    activities: story.ACTIVITIES,
    requirements: story.REQUIREMENTS,
    renewalTasks: story.RENEWAL_TASKS,
    documents: [...story.DOCUMENTS, ...servicing.SERVICING_DOCUMENTS],
    claims: story.CLAIMS,
    noticeBatches: servicing.NOTICE_BATCHES,
    noticeMatches: servicing.NOTICE_MATCHES,
    messageLogs: story.MESSAGE_LOGS,
    ledgerEntries: story.LEDGER_ENTRIES,
  }
}

export { FIXTURE_NOW } from './clock'
export { DEFAULT_FIXTURE_SEED } from './prng'
export { DEFAULT_VOLUME } from './volume'
export type { VolumeCounts } from './volume'
