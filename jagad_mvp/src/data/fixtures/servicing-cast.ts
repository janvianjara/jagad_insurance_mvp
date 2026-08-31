/**
 * The servicing cast — endorsements, renewal notice batches, OCR templates and
 * integrations. Plan §8, and the §9 machines for endorsement and notice batch.
 *
 * It sits beside `story-cast.ts` rather than inside it because these four
 * clusters land together and the story file is already long; the records
 * reference the same people the client recognises. Rakesh Patel's floater
 * POL-4388 carries the corrected nominee and, separately, the mid-term sum
 * insured increase that produced version 2. Jayesh Kapadia's monthly policy
 * POL-4402 is the cancellation sitting on the claims check. The Tata AIG batch is
 * the one canvas n26-n36 walks: four rows, two matched, one that matched nothing
 * this agency holds, and one rejected outright — so the hard block on a bulk send
 * has something real to block.
 *
 * Every amount here was typed, in the sense that matters: a person read it off an
 * insurer's endorsement advice or off the printed renewal notice and wrote it
 * down. Nothing in this file computes a delta, a refund or a premium.
 *
 * Dates are written against `FIXTURE_NOW`. There is no `new Date()` here and no
 * `Math.random`; the whole file is hand-written, so it is byte-identical on every
 * build by construction.
 */

import { money } from '../../domain/money'
import type { DocumentRecord } from '../repo/documents'
import type { Endorsement } from '../repo/endorsements'
import type { IntegrationConfig } from '../repo/integrations'
import type { NoticeBatch, NoticeMatch, OcrTemplate } from '../repo/notices'
import type { PolicyVersion } from '../repo/policies'
import { USER_IDS, companyId } from './config-seed'
import { FIXTURE_NOW, addDays, isoDate, isoTime } from './clock'
import { localNo, systemNo } from './ids'

const NOW = FIXTURE_NOW

/* --------------------------------------------------------------- documents */

/**
 * The paper behind the records below: one insurer endorsement letter and two
 * uploaded renewal-notice PDFs. Content stays where content belongs — these rows
 * are metadata, and their file names and extracted text are `document-content`.
 */
export const SERVICING_DOCUMENTS: readonly DocumentRecord[] = [
  {
    id: 'doc-end-0035',
    systemNo: localNo('DOC', 7),
    subjectEntity: 'Endorsement',
    subjectId: 'end-0035',
    docType: 'endorsement_letter',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -9)),
    verifiedAt: isoTime(addDays(NOW, -8)),
    verifiedBy: USER_IDS.priya,
    reviewState: 'verified',
    retentionClass: 'health',
    isPresent: true,
    uploadedByName: 'Priya Desai',
    fileName: 'hdfc-ergo-endorsement-advice.pdf',
    fileUrl: 'mock://documents/end-0035.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [],
  },
  {
    id: 'doc-ntb-0001',
    systemNo: localNo('DOC', 8),
    subjectEntity: 'NoticeBatch',
    subjectId: 'ntb-0001',
    docType: 'renewal_notice',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -1)),
    verifiedAt: null,
    verifiedBy: null,
    reviewState: 'submitted',
    retentionClass: 'standard',
    isPresent: true,
    uploadedByName: 'Sneha Patel',
    fileName: 'tata-aig-renewal-notices-2026-08.pdf',
    fileUrl: 'mock://documents/ntb-0001.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [],
  },
  {
    id: 'doc-ntb-0002',
    systemNo: localNo('DOC', 9),
    subjectEntity: 'NoticeBatch',
    subjectId: 'ntb-0002',
    docType: 'renewal_notice',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -11)),
    verifiedAt: isoTime(addDays(NOW, -10)),
    verifiedBy: USER_IDS.sneha,
    reviewState: 'verified',
    retentionClass: 'standard',
    isPresent: true,
    uploadedByName: 'Sneha Patel',
    fileName: 'bajaj-allianz-renewal-notices-2026-08.pdf',
    fileUrl: 'mock://documents/ntb-0002.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [],
  },
]

