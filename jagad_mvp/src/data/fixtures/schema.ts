/**
 * Fixture schemas — the integrity half of P-04's done-when.
 *
 * TypeScript already says the fixture types are right. What it cannot say is
 * whether the values are: whether a date is a date, whether a percentage is
 * inside its range, whether an amount is really integer paise rather than a
 * plain object that happens to have the shape. Those go wrong exactly when a
 * fixture is hand-edited, which is often, so they are checked at runtime.
 *
 * Zod is v4 here. `z.enum` takes the domain's own `as const` maps directly, which
 * keeps the schema and the machine reading from one source instead of two.
 */

import { z } from 'zod'
import { DISCARD_REASONS } from '../../domain/amend'
import { RUN_DECISIONS } from '../../domain/automation'
import { isMoney } from '../../domain/money'
import type { Money } from '../../domain/money'
import {
  AMOUNT_SOURCES,
  CLAIM_STATES,
  CLAIM_TYPES,
  COLLECTION_INSTRUMENTS,
  COLLECTION_MODES,
  COLLECTION_ROUTES,
  COLLECTION_STATES,
  CONSENT_STATES,
  DEAL_STATES,
  ENDORSEMENT_STATES,
  ENDORSEMENT_TYPES,
  INQUIRY_STATES,
  INSTALMENT_AMOUNT_SOURCES,
  INSTALMENT_STATES,
  KYC_CONSENT_STATES,
  MANDATE_STATES,
  NOTICE_BATCH_STATES,
  NOTICE_ROW_STATES,
  POLICY_ENTRY_PATHS,
  POLICY_STATES,
  PREMIUM_MODES,
  SALES_CREDIT_SOURCES,
  PREMIUM_SOURCES,
  QUOTATION_STATES,
  RENEWAL_STATES,
  SCHEDULE_STATES,
  SETTLEMENT_SOURCES,
} from '../../domain/workflows'
import { AGENCY_TYPES } from '../repo/agencies'
import { BENEFIT_VALUE_KINDS } from '../repo/benefits'
import { INSURANCE_LINES } from '../repo/companies'
import { LEDGER_ENTRY_KINDS } from '../repo/commission'
import { MESSAGE_CHANNELS, MESSAGE_STATES, FORM_FIELD_KINDS } from '../repo/config'
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, MEMBER_RELATIONSHIPS } from '../repo/customers'
import { DOCUMENT_REVIEW_STATES, DOCUMENT_TYPES } from '../repo/documents'
import { REFERRER_KINDS } from '../repo/inquiries'
import {
  INTEGRATION_CHECK_OUTCOMES,
  INTEGRATION_KINDS,
  secretLikeSettingKeys,
} from '../repo/integrations'
import {
  DELIVERY_STATES,
  DISPATCH_CHANNELS,
  MANDATE_KINDS,
  NCB_SOURCES,
  PAYMENT_STATES,
  POLICY_ORIGINS,
} from '../repo/policies'
import { CHECKLIST_PURPOSES } from '../repo/products'
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATES } from '../repo/tasks'

const id = z.string().min(1)
const label = z.string().min(1)
const day = z.iso.date()
const stamp = z.iso.datetime()
const basisPoints = z.int().min(0).max(10_000)

/** Not a shape check: the real question is whether it came out of `money()`. */
const money = z.custom<Money>((value) => isMoney(value), {
  error: 'Amounts must be integer-paise Money built through src/domain/money.',
})

/** A mobile as this platform stores it: ten digits, no punctuation, no country code. */
const mobile = z.string().regex(/^\d{10}$/)
const email = z.string().includes('@')
const last4 = z.string().regex(/^\d{4}$/)

/* ---------------------------------------------------------- configuration */

export const staffUserSchema = z.object({
  id,
  name: label,
  email,
  mobile,
  templateKey: z.string().min(1),
  teamId: id.nullable(),
  agentId: id.nullable(),
  parentAgentId: id.nullable(),
  categoryIds: z.array(id),
  roleLabel: label,
  active: z.boolean(),
})

export const teamSchema = z.object({
  id,
  name: label,
  leadUserId: id,
  memberUserIds: z.array(id).min(1),
})

export const inquiryCategorySchema = z.object({
  id,
  key: z.string().min(1),
  label,
  line: z.enum(INSURANCE_LINES),
  teamId: id,
  // §9 holds no default TAT, so a category that forgot one is a broken fixture.
  tatMinutes: z.int().positive(),
  memberUserIds: z.array(id),
})

export const masterTypeSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  editable: z.boolean(),
})

