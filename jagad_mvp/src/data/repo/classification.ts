/**
 * Field classification for the data layer — plan §14.1, layer 1 of three.
 *
 * `src/domain/dataclass.ts` classifies the seven M0 entities, and its own test
 * asserts that `ENTITY_NAMES` is exactly those seven. The data layer introduces
 * another thirty-odd entity types — the configuration, market, channel, work and
 * money clusters of §8 — and every one of their fields still needs a class,
 * because the Assistant boundary is an allow-list and an allow-list built on an
 * incomplete registry is a deny-list wearing a disguise.
 *
 * So this file is the staging area. It mirrors the domain registry exactly: the
 * same four classes, the same `Classified` / `AssertFullyClassified` pair, the
 * same rule that an unclassified field is a compile error. When the domain
 * registry is next widened past the seven M0 entities, these entries move across
 * unchanged and this file goes away.
 *
 * What is worth reading rather than skimming: the three `sensitive` entries.
 * `Mandate.reference` and `Mandate.bankName` are bank details, and the platform
 * records that a mandate exists precisely so it never has to hold a credential.
 * `CustomerCredential.username` is an account identifier for a portal login. And
 * `Claim.companyRemark` is `document-content` because an insurer's remark on a
 * health claim routinely carries a diagnosis, and diagnosis text never reaches
 * Assistant code.
 */

import type { DataClass, EntityName, FieldOf } from '../../domain/dataclass'
import type { Customer, Household, Member, ConsentRecord, CustomerCredential } from './customers'
import type { Inquiry } from './inquiries'
import type { Quotation, QuotationLine } from './quotations'
import type { Deal } from './deals'
import type {
  CollectionRecord,
  InstalmentDue,
  Mandate,
  MandateEvent,
  Policy,
  PolicyEntryDraft,
  PolicyVersion,
  PremiumSchedule,
} from './policies'
import type { DocumentRecord } from './documents'
import type { Company, CompanyContact } from './companies'
import type { DocChecklist, Product } from './products'
import type { BenefitItem, PolicyBenefitMap } from './benefits'
import type { Agency, AgencyPolicyScope } from './agencies'
import type { Agent, CommissionSplit } from './agents'
import type { RenewalTask, Task } from './tasks'
import type { CommissionRule, LedgerEntry } from './commission'
import type { Claim } from './claims'
import type {
  FormSchema,
  InquiryCategory,
  MasterType,
  MasterValue,
  MessageLog,
  MessageTemplate,
  Recipe,
  RetentionClass,
  StaffUser,
  Team,
} from './config'

/**
 * The direction `AssertFullyClassified` does not cover: names any classified
 * field the entity type forgot to declare. Together the two make the entity and
 * the registry the same set of names, checked by the compiler.
 */
export type AssertCoversRegistry<E extends EntityName, T> =
  Exclude<FieldOf<E>, Extract<keyof T, string>> extends never
    ? true
    : { missingClassifiedFields: Exclude<FieldOf<E>, Extract<keyof T, string>> }

