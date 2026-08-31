/**
 * The Assistant projection — plan §14.1, layer 2 of three.
 *
 * The non-negotiable engineering point of §14.1: telling a model not to reveal an
 * Aadhaar number is not a control. Prompts are not permissions. The only durable
 * enforcement is that the sensitive value never enters the context in the first
 * place, so the Assistant queries a projection that does not contain the field
 * and there is nothing for any phrasing, role or jailbreak to extract.
 *
 * Three properties make that true here, and each is deliberate:
 *
 *   1. `ASSISTANT_ALLOW` is an allow-list, never a deny-list. A deny-list means
 *      one forgotten field is a leak; an allow-list means a forgotten field is
 *      merely missing. Every field an entity gains after today is absent from the
 *      Assistant until somebody adds it here on purpose.
 *
 *   2. There are no hand-written per-entity builders. A builder that lists its
 *      own fields can drift from the allow-list it is supposed to honour, and the
 *      drift is invisible — the boundary test would keep passing while the output
 *      leaked. `project()` copies exactly the allow-listed keys and nothing else,
 *      so the list the test asserts against is the list the output is built from.
 *
 *   3. This file is the one place in the codebase that reads both classification
 *      registries. `FIELD_CLASSES` covers the seven M0 domain entities;
 *      `DATA_FIELD_CLASSES` covers the ~36 data-layer entities and cannot be
 *      folded into the domain one without inverting the domain/data dependency.
 *      The union has to be taken somewhere, and the boundary is the right place —
 *      an allow-list checked against half a registry is a deny-list in disguise,
 *      and would miss `Mandate.reference`, `ConsentRecord.token` and
 *      `Claim.companyRemark` (an insurer's remark on a health claim routinely
 *      carries a diagnosis).
 *
 * `auditAllowList` runs at module load and throws. That is layer 2.5: even if the
 * boundary test were deleted, a sensitive field added to the allow-list would
 * take the application down at import rather than reach a model. Fail closed.
 */

import { ASSISTANT_FORBIDDEN_CLASSES, FIELD_CLASSES } from '../../domain/dataclass'
import type { DataClass, EntityName, FieldOf } from '../../domain/dataclass'
import { DATA_FIELD_CLASSES } from '../repo/classification'
import type { DataEntityName, DataFieldOf } from '../repo/classification'

import type { Agency } from '../repo/agencies'
import type { Agent } from '../repo/agents'
import type { BenefitItem, PolicyBenefitMap } from '../repo/benefits'
import type { Claim } from '../repo/claims'
import type { Company } from '../repo/companies'
import type { Activity } from '../repo/activities'
import type {
  Disposition,
  InquiryCategory,
  InquiryStage,
  MessageLog,
  StaffUser,
  Team,
} from '../repo/config'
import type { ConsentRecord, Customer, Household, Member } from '../repo/customers'
import type { Deal } from '../repo/deals'
import type { DocumentRecord } from '../repo/documents'
import type { Inquiry } from '../repo/inquiries'
import type {
  CollectionRecord,
  InstalmentDue,
  Mandate,
  MandateEvent,
  Policy,
  PolicyEntryDraft,
  PolicyVersion,
  PremiumSchedule,
} from '../repo/policies'
import type { Product } from '../repo/products'
import type { Quotation, QuotationLine } from '../repo/quotations'
import type { RenewalTask, Task } from '../repo/tasks'

/* ------------------------------------------------------- the merged registry */

/** Every classified entity, from either registry. The two key sets are disjoint. */
export type AnyEntityName = EntityName | DataEntityName

type FieldsByEntity = { [E in EntityName]: FieldOf<E> } & {
  [E in DataEntityName]: DataFieldOf<E>
}

/** The field names a given entity is allowed to name, whichever registry holds it. */
export type FieldNameOf<E extends AnyEntityName> = FieldsByEntity[E]

/**
 * The two registries as one lookup, for the runtime checks below. The type-level
 * union above stays exact; this one is deliberately loose because it is asked
 * questions about arbitrary strings — including strings a red-team test invents.
 */
export const ENTITY_FIELD_CLASSES: Readonly<Record<string, Readonly<Record<string, DataClass>>>> =
  { ...FIELD_CLASSES, ...DATA_FIELD_CLASSES }

export const ALL_ENTITY_NAMES = Object.keys(ENTITY_FIELD_CLASSES)

export function isClassifiedEntity(entity: string): boolean {
  return Object.hasOwn(ENTITY_FIELD_CLASSES, entity)
}