export const masterValueSchema = z.object({
  id,
  masterTypeId: id,
  key: z.string().min(1),
  label,
  sortOrder: z.int().positive(),
  active: z.boolean(),
})

/**
 * The engagement vocabulary, FR-06.12 and .14. `allowedFromKeys` is the
 * adjacency a transition table would have held, so it is validated like one:
 * a list of keys, possibly empty, never absent.
 */
/**
 * A logged contact. `attemptNo` may be zero — a connected call is not an
 * attempt at reaching somebody, it is having reached them — so the bound is
 * non-negative rather than positive.
 */
export const activitySchema = z.object({
  id,
  systemNo: z.string().min(1),
  subjectEntity: z.string().min(1),
  subjectId: id,
  channel: z.enum(['call', 'whatsapp', 'email', 'meeting', 'visit']),
  direction: z.enum(['outbound', 'inbound']),
  occurredAt: stamp,
  actorId: id,
  dispositionKey: z.string().min(1),
  notes: z.string().nullable(),
  nextTaskId: id.nullable(),
  attemptNo: z.int().nonnegative(),
  messageLogId: id.nullable(),
  createdAt: stamp,
})

export const requirementSchema = z.object({
  id,
  inquiryId: id,
  formSchemaId: id,
  objectKey: z.string().min(1),
  schemaVersion: z.int().positive(),
  values: z.record(z.string(), z.unknown()),
  capturedBy: id,
  capturedAt: stamp,
  revisedAt: stamp.nullable(),
})

export const inquiryStageSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  allowedFromKeys: z.array(z.string().min(1)),
  requiresNextAction: z.boolean(),
  countsAsOpen: z.boolean(),
  terminal: z.boolean(),
  parksTheLead: z.boolean(),
  sortOrder: z.int().positive(),
  active: z.boolean(),
})

export const dispositionSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  channelKeys: z.array(z.string().min(1)),
  stageKey: z.string().min(1).nullable(),
  requiresNextAction: z.boolean(),
  requiresReason: z.boolean(),
  incrementsAttempt: z.boolean(),
  suggestedTemplateKey: z.string().min(1).nullable(),
  defaultRetryMinutes: z.int().positive().nullable(),
  sortOrder: z.int().positive(),
  active: z.boolean(),
})

export const retentionClassSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  years: z.int().positive(),
})

const formFieldSchema = z.object({
  key: z.string().min(1),
  label,
  kind: z.enum(FORM_FIELD_KINDS),
  required: z.boolean(),
  visibleWhen: z.object({ field: z.string().min(1), equals: z.string() }).nullable(),
  masterTypeId: id.nullable(),
})

export const formSchemaSchema = z.object({
  id,
  objectKey: z.string().min(1),
  productId: id.nullable(),
  version: z.int().positive(),
  stages: z
    .array(z.object({ key: z.string().min(1), label, fields: z.array(formFieldSchema).min(1) }))
    .min(1),
  publishedAt: stamp,
  active: z.boolean(),
})

export const recipeSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  version: z.int().positive(),
  trigger: z.string().min(1),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  active: z.boolean(),
  updatedAt: stamp,
})

export const messageTemplateSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  channel: z.enum(MESSAGE_CHANNELS),
  subject: z.string().nullable(),
  body: z.string().min(1),
  recipeKey: z.string().min(1).nullable(),
  version: z.int().positive(),
  active: z.boolean(),
  updatedAt: stamp,
  updatedBy: id,
})

const ocrTemplateFieldSchema = z.object({
  key: z.string().min(1),
  label,
  anchor: z.string().min(1),
  required: z.boolean(),
})

export const ocrTemplateSchema = z.object({
  id,
  companyId: id,
  key: z.string().min(1),
  label,
  docType: z.enum(DOCUMENT_TYPES),
  version: z.int().positive(),
  fields: z.array(ocrTemplateFieldSchema).min(1),
  active: z.boolean(),
  updatedAt: stamp,
})

/**
 * The integration posture, enforced on the data rather than only in the UI: a
 * setting whose key reads like a credential cannot exist in a fixture, and
 * `save` refuses the same keys with the same rule.
 */
export const integrationSchema = z.object({
  id,
  key: z.string().min(1),
  kind: z.enum(INTEGRATION_KINDS),
  label,
  providerName: label,
  enabled: z.boolean(),
  settings: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .refine((value) => secretLikeSettingKeys(value).length === 0, {
      error:
        'An integration records that it exists; it never stores a key, token, secret or password. Keep the credential in the provider console.',
    }),
  lastCheckedAt: stamp.nullable(),
  lastCheckOutcome: z.enum(INTEGRATION_CHECK_OUTCOMES).nullable(),
  lastCheckNote: z.string().min(1).nullable(),
  updatedAt: stamp,
  updatedBy: id,
})