/* ------------------------------------------------------------ endorsements */

/** Neither figure. The shape every non-financial endorsement holds, forever. */
const NO_FIGURE = { amount: null, source: null, insurerReference: null } as const

type EndorsementSeed = {
  readonly sequence: number
  readonly policyId: string
  readonly customerId: string
  readonly type: Endorsement['type']
  readonly state: Endorsement['state']
  readonly reason: string
  readonly changedFields: readonly string[]
  readonly raisedDaysAgo: number
  readonly ownerId?: string
  readonly effectiveFrom?: string
  readonly delta?: Endorsement['delta']
  readonly refund?: Endorsement['refund']
  readonly claimsVerdict?: Endorsement['claimsVerdict']
  readonly insurerEndorsementNo?: string
  readonly policyVersionId?: string
  readonly documentId?: string
  readonly approvedDaysAgo?: number
}

function buildEndorsement(seed: EndorsementSeed): Endorsement {
  const requestedAt = addDays(NOW, -seed.raisedDaysAgo)
  return {
    id: `end-${String(seed.sequence).padStart(4, '0')}`,
    systemNo: systemNo('endorsement', seed.sequence),
    insurerEndorsementNo: seed.insurerEndorsementNo ?? null,
    policyId: seed.policyId,
    customerId: seed.customerId,
    type: seed.type,
    state: seed.state,
    ownerId: seed.ownerId ?? USER_IDS.priya,
    requestedAt: isoTime(requestedAt),
    effectiveFrom: seed.effectiveFrom ?? null,
    reason: seed.reason,
    changedFields: seed.changedFields,
    replacesInsuredEntity: false,
    delta: seed.delta ?? NO_FIGURE,
    refund: seed.refund ?? NO_FIGURE,
    claimsVerdict: seed.claimsVerdict ?? null,
    policyVersionId: seed.policyVersionId ?? null,
    documentId: seed.documentId ?? null,
    approvedBy: seed.approvedDaysAgo === undefined ? null : USER_IDS.nikunj,
    approvedAt:
      seed.approvedDaysAgo === undefined ? null : isoTime(addDays(NOW, -seed.approvedDaysAgo)),
  }
}