/** The class of one field, or `null` when neither registry has heard of it. */
export function classOfField(entity: string, field: string): DataClass | null {
  const fields = ENTITY_FIELD_CLASSES[entity]
  if (!fields || !Object.hasOwn(fields, field)) return null
  return fields[field]
}

export function isForbiddenClass(dataClass: DataClass): boolean {
  return (ASSISTANT_FORBIDDEN_CLASSES as readonly DataClass[]).includes(dataClass)
}

/** Every field of an entity the Assistant must never receive, from either registry. */
export function forbiddenFieldsOf(entity: string): string[] {
  const fields = ENTITY_FIELD_CLASSES[entity]
  if (!fields) return []
  return Object.keys(fields).filter((field) => isForbiddenClass(fields[field]))
}

/* --------------------------------------------------------- the allow-list */

/**
 * What the Assistant may read, per entity.
 *
 * Rules for adding to this list, in order of importance:
 *   - Nothing classified `sensitive` or `document-content` ever goes in. The
 *     load-time audit and the boundary test both refuse it.
 *   - A masked identifier is still an identifier. `aadhaarLast4` is absent for the
 *     same reason `aadhaarNumber` is, which is stricter than FR-01.4 on purpose.
 *   - Free-text a person typed is where an Aadhaar or a diagnosis gets pasted in
 *     real life. `Inquiry.notes` is `contact` and still excluded for that reason.
 *   - Absence is cheap. A field left out is a question the Assistant answers with
 *     "I do not have that", which is a fixable annoyance. A field wrongly let in
 *     is a disclosure, which is not.
 */