export const messageLogSchema = z.object({
  id,
  templateKey: z.string().min(1),
  channel: z.enum(MESSAGE_CHANNELS),
  toName: label,
  toAddress: z.string().min(1),
  subjectEntity: z.string().min(1),
  subjectId: id,
  sentAt: stamp,
  state: z.enum(MESSAGE_STATES),
})

/* ------------------------------------------------------- market and channel */

export const companySchema = z.object({
  id,
  key: z.string().min(1),
  name: label,
  shortName: label,
  lines: z.array(z.enum(INSURANCE_LINES)).min(1),
  claimsEmail: email,
  active: z.boolean(),
})

export const companyContactSchema = z.object({
  id,
  companyId: id,
  name: label,
  role: label,
  mobile,
  email,
})

export const productSchema = z.object({
  id,
  companyId: id,
  code: z.string().min(1),
  name: label,
  line: z.enum(INSURANCE_LINES),
  categoryId: id,
  formSchemaId: id.nullable(),
  active: z.boolean(),
})

export const docChecklistSchema = z.object({
  id,
  companyId: id,
  productId: id.nullable(),
  purpose: z.enum(CHECKLIST_PURPOSES),
  items: z.array(label).min(1),
})

export const benefitItemSchema = z.object({
  id,
  key: z.string().min(1),
  label,
  line: z.enum(INSURANCE_LINES),
  valueKind: z.enum(BENEFIT_VALUE_KINDS),
  sortOrder: z.int().positive(),
  active: z.boolean(),
})

export const policyBenefitMapSchema = z.object({
  id,
  productId: id,
  benefitItemId: id,
  defaultValue: z.string().min(1),
  sortOrder: z.int().positive(),
})

export const agencySchema = z.object({
  id,
  code: z.string().min(1),
  name: label,
  type: z.enum(AGENCY_TYPES),
  companyIds: z.array(id).min(1),
  city: label,
  active: z.boolean(),
})

export const agencyScopeSchema = z.object({
  id,
  agencyId: id,
  companyId: id,
  productId: id,
  commissionPercentBp: basisPoints,
  effectiveFrom: stamp,
  active: z.boolean(),
})

export const agentSchema = z.object({
  id,
  code: z.string().min(1),
  name: label,
  mobile,
  email,
  agencyId: id,
  userId: id.nullable(),
  parentAgentId: id.nullable(),
  city: label,
  categoryIds: z.array(id),
  sharePercentBp: basisPoints,
  canGrantSubAgents: z.boolean(),
  subAgentCapPercentBp: basisPoints,
  directUpdatesEnabled: z.boolean(),
  active: z.boolean(),
})

export const commissionSplitSchema = z.object({
  id,
  agencyId: id,
  companyId: id,
  productId: id,
  agentId: id,
  subAgentId: id.nullable(),
  agentSharePercentBp: basisPoints,
  subAgentSharePercentBp: basisPoints,
  effectiveFrom: stamp,
})

export const commissionRuleSchema = z.object({
  id,
  agencyId: id,
  companyId: id,
  productId: id,
  basisPercentBp: basisPoints,
  effectiveFrom: stamp,
  effectiveTo: stamp.nullable(),
  active: z.boolean(),
})

export const ledgerEntrySchema = z.object({
  id,
  policyId: id,
  agencyId: id,
  agentId: id.nullable(),
  subAgentId: id.nullable(),
  kind: z.enum(LEDGER_ENTRY_KINDS),
  amount: money,
  bookedAt: stamp,
  bookedBy: id,
  note: z.string().min(1),
})

/* ----------------------------------------------------------------- customers */

export const householdSchema = z.object({
  id,
  name: label,
  headCustomerId: id,
  customerIds: z.array(id).min(1),
  city: label,
})

export const customerSchema = z.object({
  id,
  systemNo: z.string().min(1),
  householdId: id.nullable(),
  status: z.enum(CUSTOMER_STATUSES),
  source: z.enum(CUSTOMER_SOURCES),
  createdAt: stamp,
  ownerId: id,
  agentId: id.nullable(),
  subAgentId: id.nullable(),
  kycState: z.enum(KYC_CONSENT_STATES),
  consentState: z.enum(CONSENT_STATES),
  // Never chased is `null`, not a zero-length string and not day zero.
  lastConsentChaseAt: stamp.nullable(),
  consentChaseCount: z.number().int().min(0),
  fullName: label,
  mobile,
  altMobile: mobile.nullable(),
  email: email.nullable(),
  addressLine: z.string().nullable(),
  city: label,
  state: label,
  pincode: z.string().regex(/^\d{6}$/).nullable(),
  dateOfBirth: day.nullable(),
  // The registry classifies this `sensitive` so the projection has something to
  // forbid. No fixture may fill it, and null is the only value that parses.
  aadhaarNumber: z.null(),
  aadhaarLast4: last4.nullable(),
  panNumber: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankIfsc: z.string().nullable(),
})