/** The data-layer registry. Same shape, same rules, different entities. */
export const DATA_FIELD_CLASSES = {
  Household: {
    id: 'operational',
    headCustomerId: 'operational',
    customerIds: 'operational',
    city: 'contact',
    name: 'contact',
  },

  ConsentRecord: {
    id: 'operational',
    customerId: 'operational',
    state: 'operational',
    channel: 'operational',
    issuedAt: 'operational',
    expiresAt: 'operational',
    submittedAt: 'operational',
    /** The link token authorises a form. It is a secret, not an operational fact. */
    token: 'sensitive',
  },

  CustomerCredential: {
    id: 'operational',
    customerId: 'operational',
    issuedAt: 'operational',
    channel: 'operational',
    active: 'operational',
    username: 'sensitive',
  },

  QuotationLine: {
    id: 'operational',
    quotationId: 'operational',
    version: 'operational',
    columnKey: 'operational',
    label: 'operational',
    companyId: 'operational',
    productId: 'operational',
    finalPayablePremium: 'operational',
    finalPremiumSource: 'operational',
    benefitValues: 'operational',
    locked: 'operational',
  },

  PolicyVersion: {
    id: 'operational',
    policyId: 'operational',
    version: 'operational',
    effectiveFrom: 'operational',
    endorsementNo: 'operational',
    insurerEndorsementNo: 'operational',
    note: 'operational',
    createdAt: 'operational',
    documentId: 'document-content',
  },

  PolicyEntryDraft: {
    id: 'operational',
    policyId: 'operational',
    dealId: 'operational',
    entryPath: 'operational',
    formSchemaId: 'operational',
    schemaVersion: 'operational',
    missingFields: 'operational',
    savedBy: 'operational',
    savedAt: 'operational',
  },

  PremiumSchedule: {
    id: 'operational',
    policyId: 'operational',
    state: 'operational',
    mode: 'operational',
    instalmentAmount: 'operational',
    instalmentAmountSource: 'operational',
    instalmentCount: 'operational',
    debitDay: 'operational',
    graceDays: 'operational',
    startDate: 'operational',
    createdAt: 'operational',
    supersededByScheduleId: 'operational',
  },

  InstalmentDue: {
    id: 'operational',
    scheduleId: 'operational',
    policyId: 'operational',
    sequence: 'operational',
    dueDate: 'operational',
    amount: 'operational',
    state: 'operational',
    collectionRecordId: 'operational',
    paidAt: 'operational',
  },

  Mandate: {
    id: 'operational',
    policyId: 'operational',
    customerId: 'operational',
    kind: 'operational',
    debitDay: 'operational',
    validFrom: 'operational',
    validUntil: 'operational',
    state: 'operational',
    registeredBy: 'operational',
    registeredAt: 'operational',
    reference: 'sensitive',
    bankName: 'sensitive',
  },

  MandateEvent: {
    id: 'operational',
    mandateId: 'operational',
    occurredAt: 'operational',
    outcome: 'operational',
    failureReason: 'operational',
    reference: 'sensitive',
  },

  CollectionRecord: {
    id: 'operational',
    policyId: 'operational',
    customerId: 'operational',
    agencyId: 'operational',
    state: 'operational',
    route: 'operational',
    instrument: 'operational',
    mode: 'operational',
    amount: 'operational',
    collectedBy: 'operational',
    collectedAt: 'operational',
    verifiedBy: 'operational',
    verifiedAt: 'operational',
    bounceReason: 'operational',
    instalmentId: 'operational',
    /** A cheque number or a bank transaction reference. */
    reference: 'sensitive',
  },

  Company: {
    id: 'operational',
    key: 'operational',
    name: 'operational',
    shortName: 'operational',
    lines: 'operational',
    active: 'operational',
    claimsEmail: 'contact',
  },

  CompanyContact: {
    id: 'operational',
    companyId: 'operational',
    role: 'operational',
    name: 'contact',
    mobile: 'contact',
    email: 'contact',
  },

  Product: {
    id: 'operational',
    companyId: 'operational',
    code: 'operational',
    name: 'operational',
    line: 'operational',
    categoryId: 'operational',
    formSchemaId: 'operational',
    active: 'operational',
  },

  DocChecklist: {
    id: 'operational',
    companyId: 'operational',
    productId: 'operational',
    purpose: 'operational',
    items: 'operational',
  },

  BenefitItem: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    line: 'operational',
    valueKind: 'operational',
    sortOrder: 'operational',
    active: 'operational',
  },

  PolicyBenefitMap: {
    id: 'operational',
    productId: 'operational',
    benefitItemId: 'operational',
    defaultValue: 'operational',
    sortOrder: 'operational',
  },

  Agency: {
    id: 'operational',
    code: 'operational',
    name: 'operational',
    type: 'operational',
    companyIds: 'operational',
    city: 'operational',
    active: 'operational',
  },

  AgencyPolicyScope: {
    id: 'operational',
    agencyId: 'operational',
    companyId: 'operational',
    productId: 'operational',
    commissionPercentBp: 'operational',
    effectiveFrom: 'operational',
    active: 'operational',
  },

  Agent: {
    id: 'operational',
    code: 'operational',
    agencyId: 'operational',
    userId: 'operational',
    parentAgentId: 'operational',
    categoryIds: 'operational',
    sharePercentBp: 'operational',
    canGrantSubAgents: 'operational',
    subAgentCapPercentBp: 'operational',
    directUpdatesEnabled: 'operational',
    active: 'operational',
    name: 'contact',
    mobile: 'contact',
    email: 'contact',
    city: 'contact',
  },

  CommissionSplit: {
    id: 'operational',
    agencyId: 'operational',
    companyId: 'operational',
    productId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    agentSharePercentBp: 'operational',
    subAgentSharePercentBp: 'operational',
    effectiveFrom: 'operational',
  },

  Task: {
    id: 'operational',
    systemNo: 'operational',
    kind: 'operational',
    subjectEntity: 'operational',
    subjectId: 'operational',
    ownerId: 'operational',
    teamId: 'operational',
    agentId: 'operational',
    state: 'operational',
    priority: 'operational',
    dueAt: 'operational',
    createdAt: 'operational',
    completedAt: 'operational',
    raisedBy: 'operational',
    /** A task title routinely names the customer it is about. */
    title: 'contact',
  },

  RenewalTask: {
    id: 'operational',
    policyId: 'operational',
    customerId: 'operational',
    state: 'operational',
    dueOn: 'operational',
    expiryDate: 'operational',
    assigneeId: 'operational',
    remindersSent: 'operational',
    lastReminderAt: 'operational',
    lapseReason: 'operational',
    createdAt: 'operational',
  },

  CommissionRule: {
    id: 'operational',
    agencyId: 'operational',
    companyId: 'operational',
    productId: 'operational',
    basisPercentBp: 'operational',
    effectiveFrom: 'operational',
    effectiveTo: 'operational',
    active: 'operational',
  },

  LedgerEntry: {
    id: 'operational',
    policyId: 'operational',
    agencyId: 'operational',
    agentId: 'operational',
    subAgentId: 'operational',
    kind: 'operational',
    amount: 'operational',
    bookedAt: 'operational',
    bookedBy: 'operational',
    note: 'operational',
  },

  StaffUser: {
    id: 'operational',
    templateKey: 'operational',
    teamId: 'operational',
    agentId: 'operational',
    parentAgentId: 'operational',
    categoryIds: 'operational',
    roleLabel: 'operational',
    active: 'operational',
    name: 'contact',
    email: 'contact',
    mobile: 'contact',
  },

  Team: {
    id: 'operational',
    name: 'operational',
    leadUserId: 'operational',
    memberUserIds: 'operational',
  },

  InquiryCategory: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    line: 'operational',
    teamId: 'operational',
    tatMinutes: 'operational',
    memberUserIds: 'operational',
  },

  MasterType: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    editable: 'operational',
  },

  MasterValue: {
    id: 'operational',
    masterTypeId: 'operational',
    key: 'operational',
    label: 'operational',
    sortOrder: 'operational',
    active: 'operational',
  },

  RetentionClass: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    years: 'operational',
  },

  FormSchema: {
    id: 'operational',
    objectKey: 'operational',
    productId: 'operational',
    version: 'operational',
    stages: 'operational',
    publishedAt: 'operational',
    active: 'operational',
  },

  Recipe: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    version: 'operational',
    trigger: 'operational',
    parameters: 'operational',
    active: 'operational',
    updatedAt: 'operational',
  },

  MessageTemplate: {
    id: 'operational',
    key: 'operational',
    label: 'operational',
    channel: 'operational',
    subject: 'operational',
    body: 'operational',
    active: 'operational',
  },

  MessageLog: {
    id: 'operational',
    templateKey: 'operational',
    channel: 'operational',
    subjectEntity: 'operational',
    subjectId: 'operational',
    sentAt: 'operational',
    state: 'operational',
    toName: 'contact',
    toAddress: 'contact',
  },

  Claim: {
    id: 'operational',
    systemNo: 'operational',
    insurerNo: 'operational',
    policyId: 'operational',
    customerId: 'operational',
    memberId: 'operational',
    claimType: 'operational',
    state: 'operational',
    ownerId: 'operational',
    agentId: 'operational',
    raisedAt: 'operational',
    intimatedAt: 'operational',
    settlement: 'operational',
    documentIds: 'operational',
    checklistItems: 'operational',
    documentsCollected: 'operational',
    /** An insurer remark on a health claim carries diagnosis text. */
    companyRemark: 'document-content',
  },
} as const satisfies Record<string, Record<string, DataClass>>