export const ASSISTANT_ALLOW = {
  /* ---------------------------------------------------------- who they are */

  Customer: [
    'id',
    'systemNo',
    'householdId',
    'status',
    'source',
    'createdAt',
    'ownerId',
    'agentId',
    'subAgentId',
    // Status flags, never values: "Aadhaar submitted, KYC complete" is the whole
    // of what §14.1's worked example lets the Assistant know about identity.
    'kycState',
    'consentState',
    'fullName',
    'mobile',
    'email',
    'city',
    'state',
    'dateOfBirth',
  ],

  Member: [
    'id',
    'customerId',
    'householdId',
    'coveredUnderPolicyIds',
    'fullName',
    'relationship',
    'dateOfBirth',
    'gender',
  ],

  Household: ['id', 'name', 'headCustomerId', 'customerIds', 'city'],

  /** State and expiry of the consent link. The token authorises a form; it is a secret. */
  ConsentRecord: [
    'id',
    'customerId',
    'state',
    'channel',
    'issuedAt',
    'expiresAt',
    'submittedAt',
  ],

  /* ------------------------------------------------------------- the demand */

  Inquiry: [
    'id',
    'systemNo',
    'status',
    'source',
    'categoryId',
    'productInterest',
    'ownerId',
    'teamId',
    'agentId',
    'subAgentId',
    'assignedAt',
    'tatDueAt',
    'assignmentHistory',
    'escalationLevel',
    'createdAt',
    'customerId',
    /*
     * Engagement, FR-06.12 to .17 — and the reason the Assistant can now answer
     * "which leads haven't been touched in ten days" honestly. It learns that
     * contact happened, when, how many attempts it took and what is booked next.
     * `Activity.notes` — the words themselves — is `document-content` and is not
     * on this list, so what was said never enters the context at all.
     */
    'stageKey',
    'stageEnteredAt',
    'contactAttempts',
    'lastActivityAt',
    'nextActionAt',
    'contactName',
    'contactMobile',
    'contactEmail',
  ],

  Quotation: [
    'id',
    'systemNo',
    'version',
    'status',
    'customerId',
    'inquiryId',
    'ownerId',
    'agentId',
    'companyIds',
    'productIds',
    'benefitRows',
    'premiumMode',
    'finalPayablePremium',
    'sharedAt',
    'revisionReason',
    'lostReason',
    'createdAt',
  ],

  QuotationLine: [
    'id',
    'quotationId',
    'version',
    'columnKey',
    'label',
    'companyId',
    'productId',
    'finalPayablePremium',
    'finalPremiumSource',
    'benefitValues',
    'locked',
  ],

  Deal: [
    'id',
    'systemNo',
    'status',
    'quotationId',
    'customerId',
    'ownerId',
    'agentId',
    'subAgentId',
    'agencyId',
    'lineItems',
    'createdAt',
    'consumedByPolicyId',
  ],

  /* ----------------------------------------------------------- the contract */

  Policy: [
    'id',
    'systemNo',
    'insurerNo',
    'customerId',
    'companyId',
    'productId',
    'agencyId',
    'agentId',
    'subAgentId',
    'status',
    'startDate',
    'expiryDate',
    'sumInsured',
    // Money is read, never produced (FR-22.5). These are the typed figures; the
    // Assistant may repeat them and may not compute one.
    'netPremium',
    'gstAmount',
    'finalPremium',
    'premiumMode',
    'paymentState',
    'memberIds',
    'retentionClass',
  ],

  PolicyVersion: [
    'id',
    'policyId',
    'version',
    'effectiveFrom',
    'endorsementNo',
    'insurerEndorsementNo',
    'note',
    'createdAt',
  ],

  /** Canvas 3.7's completion queue: what is still missing, and who left it. */
  PolicyEntryDraft: [
    'id',
    'policyId',
    'dealId',
    'entryPath',
    'missingFields',
    'savedBy',
    'savedAt',
  ],

  PremiumSchedule: [
    'id',
    'policyId',
    'state',
    'mode',
    'instalmentAmount',
    'instalmentAmountSource',
    'instalmentCount',
    'debitDay',
    'graceDays',
    'startDate',
    'createdAt',
    'supersededByScheduleId',
  ],

  InstalmentDue: [
    'id',
    'scheduleId',
    'policyId',
    'sequence',
    'dueDate',
    'amount',
    'state',
    'collectionRecordId',
    'paidAt',
  ],

  /** That a mandate exists, and what state it is in. Never the bank behind it. */
  Mandate: [
    'id',
    'policyId',
    'customerId',
    'kind',
    'debitDay',
    'validFrom',
    'validUntil',
    'state',
    'registeredBy',
    'registeredAt',
  ],

  MandateEvent: ['id', 'mandateId', 'occurredAt', 'outcome', 'failureReason'],

  CollectionRecord: [
    'id',
    'policyId',
    'customerId',
    'agencyId',
    'state',
    'route',
    'instrument',
    'mode',
    'amount',
    'collectedBy',
    'collectedAt',
    'verifiedBy',
    'verifiedAt',
    'bounceReason',
    'instalmentId',
  ],

  /* ------------------------------------------------- presence, not content */

  /**
   * FR-22.14 in one list: that a document exists, what type it is, when it was
   * submitted and verified, and where its review got to. No file, no filename,
   * no url, no mime type, no OCR-extracted text — those are `document-content`
   * and the Assistant never receives them in any form.
   */
  Document: [
    'id',
    'systemNo',
    'subjectEntity',
    'subjectId',
    'docType',
    'version',
    'submittedAt',
    'verifiedAt',
    'verifiedBy',
    'reviewState',
    'isPresent',
  ],

  /* ---------------------------------------------------------- the work list */

  Task: [
    'id',
    'systemNo',
    'kind',
    'title',
    'subjectEntity',
    'subjectId',
    'ownerId',
    'teamId',
    'agentId',
    'state',
    'priority',
    'dueAt',
    'createdAt',
    'completedAt',
    'raisedBy',
  ],

  /**
   * What happened, minus what was said.
   *
   * `notes` is absent, and its absence is the whole design. A call note on a
   * health inquiry routinely carries a diagnosis, so the field is classified
   * `document-content` and `auditAllowList` below would throw at import if
   * anybody added it here. Everything that is listed is operational: the shape
   * of the contact, never its content.
   */
  Activity: [
    'id',
    'systemNo',
    'subjectEntity',
    'subjectId',
    'channel',
    'direction',
    'occurredAt',
    'actorId',
    'dispositionKey',
    'nextTaskId',
    'attemptNo',
    'createdAt',
  ],

  Disposition: ['id', 'key', 'label', 'stageKey', 'requiresNextAction', 'sortOrder', 'active'],

  InquiryStage: ['id', 'key', 'label', 'countsAsOpen', 'terminal', 'sortOrder', 'active'],

  RenewalTask: [
    'id',
    'policyId',
    'customerId',
    'state',
    'dueOn',
    'expiryDate',
    'assigneeId',
    'remindersSent',
    'lastReminderAt',
    'lapseReason',
    'createdAt',
  ],

  /**
   * The reduced claim view §14.1 leaves in scope: type, dates, insurer position,
   * what is outstanding, the settlement as recorded. `companyRemark` is absent —
   * an insurer's remark on a health claim routinely carries a diagnosis, and that
   * is the half of D-F this scope rule retires.
   */
  Claim: [
    'id',
    'systemNo',
    'insurerNo',
    'policyId',
    'customerId',
    'memberId',
    'claimType',
    'state',
    'ownerId',
    'agentId',
    'raisedAt',
    'intimatedAt',
    'settlement',
    'documentIds',
    'checklistItems',
    'documentsCollected',
  ],

  MessageLog: [
    'id',
    'templateKey',
    'channel',
    'subjectEntity',
    'subjectId',
    'sentAt',
    'state',
    'toName',
  ],

  /* --------------------------------------------- the catalogue and the desk */

  Company: ['id', 'key', 'name', 'shortName', 'lines', 'claimsEmail', 'active'],
  Product: ['id', 'companyId', 'code', 'name', 'line', 'categoryId', 'active'],
  BenefitItem: ['id', 'key', 'label', 'line', 'valueKind', 'sortOrder', 'active'],
  PolicyBenefitMap: ['id', 'productId', 'benefitItemId', 'defaultValue', 'sortOrder'],
  Agency: ['id', 'code', 'name', 'type', 'companyIds', 'city', 'active'],
  Agent: [
    'id',
    'code',
    'agencyId',
    'userId',
    'parentAgentId',
    'categoryIds',
    'active',
    'name',
    'city',
  ],
  StaffUser: [
    'id',
    'name',
    'templateKey',
    'teamId',
    'agentId',
    'parentAgentId',
    'categoryIds',
    'roleLabel',
    'active',
  ],
  Team: ['id', 'name', 'leadUserId', 'memberUserIds'],
  InquiryCategory: ['id', 'key', 'label', 'line', 'teamId', 'tatMinutes', 'memberUserIds'],
} as const satisfies Partial<{ [E in AnyEntityName]: readonly FieldNameOf<E>[] }>