export const memberSchema = z.object({
  id,
  customerId: id,
  householdId: id.nullable(),
  coveredUnderPolicyIds: z.array(id),
  fullName: label,
  relationship: z.enum(MEMBER_RELATIONSHIPS),
  dateOfBirth: day.nullable(),
  gender: z.string().nullable(),
  mobile: mobile.nullable(),
  aadhaarNumber: z.null(),
  aadhaarLast4: last4.nullable(),
  healthDeclaration: z.string().nullable(),
  preExistingConditions: z.array(z.string()).nullable(),
  diagnosis: z.string().nullable(),
})

export const consentRecordSchema = z.object({
  id,
  customerId: id,
  state: z.enum(CONSENT_STATES),
  // §9: a short token is not a link, it is an invitation.
  token: z.string().min(16),
  channel: z.enum(MESSAGE_CHANNELS),
  issuedAt: stamp,
  expiresAt: stamp,
  submittedAt: stamp.nullable(),
})

export const customerCredentialSchema = z.object({
  id,
  customerId: id,
  username: z.string().min(1),
  issuedAt: stamp,
  channel: z.enum(MESSAGE_CHANNELS),
  active: z.boolean(),
})

/* -------------------------------------------------------------------- demand */

/**
 * The soft-discard mark — FR-20.2. Absent on every seeded row and optional here
 * for exactly that reason: a fixture set is the agency's live book, and a
 * discarded row in it would assert that somebody had already cleaned up a
 * duplicate the walkthrough never created. The shape is still checked, so a
 * hand-edited fixture that invents one is caught.
 */
const discardMark = z
  .object({
    reason: z.enum(DISCARD_REASONS),
    note: z.string().nullable(),
    discardedBy: id,
    discardedAt: stamp,
  })
  .nullable()
  .optional()


export const inquirySchema = z.object({
  id,
  systemNo: z.string().regex(/^INQ-\d{4}$/),
  status: z.enum(INQUIRY_STATES),
  source: z.enum(CUSTOMER_SOURCES),
  categoryId: id.nullable(),
  productInterest: z.array(id),
  ownerId: id.nullable(),
  teamId: id.nullable(),
  agentId: id.nullable(),
  subAgentId: id.nullable(),
  assignedAt: stamp.nullable(),
  tatDueAt: stamp.nullable(),
  assignmentHistory: z.array(
    z.object({
      assigneeId: id,
      assignedAt: stamp,
      releasedAt: stamp.optional(),
      reason: z.string().optional(),
    }),
  ),
  escalationLevel: z.int().min(0),
  createdAt: stamp,
  customerId: id.nullable(),
  referral: z
    .object({
      kind: z.enum(REFERRER_KINDS),
      referrerId: id.nullable(),
      referrerName: label.nullable(),
      capturedAt: stamp,
    })
    .nullable(),
  contactName: label,
  contactMobile: mobile,
  contactEmail: email.nullable(),
  notes: z.string().nullable(),
  discard: discardMark,
})

export const quotationSchema = z.object({
  id,
  systemNo: z.string().regex(/^QTN-\d{4}$/),
  version: z.int().positive(),
  status: z.enum(QUOTATION_STATES),
  customerId: id,
  inquiryId: id.nullable(),
  ownerId: id,
  agentId: id.nullable(),
  companyIds: z.array(id).min(1),
  productIds: z.array(id).min(1),
  benefitRows: z.array(
    z.object({
      key: z.string().min(1),
      benefitItemId: id.nullable(),
      label,
      adHoc: z.boolean(),
      sortOrder: z.int().positive(),
    }),
  ),
  subAgentId: id.nullable(),
  premiumMode: z.enum(PREMIUM_MODES),
  finalPayablePremium: money.nullable(),
  sharedAt: stamp.nullable(),
  acceptedColumnKeys: z.array(z.string().min(1)),
  awardedAt: stamp.nullable(),
  revisionReason: z.string().nullable(),
  lostReason: z.string().nullable(),
  createdAt: stamp,
  documentId: id.nullable(),
  discard: discardMark,
})