export const ENDORSEMENTS: readonly Endorsement[] = [
  // Non-financial: a nominee's name spelt wrong. No premium field appears on the
  // form and neither figure exists on the record — §9's rule, as data.
  buildEndorsement({
    sequence: 31,
    policyId: 'pol-4388',
    customerId: 'cus-rakesh-patel',
    type: 'non_financial',
    state: 'non_financial',
    reason: 'Nominee name spelt Neeta on the schedule; the KYC reads Nita.',
    changedFields: ['nomineeName'],
    raisedDaysAgo: 3,
  }),

  // Financial, awaiting the delta off the insurer's advice.
  buildEndorsement({
    sequence: 32,
    policyId: 'pol-4419',
    customerId: 'cus-rakesh-patel',
    type: 'financial',
    state: 'delta_entry',
    reason: 'Sum assured raised mid-term at the customer request.',
    changedFields: ['sumInsured'],
    raisedDaysAgo: 2,
    effectiveFrom: isoDate(addDays(NOW, 5)),
  }),

  // Cancellation sitting on the claims-in-period check — canvas 7.3.
  buildEndorsement({
    sequence: 33,
    policyId: 'pol-4402',
    customerId: 'cus-jayesh-kapadia',
    type: 'cancellation',
    state: 'claims_check',
    reason: 'Customer has taken a group cover through his employer.',
    changedFields: ['status'],
    raisedDaysAgo: 1,
    ownerId: USER_IDS.sneha,
  }),

  // Cancellation, clear of claims: the refund is the insurer's own figure, read
  // off the advice named beside it. Nothing here pro-rated anything.
  buildEndorsement({
    sequence: 34,
    policyId: 'pol-4425',
    customerId: 'cus-rakesh-patel',
    type: 'cancellation',
    state: 'refund_typed',
    reason: 'Vehicle sold; cover cancelled from the transfer date.',
    changedFields: ['status'],
    raisedDaysAgo: 6,
    effectiveFrom: isoDate(addDays(NOW, -1)),
    refund: {
      amount: money(4_820),
      source: 'typed_from_insurer',
      insurerReference: 'BA-CANC-2026-118824',
    },
    claimsVerdict: { refundEligible: true, claimIds: [] },
  }),

  // The whole path walked: financial, approved, and versioned with both
  // endorsement numbers on the immutable version below.
  buildEndorsement({
    sequence: 35,
    policyId: 'pol-4388',
    customerId: 'cus-rakesh-patel',
    type: 'financial',
    state: 'policy_versioned',
    reason: 'Sum insured raised from 10 lakh to 15 lakh mid-term.',
    changedFields: ['sumInsured'],
    raisedDaysAgo: 12,
    effectiveFrom: '2026-08-18',
    delta: {
      amount: money(6_412),
      source: 'typed_from_insurer',
      insurerReference: 'HE-END-2026-774102',
    },
    insurerEndorsementNo: '2825 1049 7731 01',
    policyVersionId: 'pvr-4388-2',
    documentId: 'doc-end-0035',
    approvedDaysAgo: 9,
  }),

  // A claim fell inside the period, so the cancellation goes through and the
  // refund does not. §9's `refund_not_eligible`, with the claim named.
  buildEndorsement({
    sequence: 36,
    policyId: 'pol-4441',
    customerId: 'cus-falguni-shah',
    type: 'cancellation',
    state: 'refund_not_eligible',
    reason: 'Customer moving to a floater with another insurer.',
    changedFields: ['status'],
    raisedDaysAgo: 4,
    ownerId: USER_IDS.sneha,
    claimsVerdict: { refundEligible: false, claimIds: ['clm-0398'] },
  }),
]

/**
 * The version END-0035 wrote. Immutable, and carrying both endorsement numbers,
 * because both get read aloud on the phone.
 */
export const ENDORSEMENT_POLICY_VERSIONS: readonly PolicyVersion[] = [
  {
    id: 'pvr-4388-2',
    policyId: 'pol-4388',
    version: 2,
    effectiveFrom: '2026-08-18',
    documentId: 'doc-end-0035',
    endorsementNo: systemNo('endorsement', 35),
    insurerEndorsementNo: '2825 1049 7731 01',
    note: 'Sum insured raised to 15 lakh by endorsement. Version 1 stays exactly as issued.',
    createdAt: isoTime(addDays(NOW, -9)),
  },
]

/* ---------------------------------------------------------- OCR templates */

function ocrTemplate(seed: {
  readonly company: string
  readonly label: string
  readonly version: number
  readonly anchors: readonly (readonly [string, string, string])[]
}): OcrTemplate {
  return {
    id: `ocr-${seed.company}-renewal`,
    companyId: companyId(seed.company),
    key: `${seed.company}.renewal_notice`,
    label: seed.label,
    docType: 'renewal_notice',
    version: seed.version,
    fields: seed.anchors.map(([key, label, anchor]) => ({
      key,
      label,
      anchor,
      required: key === 'noticePolicyNo',
    })),
    active: true,
    updatedAt: isoTime(new Date('2026-06-02T05:30:00.000Z')),
  }
}

/**
 * Per insurer, because every company lays its renewal notice out differently.
 * The anchors are the printed words immediately before the value — configuration
 * an admin edits, not a parser a developer rewrites.
 */