export type AssistantEntityName = keyof typeof ASSISTANT_ALLOW

export const ASSISTANT_ENTITY_NAMES = Object.keys(ASSISTANT_ALLOW) as AssistantEntityName[]

/** The field names allowed for one entity, as a literal union. */
export type AllowedField<E extends AssistantEntityName> = (typeof ASSISTANT_ALLOW)[E][number]

/* ------------------------------------------------------------ the projector */

/**
 * What the Assistant receives for an entity: the allow-listed fields of `T` and
 * nothing else. Derived from the allow-list, so the type cannot drift from the
 * runtime shape `project()` builds.
 */
export type AssistantView<T, E extends AssistantEntityName> = {
  readonly [K in Extract<keyof T, AllowedField<E>>]: T[K]
}

/**
 * The only way an entity becomes Assistant-visible. Copies the allow-listed keys
 * and stops; anything else on `row` is dropped, including fields added to the
 * entity after this list was last touched.
 */
export function project<E extends AssistantEntityName, T extends object>(
  entity: E,
  row: T,
): AssistantView<T, E> {
  const source = row as Record<string, unknown>
  const view: Record<string, unknown> = {}

  for (const field of ASSISTANT_ALLOW[entity] as readonly string[]) {
    if (field in source) view[field] = source[field]
  }

  return view as AssistantView<T, E>
}

export function projectAll<E extends AssistantEntityName, T extends object>(
  entity: E,
  rows: readonly T[],
): readonly AssistantView<T, E>[] {
  return rows.map((row) => project(entity, row))
}

/* ------------------------------------------------------------ named views */

/**
 * One alias per projected entity — the names the Assistant feature imports.
 *
 * These are the ONLY Assistant-facing shapes. `src/features/assistant` imports
 * from here and never from `src/domain` or `src/data/repo`, so there is no path
 * from Assistant code to an entity type: the eslint zone forbids the import and
 * these aliases mean nothing needs it.
 */
export type AssistantCustomer = AssistantView<Customer, 'Customer'>
export type AssistantMember = AssistantView<Member, 'Member'>
export type AssistantHousehold = AssistantView<Household, 'Household'>
export type AssistantConsent = AssistantView<ConsentRecord, 'ConsentRecord'>

export type AssistantInquiry = AssistantView<Inquiry, 'Inquiry'>
export type AssistantQuotation = AssistantView<Quotation, 'Quotation'>
export type AssistantQuotationLine = AssistantView<QuotationLine, 'QuotationLine'>
export type AssistantDeal = AssistantView<Deal, 'Deal'>

export type AssistantPolicy = AssistantView<Policy, 'Policy'>
export type AssistantPolicyVersion = AssistantView<PolicyVersion, 'PolicyVersion'>
export type AssistantPolicyDraft = AssistantView<PolicyEntryDraft, 'PolicyEntryDraft'>
export type AssistantSchedule = AssistantView<PremiumSchedule, 'PremiumSchedule'>
export type AssistantInstalment = AssistantView<InstalmentDue, 'InstalmentDue'>
export type AssistantMandate = AssistantView<Mandate, 'Mandate'>
export type AssistantMandateEvent = AssistantView<MandateEvent, 'MandateEvent'>
export type AssistantCollection = AssistantView<CollectionRecord, 'CollectionRecord'>