export const quotationLineSchema = z.object({
  id,
  quotationId: id,
  version: z.int().positive(),
  columnKey: z.string().min(1),
  label,
  companyId: id,
  productId: id,
  finalPayablePremium: money.nullable(),
  // §9: typed, never computed. A `computed` provenance in a fixture would be a
  // D3 violation shipped as data.
  finalPremiumSource: z.enum(PREMIUM_SOURCES).refine((value) => value !== 'computed').nullable(),
  netPremium: money.nullable(),
  gstAmount: money.nullable(),
  benefitValues: z.record(z.string(), z.string()),
  locked: z.boolean(),
})

export const dealSchema = z.object({
  id,
  systemNo: z.string().regex(/^APP-\d{4}$/),
  status: z.enum(DEAL_STATES),
  quotationId: id,
  customerId: id,
  ownerId: id,
  agentId: id.nullable(),
  subAgentId: id.nullable(),
  agencyId: id.nullable(),
  lineItems: z.array(
    z.object({
      id,
      companyId: id,
      productId: id,
      label,
      // Provenance: the quotation column this line was carried from.
      quotationLineId: id,
      columnKey: z.string().min(1),
      carriedFromVersion: z.int().positive(),
      // The accepted figure. Required, and never `computed` — a deal that
      // carries a derived premium is a D3 violation shipped as data.
      acceptedFinalPayablePremium: money,
      acceptedPremiumSource: z.enum(PREMIUM_SOURCES).refine((value) => value !== 'computed'),
      netPremium: money.nullable(),
      gstAmount: money.nullable(),
      premiumMode: z.enum(PREMIUM_MODES),
    }),
  ),
  quotationVersion: z.int().positive(),
  acceptedColumnKeys: z.array(z.string().min(1)),
  awardKey: z.string().min(1),
  salesCreditSource: z.enum(SALES_CREDIT_SOURCES).nullable(),
  createdAt: stamp,
  consumedByPolicyId: id.nullable(),
  discard: discardMark,
})

/* ------------------------------------------------------------------ contract */

export const policySchema = z.object({
  id,
  systemNo: z.string().regex(/^POL(-DRAFT)?-\d{4,}$/),
  insurerNo: z.string().nullable(),
  customerId: id,
  companyId: id,
  productId: id,
  agencyId: id,
  agentId: id.nullable(),
  subAgentId: id.nullable(),
  status: z.enum(POLICY_STATES),
  startDate: day.nullable(),
  expiryDate: day.nullable(),
  sumInsured: money.nullable(),
  netPremium: money.nullable(),
  gstAmount: money.nullable(),
  finalPremium: money.nullable(),
  premiumMode: z.enum(PREMIUM_MODES),
  paymentState: z.enum(PAYMENT_STATES),
  memberIds: z.array(id),
  retentionClass: z.string().min(1),
  // The union, validated branch by branch. A row that carries `origin: 'deal'`
  // with no `dealId` is refused here rather than surfacing as a broken spine on
  // a screen, which is the whole reason the type is a union and not four nulls.
  provenance: z.discriminatedUnion('origin', [
    z.object({ origin: z.literal(POLICY_ORIGINS.deal), dealId: id }),
    z.object({ origin: z.literal(POLICY_ORIGINS.renewal), precedingPolicyId: id }),
    z.object({ origin: z.literal(POLICY_ORIGINS.captured), reason: z.string().min(1) }),
    z.object({ origin: z.literal(POLICY_ORIGINS.migrated), batchRef: z.string().min(1) }),
  ]),
  schemaVersion: z.int().positive(),
  proposerBankAccount: z.string().nullable(),
  nomineeAadhaarLast4: last4.nullable(),
  medicalReportSummary: z.string().nullable(),
})

export const policyVersionSchema = z.object({
  id,
  policyId: id,
  version: z.int().positive(),
  effectiveFrom: day,
  documentId: id.nullable(),
  endorsementNo: z.string().nullable(),
  insurerEndorsementNo: z.string().nullable(),
  note: z.string().min(1),
  createdAt: stamp,
})

export const policyPremiumComponentSchema = z.object({
  id,
  policyId: id,
  key: z.string().min(1),
  label: label,
  // Nullable, and that is the point: an unrecorded component is a fact worth
  // keeping. Coercing it to zero would assert a figure nobody gave us.
  amount: money.nullable(),
  schemaVersion: z.int().positive(),
  sortOrder: z.int().min(0),
  recordedBy: id,
  recordedAt: stamp,
})

export const policyNcbSchema = z.object({
  id,
  policyId: id,
  // Basis points, so 50% is 5000 and no float touches a rate. Capped at 100%.
  percentBp: z.int().min(0).max(10_000),
  source: z.enum(NCB_SOURCES),
  carriedFromPolicyId: id.nullable(),
  recordedBy: id,
  recordedAt: stamp,
})