export const OCR_TEMPLATES: readonly OcrTemplate[] = [
  ocrTemplate({
    company: 'tata-aig',
    label: 'Tata AIG renewal notice',
    version: 3,
    anchors: [
      ['noticePolicyNo', 'Policy number', 'Policy No.'],
      ['noticeCustomerName', 'Insured name', 'Insured Name'],
      ['noticeExpiryDate', 'Expiry date', 'Period of Insurance to'],
      ['noticePremium', 'Renewal premium', 'Total Premium Payable'],
    ],
  }),
  ocrTemplate({
    company: 'bajaj-allianz',
    label: 'Bajaj Allianz renewal notice',
    version: 2,
    anchors: [
      ['noticePolicyNo', 'Policy number', 'Policy Number'],
      ['noticeCustomerName', 'Insured name', 'Name of Insured'],
      ['noticeExpiryDate', 'Expiry date', 'Valid Upto'],
      ['noticePremium', 'Renewal premium', 'Gross Premium'],
    ],
  }),
  ocrTemplate({
    company: 'hdfc-ergo',
    label: 'HDFC Ergo renewal notice',
    version: 1,
    anchors: [
      ['noticePolicyNo', 'Policy number', 'Policy No'],
      ['noticeCustomerName', 'Insured name', 'Proposer'],
      ['noticeExpiryDate', 'Expiry date', 'Renewal Due On'],
      ['noticePremium', 'Renewal premium', 'Premium Due'],
    ],
  }),
  ocrTemplate({
    company: 'niva-bupa',
    label: 'Niva Bupa renewal notice',
    version: 1,
    anchors: [
      ['noticePolicyNo', 'Policy number', 'Policy Number'],
      ['noticeCustomerName', 'Insured name', 'Primary Insured'],
      ['noticeExpiryDate', 'Expiry date', 'Cover End Date'],
      ['noticePremium', 'Renewal premium', 'Amount Payable'],
    ],
  }),
]

/* ----------------------------------------------------------- notice batches */

export const NOTICE_BATCHES: readonly NoticeBatch[] = [
  {
    // Canvas n26-n36: in review, with one unmatched row that blocks the send.
    id: 'ntb-0001',
    systemNo: localNo('NTB', 1),
    companyId: companyId('tata-aig'),
    ocrTemplateId: 'ocr-tata-aig-renewal',
    state: 'review',
    sourceDocumentId: 'doc-ntb-0001',
    fileName: 'tata-aig-renewal-notices-2026-08.pdf',
    expiryMonth: '2026-09',
    uploadedBy: USER_IDS.sneha,
    uploadedAt: isoTime(addDays(NOW, -1)),
    ocrStartedAt: isoTime(addDays(NOW, -1)),
    ocrCompletedAt: isoTime(addDays(NOW, -1)),
    rowCount: 4,
    sentBy: null,
    sentAt: null,
  },
  {
    // The batch that went out, so a queue has a finished one beside the live one.
    id: 'ntb-0002',
    systemNo: localNo('NTB', 2),
    companyId: companyId('bajaj-allianz'),
    ocrTemplateId: 'ocr-bajaj-allianz-renewal',
    state: 'sent',
    sourceDocumentId: 'doc-ntb-0002',
    fileName: 'bajaj-allianz-renewal-notices-2026-08.pdf',
    expiryMonth: '2026-08',
    uploadedBy: USER_IDS.sneha,
    uploadedAt: isoTime(addDays(NOW, -11)),
    ocrStartedAt: isoTime(addDays(NOW, -11)),
    ocrCompletedAt: isoTime(addDays(NOW, -11)),
    rowCount: 2,
    sentBy: USER_IDS.sneha,
    sentAt: isoTime(addDays(NOW, -10)),
  },
]

type MatchSeed = {
  readonly id: string
  readonly batchId: string
  readonly rowNumber: number
  readonly state: NoticeMatch['state']
  readonly noticePolicyNo: string
  readonly noticeCustomerName: string
  readonly noticeExpiryDate: string
  readonly noticePremium: NoticeMatch['noticePremium']
  readonly matchedPolicyId?: string
  readonly matchedCustomerId?: string
  readonly manuallyLinkedBy?: string
  readonly linkedDaysAgo?: number
  readonly rejectReason?: string
  readonly confirmed: boolean
}