/** Metadata only. There is no Assistant-facing type carrying document content. */
export type AssistantDocument = AssistantView<DocumentRecord, 'Document'>

export type AssistantTask = AssistantView<Task, 'Task'>
/** What happened, minus what was said — FR-06.13. */
export type AssistantActivity = AssistantView<Activity, 'Activity'>
export type AssistantDisposition = AssistantView<Disposition, 'Disposition'>
export type AssistantInquiryStage = AssistantView<InquiryStage, 'InquiryStage'>
export type AssistantRenewal = AssistantView<RenewalTask, 'RenewalTask'>
export type AssistantClaim = AssistantView<Claim, 'Claim'>
export type AssistantMessage = AssistantView<MessageLog, 'MessageLog'>

export type AssistantCompany = AssistantView<Company, 'Company'>
export type AssistantProduct = AssistantView<Product, 'Product'>
export type AssistantBenefitItem = AssistantView<BenefitItem, 'BenefitItem'>
export type AssistantBenefitMap = AssistantView<PolicyBenefitMap, 'PolicyBenefitMap'>
export type AssistantAgency = AssistantView<Agency, 'Agency'>
export type AssistantAgent = AssistantView<Agent, 'Agent'>
export type AssistantStaffUser = AssistantView<StaffUser, 'StaffUser'>
export type AssistantTeam = AssistantView<Team, 'Team'>
export type AssistantCategory = AssistantView<InquiryCategory, 'InquiryCategory'>

/* ---------------------------------------------------------------- the audit */

export const ALLOW_LIST_FINDINGS = {
  forbiddenClass: 'forbidden-class',
  unknownEntity: 'unknown-entity',
  unknownField: 'unknown-field',
} as const

export type AllowListFindingKind =
  (typeof ALLOW_LIST_FINDINGS)[keyof typeof ALLOW_LIST_FINDINGS]

export type AllowListFinding = {
  readonly entity: string
  readonly field: string | null
  readonly kind: AllowListFindingKind
  readonly dataClass: DataClass | null
  readonly reason: string
}

/** The shape the audit accepts, loose on purpose so a test can poison a copy. */
export type AllowListShape = Readonly<Record<string, readonly string[]>>

/**
 * Everything wrong with an allow-list, as a list rather than a boolean, so a
 * failure names the field instead of just saying no.
 *
 * Three ways to be wrong: naming a field the Assistant must never receive,
 * naming an entity neither registry classifies (a projection for an unclassified
 * entity is unchecked by construction), and naming a field the entity's registry
 * does not carry.
 */
export function auditAllowList(allow: AllowListShape): AllowListFinding[] {
  const findings: AllowListFinding[] = []

  for (const entity of Object.keys(allow)) {
    if (!isClassifiedEntity(entity)) {
      findings.push({
        entity,
        field: null,
        kind: ALLOW_LIST_FINDINGS.unknownEntity,
        dataClass: null,
        reason: `${entity} appears in the Assistant allow-list but neither classification registry classifies it. An unclassified entity cannot be checked, so its projection is unchecked.`,
      })
      continue
    }

    for (const field of allow[entity]) {
      const dataClass = classOfField(entity, field)

      if (dataClass === null) {
        findings.push({
          entity,
          field,
          kind: ALLOW_LIST_FINDINGS.unknownField,
          dataClass: null,
          reason: `${entity}.${field} is allow-listed but is not a classified field of ${entity}.`,
        })
        continue
      }

      if (isForbiddenClass(dataClass)) {
        findings.push({
          entity,
          field,
          kind: ALLOW_LIST_FINDINGS.forbiddenClass,
          dataClass,
          reason: `${entity}.${field} is classed ${dataClass} and must never reach the Assistant.`,
        })
      }
    }
  }

  return findings
}

/**
 * Layer 2.5, run at import. If the boundary test is ever deleted, weakened or
 * skipped, a sensitive field in the allow-list still cannot ship: the module that
 * builds every Assistant projection refuses to load.
 *
 * It takes the list as a parameter so the thing that runs in production is the
 * same thing the red-team case runs against a poisoned copy. A guard nobody can
 * watch fail is a guard nobody should trust.
 */
export function assertAllowListIsClean(allow: AllowListShape = ASSISTANT_ALLOW): void {
  const findings = auditAllowList(allow)
  if (findings.length === 0) return

  throw new Error(
    'The Assistant allow-list is not safe to load:\n' +
      findings.map((finding) => `  - ${finding.reason}`).join('\n'),
  )
}

assertAllowListIsClean()