export const policyDispatchSchema = z.object({
  id,
  policyId: id,
  channel: z.enum(DISPATCH_CHANNELS),
  documentId: id.nullable(),
  state: z.enum(DELIVERY_STATES),
  recipientName: label,
  // Masked at rest. A dispatch log is read by everyone who can read the policy,
  // and the full number is a wider surface than a delivery row needs.
  recipientContactMasked: z.string().min(1),
  courierName: z.string().min(1).nullable(),
  trackingRef: z.string().min(1).nullable(),
  dispatchedBy: id,
  dispatchedAt: stamp,
  deliveredAt: stamp.nullable(),
  confirmedAt: stamp.nullable(),
  confirmedBy: id.nullable(),
  returnReason: z.string().min(1).nullable(),
})

export const policyDraftSchema = z.object({
  id,
  policyId: id,
  dealId: id.nullable(),
  entryPath: z.enum(POLICY_ENTRY_PATHS),
  formSchemaId: id,
  schemaVersion: z.int().positive(),
  missingFields: z.array(z.string().min(1)),
  savedBy: id,
  savedAt: stamp,
})

export const premiumScheduleSchema = z.object({
  id,
  policyId: id,
  state: z.enum(SCHEDULE_STATES),
  mode: z.enum(PREMIUM_MODES),
  instalmentAmount: money.nullable(),
  // D-A: the figure comes off the insurer's schedule. A derived one is refused
  // by the machine, so it must never be sitting in a fixture either.
  instalmentAmountSource: z
    .enum(INSTALMENT_AMOUNT_SOURCES)
    .refine((value) => value !== 'derived_from_annual')
    .nullable(),
  instalmentCount: z.int().positive(),
  debitDay: z.int().min(1).max(31),
  graceDays: z.int().min(0),
  startDate: day,
  createdAt: stamp,
  supersededByScheduleId: id.nullable(),
})

export const instalmentSchema = z.object({
  id,
  scheduleId: id,
  policyId: id,
  sequence: z.int().positive(),
  dueDate: day,
  amount: money,
  state: z.enum(INSTALMENT_STATES),
  collectionRecordId: id.nullable(),
  paidAt: stamp.nullable(),
})

export const mandateSchema = z.object({
  id,
  policyId: id,
  customerId: id,
  kind: z.enum(MANDATE_KINDS),
  reference: z.string().min(1),
  bankName: label,
  debitDay: z.int().min(1).max(31),
  validFrom: day,
  validUntil: day,
  state: z.enum(MANDATE_STATES),
  registeredBy: id,
  registeredAt: stamp,
})

export const mandateEventSchema = z.object({
  id,
  mandateId: id,
  occurredAt: stamp,
  outcome: z.enum(['success', 'failure']),
  reference: z.string().min(1),
  failureReason: z.string().nullable(),
})

export const collectionSchema = z.object({
  id,
  policyId: id,
  customerId: id,
  agencyId: id.nullable(),
  state: z.enum(COLLECTION_STATES),
  route: z.enum(COLLECTION_ROUTES),
  instrument: z.enum(COLLECTION_INSTRUMENTS),
  mode: z.enum(COLLECTION_MODES),
  amount: money.nullable(),
  reference: z.string().nullable(),
  collectedBy: id.nullable(),
  collectedAt: stamp.nullable(),
  verifiedBy: id.nullable(),
  verifiedAt: stamp.nullable(),
  bounceReason: z.string().nullable(),
  instalmentId: id.nullable(),
})

/* --------------------------------------------------------- work and records */

export const taskSchema = z.object({
  id,
  systemNo: z.string().regex(/^TSK-\d{4,}$/),
  kind: z.enum(TASK_KINDS),
  title: label,
  subjectEntity: z.string().min(1),
  subjectId: id,
  ownerId: id.nullable(),
  teamId: id.nullable(),
  agentId: id.nullable(),
  state: z.enum(TASK_STATES),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: stamp,
  createdAt: stamp,
  completedAt: stamp.nullable(),
  raisedBy: z.string().min(1),
})

export const renewalTaskSchema = z.object({
  id,
  policyId: id,
  customerId: id,
  state: z.enum(RENEWAL_STATES),
  dueOn: day,
  expiryDate: day,
  assigneeId: id.nullable(),
  remindersSent: z.int().min(0),
  lastReminderAt: stamp.nullable(),
  lapseReason: z.string().nullable(),
  createdAt: stamp,
})