export type DataEntityName = keyof typeof DATA_FIELD_CLASSES
export type DataFieldOf<E extends DataEntityName> = Extract<
  keyof (typeof DATA_FIELD_CLASSES)[E],
  string
>

export const DATA_ENTITY_NAMES = Object.keys(DATA_FIELD_CLASSES) as DataEntityName[]

export type ClassifiedData<E extends DataEntityName> = Record<DataFieldOf<E>, unknown>

export type AssertFullyClassifiedData<E extends DataEntityName, T> =
  Exclude<Extract<keyof T, string>, DataFieldOf<E>> extends never
    ? true
    : { unclassifiedFields: Exclude<Extract<keyof T, string>, DataFieldOf<E>> }

export type AssertCoversDataRegistry<E extends DataEntityName, T> =
  Exclude<DataFieldOf<E>, Extract<keyof T, string>> extends never
    ? true
    : { missingClassifiedFields: Exclude<DataFieldOf<E>, Extract<keyof T, string>> }

/** Both directions in one check, so a single `satisfies true` covers an entity. */
type Registered<E extends DataEntityName, T> =
  AssertFullyClassifiedData<E, T> extends true
    ? AssertCoversDataRegistry<E, T>
    : AssertFullyClassifiedData<E, T>

type DomainRegistered<E extends EntityName, T> =
  Exclude<Extract<keyof T, string>, FieldOf<E>> extends never
    ? AssertCoversRegistry<E, T>
    : { unclassifiedFields: Exclude<Extract<keyof T, string>, FieldOf<E>> }