function buildMatch(seed: MatchSeed): NoticeMatch {
  return {
    id: seed.id,
    batchId: seed.batchId,
    rowNumber: seed.rowNumber,
    state: seed.state,
    noticePolicyNo: seed.noticePolicyNo,
    noticeCustomerName: seed.noticeCustomerName,
    noticeExpiryDate: seed.noticeExpiryDate,
    // Printed on the insurer's notice and typed off it, never derived from the
    // policy this platform holds.
    noticePremium: seed.noticePremium,
    noticePremiumSource: seed.noticePremium === null ? null : 'insurer_advice',
    matchedPolicyId: seed.matchedPolicyId ?? null,
    matchedCustomerId: seed.matchedCustomerId ?? null,
    manuallyLinkedBy: seed.manuallyLinkedBy ?? null,
    linkedAt: seed.linkedDaysAgo === undefined ? null : isoTime(addDays(NOW, -seed.linkedDaysAgo)),
    rejectReason: seed.rejectReason ?? null,
    ocrFields: [
      { name: 'noticePolicyNo', value: seed.noticePolicyNo, confirmed: seed.confirmed },
      { name: 'noticeCustomerName', value: seed.noticeCustomerName, confirmed: seed.confirmed },
      { name: 'noticeExpiryDate', value: seed.noticeExpiryDate, confirmed: seed.confirmed },
    ],
  }
}

export const NOTICE_MATCHES: readonly NoticeMatch[] = [
  buildMatch({
    id: 'ntm-0001-1',
    batchId: 'ntb-0001',
    rowNumber: 1,
    state: 'matched',
    noticePolicyNo: 'TA-HLT-0092214',
    noticeCustomerName: 'Falguni Shah',
    noticeExpiryDate: '2026-08-31',
    noticePremium: money(10_240),
    matchedPolicyId: 'pol-4441',
    matchedCustomerId: 'cus-falguni-shah',
    confirmed: true,
  }),
  buildMatch({
    // Matched, but nobody has checked the extraction yet — so this row alone
    // keeps the bulk send blocked even though it is linked to a policy.
    id: 'ntm-0001-2',
    batchId: 'ntb-0001',
    rowNumber: 2,
    state: 'matched',
    noticePolicyNo: 'TA-TRV-0331808',
    noticeCustomerName: 'Falguni Shah',
    noticeExpiryDate: '2026-09-12',
    noticePremium: money(4_390),
    matchedPolicyId: 'pol-4443',
    matchedCustomerId: 'cus-falguni-shah',
    confirmed: false,
  }),
  buildMatch({
    // The row this agency holds nothing for. §9: a hard block on the bulk send.
    id: 'ntm-0001-3',
    batchId: 'ntb-0001',
    rowNumber: 3,
    state: 'unmatched',
    noticePolicyNo: 'TA-HLT-0114552',
    noticeCustomerName: 'R M Shah',
    noticeExpiryDate: '2026-09-04',
    noticePremium: money(7_150),
    confirmed: false,
  }),
  buildMatch({
    id: 'ntm-0001-4',
    batchId: 'ntb-0001',
    rowNumber: 4,
    state: 'rejected',
    noticePolicyNo: 'TA-MOT-0009911',
    noticeCustomerName: 'Kiritbhai Joshi',
    noticeExpiryDate: '2026-09-20',
    noticePremium: money(3_980),
    rejectReason: 'Sits on another agency code; not ours to renew.',
    confirmed: true,
  }),

  buildMatch({
    id: 'ntm-0002-1',
    batchId: 'ntb-0002',
    rowNumber: 1,
    state: 'matched',
    noticePolicyNo: 'OG-26-2601-1801-00007731',
    noticeCustomerName: 'Bhavesh Trivedi',
    noticeExpiryDate: '2026-08-28',
    noticePremium: money(9_180),
    matchedPolicyId: 'pol-4437',
    matchedCustomerId: 'cus-bhavesh-trivedi',
    confirmed: true,
  }),
  buildMatch({
    // Automatic matching could not resolve it; Sneha linked it by hand, which is
    // §9's only way out of unmatched and is recorded as hers.
    id: 'ntm-0002-2',
    batchId: 'ntb-0002',
    rowNumber: 2,
    state: 'matched',
    noticePolicyNo: 'OG-27-2601-1811-00004402',
    noticeCustomerName: 'R J Patel',
    noticeExpiryDate: '2027-05-19',
    noticePremium: money(11_460),
    matchedPolicyId: 'pol-4425',
    matchedCustomerId: 'cus-rakesh-patel',
    manuallyLinkedBy: USER_IDS.sneha,
    linkedDaysAgo: 10,
    confirmed: true,
  }),
]