export const documentSchema = z.object({
  id,
  systemNo: z.string().min(1),
  subjectEntity: z.string().min(1),
  subjectId: id,
  docType: z.enum(DOCUMENT_TYPES),
  version: z.int().positive(),
  submittedAt: stamp.nullable(),
  verifiedAt: stamp.nullable(),
  verifiedBy: id.nullable(),
  reviewState: z.enum(DOCUMENT_REVIEW_STATES),
  retentionClass: z.string().min(1),
  isPresent: z.boolean(),
  uploadedByName: label.nullable(),
  fileName: z.string().nullable(),
  fileUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  extractedText: z.string().nullable(),
  ocrFields: z.array(
    z.object({ name: z.string().min(1), value: z.string(), confirmed: z.boolean() }),
  ),
})

export const claimSchema = z.object({
  id,
  systemNo: z.string().regex(/^CLM-\d{4}$/),
  insurerNo: z.string().nullable(),
  policyId: id,
  customerId: id,
  memberId: id.nullable(),
  claimType: z.enum(CLAIM_TYPES),
  state: z.enum(CLAIM_STATES),
  ownerId: id.nullable(),
  agentId: id.nullable(),
  raisedAt: stamp,
  intimatedAt: stamp.nullable(),
  settlement: z.object({
    amount: money.nullable(),
    deduction: money.nullable(),
    // §9: only the insurer's advice is an acceptable provenance for a settlement.
    source: z.enum(SETTLEMENT_SOURCES).refine((value) => value !== 'derived').nullable(),
    insurerAdviceRef: z.string().nullable(),
  }),
  companyRemark: z.string().nullable(),
  documentIds: z.array(id),
  checklistItems: z.array(label),
  documentsCollected: z.array(label),
})


/* --------------------------------------------------- endorsement and notices */

/**
 * A money figure on an endorsement. §9: typed from the insurer's advice, never
 * derived — `endorsementDeltaIsTyped` and `refundIsTypedInsurerFigure` refuse a
 * `derived` provenance at the transition, and this refuses one arriving as data.
 */
const endorsementFigureSchema = z.object({
  amount: money.nullable(),
  source: z
    .enum(AMOUNT_SOURCES)
    .refine((value) => value !== 'derived')
    .nullable(),
  insurerReference: z.string().min(1).nullable(),
})

export const endorsementSchema = z
  .object({
    id,
    systemNo: z.string().regex(/^END-\d{4}$/),
    insurerEndorsementNo: z.string().nullable(),
    policyId: id,
    customerId: id,
    type: z.enum(ENDORSEMENT_TYPES),
    state: z.enum(ENDORSEMENT_STATES),
    ownerId: id.nullable(),
    requestedAt: stamp,
    effectiveFrom: day.nullable(),
    reason: z.string().min(1),
    changedFields: z.array(z.string().min(1)),
    replacesInsuredEntity: z.boolean(),
    delta: endorsementFigureSchema,
    refund: endorsementFigureSchema,
    claimsVerdict: z
      .object({ refundEligible: z.boolean(), claimIds: z.array(id) })
      .nullable(),
    policyVersionId: id.nullable(),
    documentId: id.nullable(),
    approvedBy: id.nullable(),
    approvedAt: stamp.nullable(),
  })
  // §9: "Non-financial types must render no premium fields at all." A disabled
  // premium field is still a premium field, and a stored one is worse.
  .refine(
    (row) =>
      row.type !== 'non_financial' || (row.delta.amount === null && row.refund.amount === null),
    {
      error: 'A non-financial endorsement carries no premium delta and no refund.',
    },
  )
  // A refund belongs to a cancellation and a delta to a financial change. The
  // other way round is a form that was reshaped after the figure was typed.
  .refine((row) => row.type === 'financial' || row.delta.amount === null, {
    error: 'Only a financial endorsement carries a premium delta.',
  })
  .refine((row) => row.type === 'cancellation' || row.refund.amount === null, {
    error: 'Only a cancellation carries a refund.',
  })

export const noticeBatchSchema = z.object({
  id,
  systemNo: z.string().regex(/^NTB-\d{4}$/),
  companyId: id,
  ocrTemplateId: id.nullable(),
  state: z.enum(NOTICE_BATCH_STATES),
  sourceDocumentId: id.nullable(),
  fileName: z.string().min(1),
  expiryMonth: z.string().regex(/^\d{4}-\d{2}$/),
  uploadedBy: id,
  uploadedAt: stamp,
  ocrStartedAt: stamp.nullable(),
  ocrCompletedAt: stamp.nullable(),
  rowCount: z.int().min(0),
  sentBy: id.nullable(),
  sentAt: stamp.nullable(),
})