/**
 * The seven entities the domain registry already classifies. Each entry fails to
 * compile if the entity type here and the registry there stop being the same set
 * of field names — in either direction.
 */
export const DOMAIN_ENTITIES_ARE_CLASSIFIED = {
  Customer: true satisfies DomainRegistered<'Customer', Customer>,
  Member: true satisfies DomainRegistered<'Member', Member>,
  Policy: true satisfies DomainRegistered<'Policy', Policy>,
  Document: true satisfies DomainRegistered<'Document', DocumentRecord>,
  Inquiry: true satisfies DomainRegistered<'Inquiry', Inquiry>,
  Quotation: true satisfies DomainRegistered<'Quotation', Quotation>,
  Deal: true satisfies DomainRegistered<'Deal', Deal>,
} as const

/** The same check for every entity this layer added. */
export const DATA_ENTITIES_ARE_CLASSIFIED = {
  Household: true satisfies Registered<'Household', Household>,
  ConsentRecord: true satisfies Registered<'ConsentRecord', ConsentRecord>,
  CustomerCredential: true satisfies Registered<'CustomerCredential', CustomerCredential>,
  QuotationLine: true satisfies Registered<'QuotationLine', QuotationLine>,
  PolicyVersion: true satisfies Registered<'PolicyVersion', PolicyVersion>,
  PolicyEntryDraft: true satisfies Registered<'PolicyEntryDraft', PolicyEntryDraft>,
  PremiumSchedule: true satisfies Registered<'PremiumSchedule', PremiumSchedule>,
  InstalmentDue: true satisfies Registered<'InstalmentDue', InstalmentDue>,
  Mandate: true satisfies Registered<'Mandate', Mandate>,
  MandateEvent: true satisfies Registered<'MandateEvent', MandateEvent>,
  CollectionRecord: true satisfies Registered<'CollectionRecord', CollectionRecord>,
  Company: true satisfies Registered<'Company', Company>,
  CompanyContact: true satisfies Registered<'CompanyContact', CompanyContact>,
  Product: true satisfies Registered<'Product', Product>,
  DocChecklist: true satisfies Registered<'DocChecklist', DocChecklist>,
  BenefitItem: true satisfies Registered<'BenefitItem', BenefitItem>,
  PolicyBenefitMap: true satisfies Registered<'PolicyBenefitMap', PolicyBenefitMap>,
  Agency: true satisfies Registered<'Agency', Agency>,
  AgencyPolicyScope: true satisfies Registered<'AgencyPolicyScope', AgencyPolicyScope>,
  Agent: true satisfies Registered<'Agent', Agent>,
  CommissionSplit: true satisfies Registered<'CommissionSplit', CommissionSplit>,
  Task: true satisfies Registered<'Task', Task>,
  RenewalTask: true satisfies Registered<'RenewalTask', RenewalTask>,
  CommissionRule: true satisfies Registered<'CommissionRule', CommissionRule>,
  LedgerEntry: true satisfies Registered<'LedgerEntry', LedgerEntry>,
  StaffUser: true satisfies Registered<'StaffUser', StaffUser>,
  Team: true satisfies Registered<'Team', Team>,
  InquiryCategory: true satisfies Registered<'InquiryCategory', InquiryCategory>,
  MasterType: true satisfies Registered<'MasterType', MasterType>,
  MasterValue: true satisfies Registered<'MasterValue', MasterValue>,
  RetentionClass: true satisfies Registered<'RetentionClass', RetentionClass>,
  FormSchema: true satisfies Registered<'FormSchema', FormSchema>,
  Recipe: true satisfies Registered<'Recipe', Recipe>,
  MessageTemplate: true satisfies Registered<'MessageTemplate', MessageTemplate>,
  MessageLog: true satisfies Registered<'MessageLog', MessageLog>,
  Claim: true satisfies Registered<'Claim', Claim>,
} as const

export function dataClassOf<E extends DataEntityName>(entity: E, field: DataFieldOf<E>): DataClass {
  return DATA_FIELD_CLASSES[entity][field] as DataClass
}

export function dataFieldsOf<E extends DataEntityName>(entity: E): DataFieldOf<E>[] {
  return Object.keys(DATA_FIELD_CLASSES[entity]) as DataFieldOf<E>[]
}