/* ------------------------------------------------------------ integrations */

const CONFIGURED_AT = isoTime(new Date('2026-02-11T07:15:00.000Z'))

/**
 * What exists, and nothing more. Not one of these rows holds a key, a token, a
 * password or a sender secret: those live in the provider's own console, exactly
 * as a mandate's bank credential lives with the bank.
 */
export const INTEGRATIONS: readonly IntegrationConfig[] = [
  {
    id: 'itg-whatsapp-bsp',
    key: 'whatsapp.bsp',
    kind: 'bsp',
    label: 'WhatsApp Business messaging',
    providerName: 'Gupshup',
    enabled: true,
    settings: { senderNumber: '918000000000', wabaDisplayName: 'Jagad Insurance', region: 'in' },
    lastCheckedAt: isoTime(addDays(NOW, -1)),
    lastCheckOutcome: 'ok',
    lastCheckNote: null,
    updatedAt: CONFIGURED_AT,
    updatedBy: USER_IDS.vivek,
  },
  {
    id: 'itg-sms-primary',
    key: 'sms.primary',
    kind: 'sms',
    label: 'Transactional SMS',
    providerName: 'MSG91',
    enabled: true,
    settings: { senderId: 'JAGADI', route: 'transactional', dltEntityRegistered: true },
    lastCheckedAt: isoTime(addDays(NOW, -4)),
    lastCheckOutcome: 'ok',
    lastCheckNote: null,
    updatedAt: CONFIGURED_AT,
    updatedBy: USER_IDS.vivek,
  },
  {
    id: 'itg-smtp-office',
    key: 'smtp.office',
    kind: 'smtp',
    label: 'Outbound email',
    providerName: 'Amazon SES',
    enabled: true,
    settings: { host: 'email-smtp.ap-south-1.amazonaws.com', port: 587, fromAddress: 'no-reply@jagadinsurance.example', startTls: true },
    lastCheckedAt: isoTime(addDays(NOW, -2)),
    lastCheckOutcome: 'failed',
    lastCheckNote: 'The provider reported the sending domain as pending verification.',
    updatedAt: CONFIGURED_AT,
    updatedBy: USER_IDS.vivek,
  },
  {
    id: 'itg-ocr-notices',
    key: 'ocr.notices',
    kind: 'ocr',
    label: 'Renewal notice extraction',
    providerName: 'Amazon Textract',
    enabled: true,
    settings: { region: 'ap-south-1', maxPagesPerBatch: 400, confidenceFloor: 82 },
    lastCheckedAt: isoTime(addDays(NOW, -1)),
    lastCheckOutcome: 'ok',
    lastCheckNote: null,
    updatedAt: CONFIGURED_AT,
    updatedBy: USER_IDS.vivek,
  },
  {
    // Configured and deliberately off, so the screen opens on both states.
    id: 'itg-whatsapp-bsp-standby',
    key: 'whatsapp.bsp.standby',
    kind: 'bsp',
    label: 'WhatsApp Business messaging (standby)',
    providerName: 'Interakt',
    enabled: false,
    settings: { senderNumber: '918000000001', wabaDisplayName: 'Jagad Insurance', region: 'in' },
    lastCheckedAt: null,
    lastCheckOutcome: null,
    lastCheckNote: null,
    updatedAt: CONFIGURED_AT,
    updatedBy: USER_IDS.vivek,
  },
]