export const noticeMatchSchema = z
  .object({
    id,
    batchId: id,
    rowNumber: z.int().positive(),
    state: z.enum(NOTICE_ROW_STATES),
    noticePolicyNo: z.string().min(1),
    noticeCustomerName: label,
    noticeExpiryDate: day.nullable(),
    noticePremium: money.nullable(),
    // Printed on the insurer's notice and typed off it. A computed provenance
    // would be this platform working out a renewal premium, which it never does.
    noticePremiumSource: z
      .enum(PREMIUM_SOURCES)
      .refine((value) => value !== 'computed')
      .nullable(),
    matchedPolicyId: id.nullable(),
    matchedCustomerId: id.nullable(),
    manuallyLinkedBy: id.nullable(),
    linkedAt: stamp.nullable(),
    rejectReason: z.string().min(1).nullable(),
    ocrFields: z.array(
      z.object({ name: z.string().min(1), value: z.string(), confirmed: z.boolean() }),
    ),
  })
  // §9: a matched row carries the policy it matched, or the send has nothing to
  // address. A row marked matched with no policy is the state the guard refuses.
  .refine((row) => row.state !== 'matched' || row.matchedPolicyId !== null, {
    error: 'A matched notice row records the policy the notice belongs to.',
  })
  .refine((row) => row.state !== 'rejected' || row.rejectReason !== null, {
    error: 'A rejected notice row records why it was rejected.',
  })

/** Table name to the schema its rows must satisfy. The test walks this map. */
/**
 * FR-21.5's run ledger. Seeded empty, and validated anyway: the rows the
 * dispatcher writes at runtime have to satisfy the same shape as any other, and
 * this is where that stays true after somebody adds a field to `RecipeRun`.
 */
export const recipeRunSchema = z.object({
  id,
  idempotencyKey: z.string().min(1),
  recipeKey: z.string().min(1),
  recipeVersion: z.int().min(1),
  trigger: z.string().min(1),
  subjectEntity: z.string().min(1).nullable(),
  subjectId: id.nullable(),
  phase: z.string().min(1).nullable(),
  decision: z.enum(RUN_DECISIONS),
  reason: z.string().min(1),
  emitted: z.array(z.string().min(1)),
  evaluatedAt: stamp,
  clockAt: stamp,
  causedBy: z.string().min(1).nullable(),
  chain: z.array(z.string().min(1)),
})

export const FIXTURE_SCHEMAS = {
  users: staffUserSchema,
  teams: teamSchema,
  categories: inquiryCategorySchema,
  masterTypes: masterTypeSchema,
  masterValues: masterValueSchema,
  inquiryStages: inquiryStageSchema,
  dispositions: dispositionSchema,
  retentionClasses: retentionClassSchema,
  formSchemas: formSchemaSchema,
  recipes: recipeSchema,
  recipeRuns: recipeRunSchema,
  messageTemplates: messageTemplateSchema,
  ocrTemplates: ocrTemplateSchema,
  integrations: integrationSchema,

  companies: companySchema,
  companyContacts: companyContactSchema,
  products: productSchema,
  docChecklists: docChecklistSchema,
  benefitItems: benefitItemSchema,
  policyBenefitMaps: policyBenefitMapSchema,
  agencies: agencySchema,
  agencyScopes: agencyScopeSchema,
  agents: agentSchema,
  commissionSplits: commissionSplitSchema,
  commissionRules: commissionRuleSchema,

  households: householdSchema,
  customers: customerSchema,
  members: memberSchema,
  consentRecords: consentRecordSchema,
  customerCredentials: customerCredentialSchema,

  inquiries: inquirySchema,
  quotations: quotationSchema,
  quotationLines: quotationLineSchema,
  deals: dealSchema,

  policies: policySchema,
  policyVersions: policyVersionSchema,
  policyPremiumComponents: policyPremiumComponentSchema,
  policyNcbs: policyNcbSchema,
  policyDispatches: policyDispatchSchema,
  policyDrafts: policyDraftSchema,
  premiumSchedules: premiumScheduleSchema,
  instalments: instalmentSchema,
  mandates: mandateSchema,
  mandateEvents: mandateEventSchema,
  collections: collectionSchema,
  endorsements: endorsementSchema,

  tasks: taskSchema,
  activities: activitySchema,
  requirements: requirementSchema,
  renewalTasks: renewalTaskSchema,
  documents: documentSchema,
  claims: claimSchema,
  noticeBatches: noticeBatchSchema,
  noticeMatches: noticeMatchSchema,
  messageLogs: messageLogSchema,
  ledgerEntries: ledgerEntrySchema,
} as const
