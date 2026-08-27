/**
 * The story cast — plan §8 ("Story records"), and the 48-scenario canvas.
 *
 * These are the records the client recognises from the prototype walkthrough:
 * Rakesh Patel's household with the health floater on HDFC Ergo, Jayesh Kapadia's
 * monthly mandate that failed, the inquiries numbered INQ-1036 and INQ-1041, the
 * drafts POL-DRAFT-0219 and POL-DRAFT-0224, the cashless claim CLM-0412. The
 * numbers are the ones the prototype prints, because a demo that renumbers the
 * walkthrough is a demo the client has to be re-taught.
 *
 * Every M0 row of the canvas matrix is walkable on this set. Flow 1 has an
 * inquiry sitting in each of its six states, flow 2 a quotation at each stage of
 * the loop plus the empty deal that must be blocked, flow 3 a policy at each step
 * from draft to issued with the collections and the OCR document beside them. The
 * P2 flows — claims, renewals, endorsement — have their records seeded so the P2
 * screens open onto something rather than onto an empty table.
 *
 * Every amount here was typed, in the sense that matters: it is a figure written
 * into this file by a person, exactly as an insurer's quote is typed into the
 * platform. Nothing in this file computes a premium. The two additions that do
 * appear are the only two the product allows — Final is Net plus the typed GST.
 */

import { addMoney, money } from '../../domain/money'
import type { Money } from '../../domain/money'
import type { Agency } from '../repo/agencies'
import type { Claim } from '../repo/claims'
import type { LedgerEntry } from '../repo/commission'
import type { MessageLog } from '../repo/config'
import type {
  ConsentRecord,
  Customer,
  CustomerCredential,
  Household,
  Member,
} from '../repo/customers'
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
import type { Quotation, QuotationLine } from '../repo/quotations'
import type { RenewalTask, Task } from '../repo/tasks'
import { AGENT_IDS, TEAM_IDS, USER_IDS, companyId, productId } from './config-seed'
import { FIXTURE_NOW, addDays, addMinutes, addMonths, isoDate, isoTime } from './clock'
import { localNo, systemNo } from './ids'

const NOW = FIXTURE_NOW

/** Net plus the typed GST. The only arithmetic this file performs on money. */
function finalFrom(net: Money, gst: Money): Money {
  return addMoney(net, gst)
}

/* ----------------------------------------------------------------- household */

export const HOUSEHOLDS: readonly Household[] = [
  {
    id: 'hh-patel',
    name: 'Patel household',
    headCustomerId: 'cus-rakesh-patel',
    customerIds: ['cus-rakesh-patel'],
    city: 'Surat',
  },
]

/* ----------------------------------------------------------------- customers */

type CustomerSeed = {
  readonly id: string
  readonly sequence: number
  readonly fullName: string
  readonly mobile: string
  readonly status: Customer['status']
  readonly source: Customer['source']
  readonly kycState: Customer['kycState']
  readonly consentState: Customer['consentState']
  readonly householdId?: string
  readonly ownerId?: string
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly email?: string | null
  readonly dateOfBirth?: string | null
  readonly aadhaarLast4?: string | null
  readonly panNumber?: string | null
  readonly createdDaysAgo: number
}

function buildCustomer(seed: CustomerSeed): Customer {
  return {
    id: seed.id,
    systemNo: systemNo('customer', seed.sequence),
    householdId: seed.householdId ?? null,
    status: seed.status,
    source: seed.source,
    createdAt: isoTime(addDays(NOW, -seed.createdDaysAgo)),
    ownerId: seed.ownerId ?? USER_IDS.kiran,
    agentId: seed.agentId === undefined ? AGENT_IDS.kiran : seed.agentId,
    subAgentId: seed.subAgentId ?? null,
    kycState: seed.kycState,
    consentState: seed.consentState,
    fullName: seed.fullName,
    mobile: seed.mobile,
    altMobile: null,
    email: seed.email ?? null,
    addressLine: null,
    city: 'Surat',
    state: 'Gujarat',
    pincode: '395007',
    dateOfBirth: seed.dateOfBirth ?? null,
    aadhaarNumber: null,
    aadhaarLast4: seed.aadhaarLast4 ?? null,
    panNumber: seed.panNumber ?? null,
    bankAccountNumber: null,
    bankIfsc: null,
  }
}

export const CUSTOMERS: readonly Customer[] = [
  buildCustomer({
    id: 'cus-rakesh-patel',
    sequence: 1,
    fullName: 'Rakesh Patel',
    mobile: '9825110001',
    status: 'active',
    source: 'referral',
    // KYC in progress, per the prototype. The consent link is out and unanswered.
    kycState: 'partial',
    consentState: 'link_issued',
    householdId: 'hh-patel',
    email: 'rakesh.patel@example.com',
    dateOfBirth: '1979-04-12',
    aadhaarLast4: '4102',
    panNumber: 'ABCPP1234K',
    createdDaysAgo: 900,
  }),
  buildCustomer({
    id: 'cus-jayesh-kapadia',
    sequence: 2,
    fullName: 'Jayesh Kapadia',
    mobile: '9825110002',
    status: 'active',
    source: 'walk_in',
    kycState: 'complete',
    consentState: 'submitted',
    email: 'jayesh.kapadia@example.com',
    dateOfBirth: '1986-11-02',
    aadhaarLast4: '7731',
    panNumber: 'ABCPK5678L',
    createdDaysAgo: 640,
  }),
  buildCustomer({
    id: 'cus-nilesh-bhatt',
    sequence: 3,
    fullName: 'Nilesh Bhatt',
    mobile: '9825110003',
    status: 'active',
    source: 'referral',
    kycState: 'complete',
    consentState: 'submitted',
    dateOfBirth: '1981-07-19',
    aadhaarLast4: '2288',
    createdDaysAgo: 1100,
  }),
  buildCustomer({
    id: 'cus-bhavesh-trivedi',
    sequence: 4,
    fullName: 'Bhavesh Trivedi',
    mobile: '9825110004',
    status: 'active',
    source: 'campaign',
    kycState: 'complete',
    consentState: 'submitted',
    dateOfBirth: '1990-01-30',
    aadhaarLast4: '5560',
    createdDaysAgo: 420,
  }),
  buildCustomer({
    id: 'cus-falguni-shah',
    sequence: 5,
    fullName: 'Falguni Shah',
    mobile: '9825110005',
    status: 'active',
    source: 'website',
    kycState: 'complete',
    consentState: 'submitted',
    email: 'falguni.shah@example.com',
    dateOfBirth: '1988-09-08',
    aadhaarLast4: '9014',
    createdDaysAgo: 500,
  }),
  buildCustomer({
    id: 'cus-hitesh-mehta',
    sequence: 6,
    fullName: 'Hitesh Mehta',
    mobile: '9825110006',
    status: 'prospect',
    source: 'website',
    kycState: 'pending',
    consentState: 'not_sent',
    ownerId: USER_IDS.nita,
    agentId: null,
    createdDaysAgo: 12,
  }),
  buildCustomer({
    id: 'cus-dipika-shah',
    sequence: 7,
    fullName: 'Dipika Shah',
    mobile: '9825110007',
    status: 'prospect',
    source: 'sub_agent',
    kycState: 'pending',
    consentState: 'not_sent',
    subAgentId: AGENT_IDS.meera,
    createdDaysAgo: 2,
  }),
]

/* ------------------------------------------------------------------- members */

/**
 * The floater's covered lives. Health fields stay null: nothing in M0 needs a
 * declaration recorded, and a fixture carrying invented medical text is a
 * liability rather than a demo aid.
 */
export const MEMBERS: readonly Member[] = [
  {
    id: 'mem-rakesh',
    customerId: 'cus-rakesh-patel',
    householdId: 'hh-patel',
    coveredUnderPolicyIds: ['pol-4388'],
    fullName: 'Rakesh Patel',
    relationship: 'self',
    dateOfBirth: '1979-04-12',
    gender: 'male',
    mobile: '9825110001',
    aadhaarNumber: null,
    aadhaarLast4: '4102',
    healthDeclaration: null,
    preExistingConditions: null,
    diagnosis: null,
  },
  {
    id: 'mem-nita-patel',
    customerId: 'cus-rakesh-patel',
    householdId: 'hh-patel',
    coveredUnderPolicyIds: ['pol-4388'],
    fullName: 'Nita Patel',
    relationship: 'spouse',
    dateOfBirth: '1983-02-21',
    gender: 'female',
    mobile: null,
    aadhaarNumber: null,
    aadhaarLast4: '6640',
    healthDeclaration: null,
    preExistingConditions: null,
    diagnosis: null,
  },
  {
    id: 'mem-aarav-patel',
    customerId: 'cus-rakesh-patel',
    householdId: 'hh-patel',
    coveredUnderPolicyIds: ['pol-4388'],
    fullName: 'Aarav Patel',
    relationship: 'son',
    dateOfBirth: '2011-06-03',
    gender: 'male',
    mobile: null,
    aadhaarNumber: null,
    aadhaarLast4: '3375',
    healthDeclaration: null,
    preExistingConditions: null,
    diagnosis: null,
  },
  {
    id: 'mem-kavya-patel',
    customerId: 'cus-rakesh-patel',
    householdId: 'hh-patel',
    coveredUnderPolicyIds: ['pol-4388'],
    fullName: 'Kavya Patel',
    relationship: 'daughter',
    dateOfBirth: '2015-12-17',
    gender: 'female',
    mobile: null,
    aadhaarNumber: null,
    aadhaarLast4: '8129',
    healthDeclaration: null,
    preExistingConditions: null,
    diagnosis: null,
  },
]

export const CONSENT_RECORDS: readonly ConsentRecord[] = [
  {
    id: 'cns-rakesh',
    customerId: 'cus-rakesh-patel',
    state: 'link_issued',
    // Written out rather than generated: the fixture PRNG is not cryptographic
    // and a token that matters must never come from it.
    token: 'cns-8f31c6d2a47b9e05f1a2',
    channel: 'whatsapp',
    issuedAt: isoTime(addDays(NOW, -2)),
    expiresAt: isoTime(addDays(NOW, 5)),
    submittedAt: null,
  },
  {
    id: 'cns-jayesh',
    customerId: 'cus-jayesh-kapadia',
    state: 'submitted',
    token: 'cns-2b74e19d5c806af3d4e7',
    channel: 'whatsapp',
    issuedAt: isoTime(addDays(NOW, -300)),
    expiresAt: isoTime(addDays(NOW, -293)),
    submittedAt: isoTime(addDays(NOW, -298)),
  },
]

export const CUSTOMER_CREDENTIALS: readonly CustomerCredential[] = [
  {
    id: 'crd-jayesh',
    customerId: 'cus-jayesh-kapadia',
    username: 'jayesh.kapadia',
    issuedAt: isoTime(addDays(NOW, -298)),
    channel: 'whatsapp',
    active: true,
  },
]

/* ----------------------------------------------------------------- inquiries */

type InquirySeed = {
  readonly sequence: number
  readonly id: string
  readonly status: Inquiry['status']
  readonly source: Inquiry['source']
  readonly categoryId: string | null
  readonly contactName: string
  readonly contactMobile: string
  readonly ownerId: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly customerId?: string | null
  readonly productInterest: readonly string[]
  readonly createdMinutesAgo: number
  readonly assignedMinutesAgo?: number
  readonly tatMinutes?: number
  readonly assignmentHistory?: Inquiry['assignmentHistory']
  readonly escalationLevel?: number
  readonly notes?: string
}

function buildInquiry(seed: InquirySeed): Inquiry {
  const createdAt = addMinutes(NOW, -seed.createdMinutesAgo)
  const assignedAt =
    seed.assignedMinutesAgo === undefined ? null : addMinutes(NOW, -seed.assignedMinutesAgo)
  const tatDueAt =
    assignedAt !== null && seed.tatMinutes !== undefined
      ? addMinutes(assignedAt, seed.tatMinutes)
      : null

  return {
    id: seed.id,
    systemNo: systemNo('inquiry', seed.sequence),
    status: seed.status,
    source: seed.source,
    categoryId: seed.categoryId,
    productInterest: seed.productInterest,
    ownerId: seed.ownerId,
    teamId: seed.categoryId === null ? null : TEAM_IDS.sales,
    agentId: seed.agentId === undefined ? null : seed.agentId,
    subAgentId: seed.subAgentId ?? null,
    assignedAt: assignedAt === null ? null : isoTime(assignedAt),
    tatDueAt: tatDueAt === null ? null : isoTime(tatDueAt),
    assignmentHistory: seed.assignmentHistory ?? [],
    escalationLevel: seed.escalationLevel ?? 0,
    createdAt: isoTime(createdAt),
    customerId: seed.customerId ?? null,
    contactName: seed.contactName,
    contactMobile: seed.contactMobile,
    contactEmail: null,
    notes: seed.notes ?? null,
  }
}

export const INQUIRIES: readonly Inquiry[] = [
  buildInquiry({
    sequence: 1025,
    id: 'inq-1025',
    status: 'converted',
    source: 'referral',
    categoryId: 'cat-health',
    contactName: 'Rakesh Patel',
    contactMobile: '9825110001',
    ownerId: USER_IDS.kiran,
    agentId: AGENT_IDS.kiran,
    customerId: 'cus-rakesh-patel',
    productInterest: [productId('HE-OPS')],
    createdMinutesAgo: 60 * 24 * 21,
    assignedMinutesAgo: 60 * 24 * 21,
    tatMinutes: 60,
    assignmentHistory: [
      { assigneeId: USER_IDS.kiran, assignedAt: isoTime(addDays(NOW, -21)) },
    ],
    notes: 'Household floater for four lives. Comparison asked across three companies.',
  }),
  buildInquiry({
    sequence: 1028,
    id: 'inq-1028',
    status: 'lost',
    source: 'campaign',
    categoryId: 'cat-motor',
    contactName: 'Paresh Vora',
    contactMobile: '9825110028',
    ownerId: USER_IDS.nita,
    productInterest: [productId('BA-MPK')],
    createdMinutesAgo: 60 * 24 * 18,
    assignedMinutesAgo: 60 * 24 * 18,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addDays(NOW, -18)) }],
    notes: 'Bought from another agency before the quotation went out.',
  }),
  buildInquiry({
    sequence: 1031,
    id: 'inq-1031',
    status: 'accepted',
    source: 'walk_in',
    categoryId: 'cat-motor',
    contactName: 'Bhavesh Trivedi',
    contactMobile: '9825110004',
    ownerId: USER_IDS.nita,
    customerId: 'cus-bhavesh-trivedi',
    productInterest: [productId('BA-MPK')],
    createdMinutesAgo: 60 * 24 * 14,
    assignedMinutesAgo: 60 * 24 * 14,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addDays(NOW, -14)) }],
  }),
  buildInquiry({
    sequence: 1032,
    id: 'inq-1032',
    status: 'accepted',
    source: 'referral',
    categoryId: 'cat-health',
    contactName: 'Nilesh Bhatt',
    contactMobile: '9825110003',
    ownerId: USER_IDS.kiran,
    agentId: AGENT_IDS.kiran,
    customerId: 'cus-nilesh-bhatt',
    productInterest: [productId('IT-FHP')],
    createdMinutesAgo: 60 * 24 * 12,
    assignedMinutesAgo: 60 * 24 * 12,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.kiran, assignedAt: isoTime(addDays(NOW, -12)) }],
  }),
  buildInquiry({
    sequence: 1035,
    id: 'inq-1035',
    status: 'converted',
    source: 'website',
    categoryId: 'cat-health',
    contactName: 'Hitesh Mehta',
    contactMobile: '9825110006',
    ownerId: USER_IDS.nita,
    customerId: 'cus-hitesh-mehta',
    productInterest: [productId('HE-OPS'), productId('BA-HGD')],
    createdMinutesAgo: 60 * 24 * 11,
    assignedMinutesAgo: 60 * 24 * 11,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addDays(NOW, -11)) }],
  }),
  buildInquiry({
    sequence: 1036,
    id: 'inq-1036',
    status: 'accepted',
    source: 'website',
    categoryId: 'cat-travel',
    contactName: 'Falguni Shah',
    contactMobile: '9825110005',
    ownerId: USER_IDS.nita,
    customerId: 'cus-falguni-shah',
    productInterest: [productId('TA-TVG')],
    createdMinutesAgo: 60 * 24 * 9,
    assignedMinutesAgo: 60 * 24 * 9,
    tatMinutes: 240,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addDays(NOW, -9)) }],
  }),
  buildInquiry({
    sequence: 1039,
    id: 'inq-1039',
    status: 'accepted',
    source: 'referral',
    categoryId: 'cat-life',
    contactName: 'Jayesh Kapadia',
    contactMobile: '9825110002',
    ownerId: USER_IDS.nita,
    customerId: 'cus-jayesh-kapadia',
    productInterest: [productId('LC-JVA')],
    createdMinutesAgo: 60 * 24 * 7,
    assignedMinutesAgo: 60 * 24 * 7,
    tatMinutes: 120,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addDays(NOW, -7)) }],
  }),

  // Canvas 1.6 — a sub-agent in the field saved a name and a mobile, nothing else.
  buildInquiry({
    sequence: 1040,
    id: 'inq-1040',
    status: 'new',
    source: 'sub_agent',
    categoryId: 'cat-health',
    contactName: 'Dipika Shah',
    contactMobile: '9825110007',
    ownerId: null,
    agentId: AGENT_IDS.kiran,
    subAgentId: AGENT_IDS.meera,
    customerId: 'cus-dipika-shah',
    productInterest: [],
    createdMinutesAgo: 25,
  }),

  // Canvas 1.5 — routing could not resolve a category, so it waits where somebody
  // can see it. Never lost.
  buildInquiry({
    sequence: 1041,
    id: 'inq-1041',
    status: 'unrouted',
    source: 'website',
    categoryId: null,
    contactName: 'Ketan Zaveri',
    contactMobile: '9825110041',
    ownerId: null,
    productInterest: [],
    createdMinutesAgo: 180,
    notes: 'Asked about cover for a pet. No category matches; admin alerted.',
  }),

  // Canvas 1.4 — reassigned once, and the second TAT has already lapsed. The
  // history carries both holders, which is what escalation requires.
  buildInquiry({
    sequence: 1042,
    id: 'inq-1042',
    status: 'reassigned',
    source: 'website',
    categoryId: 'cat-health',
    contactName: 'Sagar Bhavsar',
    contactMobile: '9825110042',
    ownerId: USER_IDS.nita,
    productInterest: [productId('NB-RA2')],
    createdMinutesAgo: 300,
    assignedMinutesAgo: 150,
    tatMinutes: 60,
    assignmentHistory: [
      {
        assigneeId: USER_IDS.kiran,
        assignedAt: isoTime(addMinutes(NOW, -300)),
        releasedAt: isoTime(addMinutes(NOW, -150)),
        reason: 'TAT elapsed without confirmation',
      },
      { assigneeId: USER_IDS.nita, assignedAt: isoTime(addMinutes(NOW, -150)) },
    ],
    escalationLevel: 0,
  }),

  // Canvas 1.1 — arrived from the website, routing has not run yet.
  buildInquiry({
    sequence: 1044,
    id: 'inq-1044',
    status: 'new',
    source: 'website',
    categoryId: 'cat-health',
    contactName: 'Urvashi Naik',
    contactMobile: '9825110044',
    ownerId: null,
    productInterest: [productId('NB-HCP')],
    createdMinutesAgo: 8,
  }),

  // Canvas 1.2 — assigned, clock still running, waiting on a confirmation.
  buildInquiry({
    sequence: 1045,
    id: 'inq-1045',
    status: 'assigned',
    source: 'referral',
    categoryId: 'cat-health',
    contactName: 'Tejas Amin',
    contactMobile: '9825110045',
    ownerId: USER_IDS.kiran,
    agentId: AGENT_IDS.kiran,
    productInterest: [productId('HE-OPR')],
    createdMinutesAgo: 40,
    assignedMinutesAgo: 35,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.kiran, assignedAt: isoTime(addMinutes(NOW, -35)) }],
  }),

  // Canvas 1.3 — assigned, and the TAT has passed with no confirmation.
  buildInquiry({
    sequence: 1046,
    id: 'inq-1046',
    status: 'assigned',
    source: 'website',
    categoryId: 'cat-motor',
    contactName: 'Rina Chokshi',
    contactMobile: '9825110046',
    ownerId: USER_IDS.nita,
    productInterest: [productId('IL-PCP')],
    createdMinutesAgo: 140,
    assignedMinutesAgo: 130,
    tatMinutes: 60,
    assignmentHistory: [{ assigneeId: USER_IDS.nita, assignedAt: isoTime(addMinutes(NOW, -130)) }],
  }),
]

/* ---------------------------------------------------------------- quotations */

/** The rows the composer opens with for a health comparison, in brochure order. */
const HEALTH_ROWS: readonly (readonly [string, string])[] = [
  ['sum-insured', 'Sum insured'],
  ['room-rent', 'Room rent limit'],
  ['pre-hosp', 'Pre-hospitalisation'],
  ['post-hosp', 'Post-hospitalisation'],
  ['restore', 'Restore benefit'],
  ['ncb', 'No claim bonus'],
  ['ped-wait', 'Pre-existing waiting period'],
  ['ambulance', 'Ambulance cover'],
]

function healthRows(extra?: { key: string; label: string }): Quotation['benefitRows'] {
  const base = HEALTH_ROWS.map(([key, label], index) => ({
    key,
    benefitItemId: `ben-${key}`,
    label,
    adHoc: false,
    sortOrder: index + 1,
  }))
  if (!extra) return base
  return [
    ...base,
    {
      key: extra.key,
      benefitItemId: null,
      label: extra.label,
      adHoc: true,
      sortOrder: base.length + 1,
    },
  ]
}

export const QUOTATIONS: readonly Quotation[] = [
  // Canvas 2.1-2.3 — three companies compared for the Patel floater, one ad-hoc
  // row added inline, every column's figure typed. Ready to generate.
  {
    id: 'qtn-0329',
    systemNo: systemNo('quotation', 329),
    version: 1,
    status: 'composed',
    customerId: 'cus-rakesh-patel',
    inquiryId: 'inq-1025',
    ownerId: USER_IDS.kiran,
    agentId: AGENT_IDS.kiran,
    companyIds: [companyId('hdfc-ergo'), companyId('niva-bupa'), companyId('icici-lombard')],
    productIds: [productId('HE-OPS'), productId('NB-RA2'), productId('IL-CHI')],
    benefitRows: healthRows({ key: 'opd-dental', label: 'OPD dental cover' }),
    premiumMode: 'annual',
    finalPayablePremium: null,
    sharedAt: null,
    revisionReason: null,
    lostReason: null,
    createdAt: isoTime(addDays(NOW, -20)),
    documentId: null,
  },

  // Canvas 2.4-2.7 — shared with the customer and waiting on their answer. Won,
  // lost and revision all open from here.
  {
    id: 'qtn-0331',
    systemNo: systemNo('quotation', 331),
    version: 1,
    status: 'shared',
    customerId: 'cus-hitesh-mehta',
    inquiryId: 'inq-1035',
    ownerId: USER_IDS.nita,
    agentId: null,
    companyIds: [companyId('hdfc-ergo'), companyId('bajaj-allianz')],
    productIds: [productId('HE-OPS'), productId('HE-OPR'), productId('BA-HGD')],
    benefitRows: healthRows(),
    premiumMode: 'annual',
    finalPayablePremium: null,
    sharedAt: isoTime(addDays(NOW, -6)),
    revisionReason: null,
    lostReason: null,
    createdAt: isoTime(addDays(NOW, -8)),
    documentId: null,
  },

  // Canvas 2.5 already walked: a revision opened v2, v1 stayed exactly as sent,
  // and the customer then agreed. APP-0774 came out of this one.
  {
    id: 'qtn-0332',
    systemNo: systemNo('quotation', 332),
    version: 2,
    status: 'won',
    customerId: 'cus-falguni-shah',
    inquiryId: 'inq-1036',
    ownerId: USER_IDS.nita,
    agentId: null,
    companyIds: [companyId('tata-aig')],
    productIds: [productId('TA-TVG'), productId('TA-MCP')],
    benefitRows: healthRows(),
    premiumMode: 'annual',
    finalPayablePremium: money(18_644),
    sharedAt: isoTime(addDays(NOW, -4)),
    revisionReason: 'Customer asked for a higher sum insured on the health column.',
    lostReason: null,
    createdAt: isoTime(addDays(NOW, -9)),
    documentId: 'doc-qtn-0332',
  },
]

type LineSeed = {
  readonly id: string
  readonly quotationId: string
  readonly version: number
  readonly columnKey: string
  readonly label: string
  readonly company: string
  readonly product: string
  readonly net: Money
  readonly gst: Money
  readonly values: Readonly<Record<string, string>>
  readonly locked?: boolean
}

function buildLine(seed: LineSeed): QuotationLine {
  return {
    id: seed.id,
    quotationId: seed.quotationId,
    version: seed.version,
    columnKey: seed.columnKey,
    label: seed.label,
    companyId: companyId(seed.company),
    productId: productId(seed.product),
    finalPayablePremium: finalFrom(seed.net, seed.gst),
    finalPremiumSource: 'typed',
    benefitValues: seed.values,
    locked: seed.locked ?? false,
  }
}

const PATEL_VALUES_HDFC = {
  'sum-insured': '10,00,000',
  'room-rent': 'Single private room',
  'pre-hosp': '60 days',
  'post-hosp': '180 days',
  restore: '100% once a year',
  ncb: '50% per year, max 100%',
  'ped-wait': '36 months',
  ambulance: '5,000 per event',
  'opd-dental': '5,000 per year',
}

const PATEL_VALUES_NIVA = {
  'sum-insured': '10,00,000',
  'room-rent': 'No capping',
  'pre-hosp': '60 days',
  'post-hosp': '180 days',
  restore: 'Unlimited',
  ncb: '50% per year, max 100%',
  'ped-wait': '36 months',
  ambulance: 'Actuals',
  'opd-dental': 'Not covered',
}

const PATEL_VALUES_ICICI = {
  'sum-insured': '10,00,000',
  'room-rent': '1% of sum insured',
  'pre-hosp': '30 days',
  'post-hosp': '60 days',
  restore: '100% once a year',
  ncb: '10% per year, max 50%',
  'ped-wait': '48 months',
  ambulance: '2,000 per event',
  'opd-dental': 'Not covered',
}

const MEHTA_VALUES = {
  'sum-insured': '5,00,000',
  'room-rent': 'Single private room',
  'pre-hosp': '30 days',
  'post-hosp': '60 days',
  restore: '100% once a year',
  ncb: '10% per year, max 50%',
  'ped-wait': '48 months',
  ambulance: '2,000 per event',
}

export const QUOTATION_LINES: readonly QuotationLine[] = [
  buildLine({
    id: 'qln-0329-a',
    quotationId: 'qtn-0329',
    version: 1,
    columnKey: 'hdfc-optima',
    label: 'HDFC Ergo Optima Secure',
    company: 'hdfc-ergo',
    product: 'HE-OPS',
    net: money(24_180),
    gst: money(4_352, 40),
    values: PATEL_VALUES_HDFC,
  }),
  buildLine({
    id: 'qln-0329-b',
    quotationId: 'qtn-0329',
    version: 1,
    columnKey: 'niva-reassure',
    label: 'Niva Bupa ReAssure 2.0',
    company: 'niva-bupa',
    product: 'NB-RA2',
    net: money(22_940),
    gst: money(4_129, 20),
    values: PATEL_VALUES_NIVA,
  }),
  buildLine({
    id: 'qln-0329-c',
    quotationId: 'qtn-0329',
    version: 1,
    columnKey: 'icici-complete',
    label: 'ICICI Lombard Complete Health',
    company: 'icici-lombard',
    product: 'IL-CHI',
    net: money(21_500),
    gst: money(3_870),
    values: PATEL_VALUES_ICICI,
  }),

  buildLine({
    id: 'qln-0331-a',
    quotationId: 'qtn-0331',
    version: 1,
    columnKey: 'hdfc-optima',
    label: 'HDFC Ergo Optima Secure',
    company: 'hdfc-ergo',
    product: 'HE-OPS',
    net: money(14_260),
    gst: money(2_566, 80),
    values: MEHTA_VALUES,
  }),
  buildLine({
    id: 'qln-0331-b',
    quotationId: 'qtn-0331',
    version: 1,
    columnKey: 'hdfc-restore',
    label: 'HDFC Ergo Optima Restore',
    company: 'hdfc-ergo',
    product: 'HE-OPR',
    net: money(13_180),
    gst: money(2_372, 40),
    values: MEHTA_VALUES,
  }),
  buildLine({
    id: 'qln-0331-c',
    quotationId: 'qtn-0331',
    version: 1,
    columnKey: 'bajaj-healthguard',
    label: 'Bajaj Allianz Health Guard',
    company: 'bajaj-allianz',
    product: 'BA-HGD',
    net: money(12_640),
    gst: money(2_275, 20),
    values: MEHTA_VALUES,
  }),

  // v1 of QTN-0332, archived. Locked and still readable, exactly as sent.
  buildLine({
    id: 'qln-0332-v1-a',
    quotationId: 'qtn-0332',
    version: 1,
    columnKey: 'tata-travel',
    label: 'Tata AIG Travel Guard',
    company: 'tata-aig',
    product: 'TA-TVG',
    net: money(4_100),
    gst: money(738),
    values: { 'sum-insured': 'USD 50,000' },
    locked: true,
  }),
  buildLine({
    id: 'qln-0332-v1-b',
    quotationId: 'qtn-0332',
    version: 1,
    columnKey: 'tata-medicare',
    label: 'Tata AIG MediCare Premier',
    company: 'tata-aig',
    product: 'TA-MCP',
    net: money(9_800),
    gst: money(1_764),
    values: { ...MEHTA_VALUES, 'sum-insured': '5,00,000' },
    locked: true,
  }),

  // v2, after the customer asked for a higher sum insured.
  buildLine({
    id: 'qln-0332-v2-a',
    quotationId: 'qtn-0332',
    version: 2,
    columnKey: 'tata-travel',
    label: 'Tata AIG Travel Guard',
    company: 'tata-aig',
    product: 'TA-TVG',
    net: money(4_100),
    gst: money(738),
    values: { 'sum-insured': 'USD 50,000' },
  }),
  buildLine({
    id: 'qln-0332-v2-b',
    quotationId: 'qtn-0332',
    version: 2,
    columnKey: 'tata-medicare',
    label: 'Tata AIG MediCare Premier',
    company: 'tata-aig',
    product: 'TA-MCP',
    net: money(11_700),
    gst: money(2_106),
    values: { ...MEHTA_VALUES, 'sum-insured': '10,00,000' },
  }),
]

/* --------------------------------------------------------------------- deals */

export const DEALS: readonly Deal[] = [
  {
    id: 'app-0774',
    systemNo: systemNo('deal', 774),
    status: 'line_items_set',
    quotationId: 'qtn-0332',
    customerId: 'cus-falguni-shah',
    ownerId: USER_IDS.nita,
    agentId: null,
    subAgentId: null,
    agencyId: 'agy-jagad-general',
    lineItems: [
      {
        id: 'dli-0774-a',
        companyId: companyId('tata-aig'),
        productId: productId('TA-TVG'),
        label: 'Tata AIG Travel Guard',
      },
      {
        id: 'dli-0774-b',
        companyId: companyId('tata-aig'),
        productId: productId('TA-MCP'),
        label: 'Tata AIG MediCare Premier',
      },
    ],
    createdAt: isoTime(addDays(NOW, -3)),
    consumedByPolicyId: null,
  },

  // Canvas 2.8's other half: a deal with nothing on it, so the block has
  // something to refuse. The refusal is the requirement, not the greyed button.
  {
    id: 'app-0775',
    systemNo: systemNo('deal', 775),
    status: 'created',
    quotationId: 'qtn-0332',
    customerId: 'cus-falguni-shah',
    ownerId: USER_IDS.nita,
    agentId: null,
    subAgentId: null,
    agencyId: null,
    lineItems: [],
    createdAt: isoTime(addDays(NOW, -1)),
    consumedByPolicyId: null,
  },
]

/* ------------------------------------------------------------------ policies */

type PolicySeed = {
  readonly id: string
  readonly systemNo: string
  readonly insurerNo?: string
  readonly customerId: string
  readonly company: string
  readonly product: string
  readonly agencyId: string
  readonly agentId?: string | null
  readonly status: Policy['status']
  readonly startDate?: string
  readonly expiryDate?: string
  readonly sumInsured?: Money
  readonly net?: Money
  readonly gst?: Money
  readonly premiumMode?: Policy['premiumMode']
  readonly paymentState?: Policy['paymentState']
  readonly memberIds?: readonly string[]
  readonly retentionClass?: string
  readonly schemaVersion?: number
  readonly nomineeAadhaarLast4?: string | null
}

function buildPolicy(seed: PolicySeed): Policy {
  const hasFigures = seed.net !== undefined && seed.gst !== undefined
  return {
    id: seed.id,
    systemNo: seed.systemNo,
    insurerNo: seed.insurerNo ?? null,
    customerId: seed.customerId,
    companyId: companyId(seed.company),
    productId: productId(seed.product),
    agencyId: seed.agencyId,
    agentId: seed.agentId === undefined ? AGENT_IDS.kiran : seed.agentId,
    subAgentId: null,
    status: seed.status,
    startDate: seed.startDate ?? null,
    expiryDate: seed.expiryDate ?? null,
    sumInsured: seed.sumInsured ?? null,
    netPremium: seed.net ?? null,
    gstAmount: seed.gst ?? null,
    finalPremium: hasFigures ? finalFrom(seed.net as Money, seed.gst as Money) : null,
    premiumMode: seed.premiumMode ?? 'annual',
    paymentState: seed.paymentState ?? 'unpaid',
    memberIds: seed.memberIds ?? [],
    retentionClass: seed.retentionClass ?? 'standard',
    schemaVersion: seed.schemaVersion ?? 2,
    proposerBankAccount: null,
    nomineeAadhaarLast4: seed.nomineeAadhaarLast4 ?? null,
    medicalReportSummary: null,
  }
}

export const POLICIES: readonly Policy[] = [
  // The prototype's floater, with the insurer's own number as it prints it.
  // Pinned to schema version 1: canvas 6.2's promise that an old record keeps
  // the schema it was captured under.
  buildPolicy({
    id: 'pol-4388',
    systemNo: systemNo('policy', 4388),
    insurerNo: '2825 1049 7731 00',
    customerId: 'cus-rakesh-patel',
    company: 'hdfc-ergo',
    product: 'HE-OPS',
    agencyId: 'agy-jagad-hdfc',
    status: 'issued',
    startDate: '2026-03-15',
    expiryDate: '2027-03-14',
    sumInsured: money(10_00_000),
    net: money(24_180),
    gst: money(4_352, 40),
    paymentState: 'verified',
    memberIds: ['mem-rakesh', 'mem-nita-patel', 'mem-aarav-patel', 'mem-kavya-patel'],
    retentionClass: 'health',
    schemaVersion: 1,
    nomineeAadhaarLast4: '6640',
  }),

  // Jayesh Kapadia: health, HDFC Ergo, monthly mode. The mandate failed and the
  // grace window closes on 8 September.
  buildPolicy({
    id: 'pol-4402',
    systemNo: systemNo('policy', 4402),
    insurerNo: '2825 1104 2291 00',
    customerId: 'cus-jayesh-kapadia',
    company: 'hdfc-ergo',
    product: 'HE-OPR',
    agencyId: 'agy-jagad-hdfc',
    agentId: null,
    status: 'issued',
    startDate: '2026-02-24',
    expiryDate: '2027-02-23',
    sumInsured: money(5_00_000),
    net: money(15_960),
    gst: money(2_872, 80),
    premiumMode: 'monthly',
    paymentState: 'part_paid',
    retentionClass: 'health',
  }),

  buildPolicy({
    id: 'pol-4419',
    systemNo: systemNo('policy', 4419),
    insurerNo: '8811 4477 0021',
    customerId: 'cus-rakesh-patel',
    company: 'lic',
    product: 'LC-JVA',
    agencyId: 'agy-jagad-lic',
    status: 'issued',
    startDate: '2026-04-01',
    expiryDate: '2046-03-31',
    sumInsured: money(25_00_000),
    net: money(48_000),
    gst: money(2_160),
    premiumMode: 'quarterly',
    paymentState: 'collected',
  }),

  // The second vehicle in the Patel household is uninsured; this is the one that
  // is covered, and the gap the coverage notice reads.
  buildPolicy({
    id: 'pol-4425',
    systemNo: systemNo('policy', 4425),
    insurerNo: 'OG-27-2601-1811-00004402',
    customerId: 'cus-rakesh-patel',
    company: 'bajaj-allianz',
    product: 'BA-MPK',
    agencyId: 'agy-jagad-motor',
    status: 'issued',
    startDate: '2026-05-20',
    expiryDate: '2027-05-19',
    sumInsured: money(6_40_000),
    net: money(9_120),
    gst: money(1_641, 60),
    paymentState: 'verified',
    retentionClass: 'motor',
  }),

  buildPolicy({
    id: 'pol-4431',
    systemNo: systemNo('policy', 4431),
    insurerNo: 'IT-HLT-2026-441902',
    customerId: 'cus-nilesh-bhatt',
    company: 'iffco-tokio',
    product: 'IT-FHP',
    agencyId: 'agy-jagad-motor',
    status: 'issued',
    startDate: '2025-08-31',
    expiryDate: '2026-08-30',
    sumInsured: money(7_50_000),
    net: money(18_400),
    gst: money(3_312),
    paymentState: 'verified',
    retentionClass: 'health',
  }),

  buildPolicy({
    id: 'pol-4437',
    systemNo: systemNo('policy', 4437),
    insurerNo: 'OG-26-2601-1801-00007731',
    customerId: 'cus-bhavesh-trivedi',
    company: 'bajaj-allianz',
    product: 'BA-MPK',
    agencyId: 'agy-jagad-motor',
    agentId: null,
    status: 'issued',
    startDate: '2025-08-29',
    expiryDate: '2026-08-28',
    sumInsured: money(4_80_000),
    net: money(7_640),
    gst: money(1_375, 20),
    paymentState: 'verified',
    retentionClass: 'motor',
  }),

  buildPolicy({
    id: 'pol-4441',
    systemNo: systemNo('policy', 4441),
    insurerNo: 'TA-HLT-0092214',
    customerId: 'cus-falguni-shah',
    company: 'tata-aig',
    product: 'TA-MCP',
    agencyId: 'agy-jagad-general',
    agentId: null,
    status: 'issued',
    startDate: '2025-09-01',
    expiryDate: '2026-08-31',
    sumInsured: money(5_00_000),
    net: money(9_800),
    gst: money(1_764),
    paymentState: 'verified',
    retentionClass: 'health',
  }),

  buildPolicy({
    id: 'pol-4443',
    systemNo: systemNo('policy', 4443),
    insurerNo: 'TA-TRV-0331808',
    customerId: 'cus-falguni-shah',
    company: 'tata-aig',
    product: 'TA-TVG',
    agencyId: 'agy-jagad-general',
    agentId: null,
    status: 'issued',
    startDate: '2026-06-13',
    expiryDate: '2026-09-12',
    sumInsured: money(41_00_000),
    net: money(4_100),
    gst: money(738),
    paymentState: 'verified',
  }),

  // Lapsed, so canvas 4.2's "blocked with a clear message" has a policy to be
  // blocked against.
  buildPolicy({
    id: 'pol-4377',
    systemNo: systemNo('policy', 4377),
    insurerNo: 'RS-HLT-7712004',
    customerId: 'cus-falguni-shah',
    company: 'royal-sundaram',
    product: 'RS-LLS',
    agencyId: 'agy-jagad-motor',
    agentId: null,
    status: 'lapsed',
    startDate: '2024-07-01',
    expiryDate: '2025-06-30',
    sumInsured: money(3_00_000),
    net: money(8_200),
    gst: money(1_476),
    paymentState: 'unpaid',
    retentionClass: 'health',
  }),

  /* Drafts and proposals — canvas 3.6 and 3.7. */

  buildPolicy({
    id: 'pol-draft-0219',
    systemNo: systemNo('policyDraft', 219),
    customerId: 'cus-falguni-shah',
    company: 'tata-aig',
    product: 'TA-TVG',
    agencyId: 'agy-jagad-general',
    agentId: null,
    status: 'draft',
    premiumMode: 'annual',
  }),
  buildPolicy({
    id: 'pol-draft-0224',
    systemNo: systemNo('policyDraft', 224),
    customerId: 'cus-hitesh-mehta',
    company: 'hdfc-ergo',
    product: 'HE-OPS',
    agencyId: 'agy-jagad-hdfc',
    agentId: null,
    status: 'sent',
    startDate: '2026-09-01',
    expiryDate: '2027-08-31',
    sumInsured: money(5_00_000),
  }),
  buildPolicy({
    id: 'pol-draft-0227',
    systemNo: systemNo('policyDraft', 227),
    customerId: 'cus-dipika-shah',
    company: 'niva-bupa',
    product: 'NB-HCP',
    agencyId: 'agy-jagad-general',
    status: 'proposal',
    sumInsured: money(5_00_000),
  }),
  buildPolicy({
    id: 'pol-draft-0230',
    systemNo: systemNo('policyDraft', 230),
    customerId: 'cus-nilesh-bhatt',
    company: 'iffco-tokio',
    product: 'IT-FHP',
    agencyId: 'agy-jagad-motor',
    status: 'draft',
  }),
  buildPolicy({
    id: 'pol-draft-0231',
    systemNo: systemNo('policyDraft', 231),
    customerId: 'cus-bhavesh-trivedi',
    company: 'royal-sundaram',
    product: 'RS-CSH',
    agencyId: 'agy-jagad-motor',
    agentId: null,
    status: 'draft',
    retentionClass: 'motor',
  }),
  buildPolicy({
    id: 'pol-draft-0233',
    systemNo: systemNo('policyDraft', 233),
    customerId: 'cus-hitesh-mehta',
    company: 'bajaj-allianz',
    product: 'BA-HGD',
    agencyId: 'agy-jagad-general',
    agentId: null,
    status: 'draft',
  }),
]

export const POLICY_VERSIONS: readonly PolicyVersion[] = [
  {
    id: 'pvr-4388-1',
    policyId: 'pol-4388',
    version: 1,
    effectiveFrom: '2026-03-15',
    documentId: 'doc-pol-4388',
    endorsementNo: null,
    insurerEndorsementNo: null,
    note: 'Issued as proposed.',
    createdAt: isoTime(new Date('2026-03-15T06:00:00.000Z')),
  },
  {
    id: 'pvr-4402-1',
    policyId: 'pol-4402',
    version: 1,
    effectiveFrom: '2026-02-24',
    documentId: null,
    endorsementNo: null,
    insurerEndorsementNo: null,
    note: 'Issued on a monthly premium schedule.',
    createdAt: isoTime(new Date('2026-02-24T06:00:00.000Z')),
  },
]

/**
 * Canvas 3.7 — the entries themselves. What is missing is a list a queue can
 * sort on, not a shrug on a form.
 */
export const POLICY_DRAFTS: readonly PolicyEntryDraft[] = [
  {
    id: 'ped-0219',
    policyId: 'pol-draft-0219',
    dealId: 'app-0774',
    entryPath: 'proposal',
    formSchemaId: 'frm-policy-entry-v2',
    schemaVersion: 2,
    missingFields: ['nomineeName', 'nomineeRelationship', 'sumInsured', 'finalPremium'],
    savedBy: USER_IDS.priya,
    savedAt: isoTime(addDays(NOW, -2)),
  },
  {
    id: 'ped-0224',
    policyId: 'pol-draft-0224',
    dealId: null,
    entryPath: 'proposal',
    formSchemaId: 'frm-policy-entry-optima',
    schemaVersion: 1,
    missingFields: ['finalPremium'],
    savedBy: USER_IDS.priya,
    savedAt: isoTime(addDays(NOW, -1)),
  },
  {
    id: 'ped-0227',
    policyId: 'pol-draft-0227',
    dealId: null,
    entryPath: 'proposal',
    formSchemaId: 'frm-policy-entry-v2',
    schemaVersion: 2,
    missingFields: ['finalPremium', 'startDate', 'expiryDate'],
    savedBy: USER_IDS.priya,
    savedAt: isoTime(addDays(NOW, -1)),
  },
  {
    // The direct-entry path: the insurer has already issued this one, so there is
    // no proposal to raise and §9 says the draft skips straight to issued.
    id: 'ped-0230',
    policyId: 'pol-draft-0230',
    dealId: null,
    entryPath: 'direct',
    formSchemaId: 'frm-policy-entry-v2',
    schemaVersion: 2,
    missingFields: ['finalPremium', 'insurerNo'],
    savedBy: USER_IDS.priya,
    savedAt: isoTime(addDays(NOW, -4)),
  },
  {
    id: 'ped-0231',
    policyId: 'pol-draft-0231',
    dealId: null,
    entryPath: 'direct',
    formSchemaId: 'frm-policy-entry-v2',
    schemaVersion: 2,
    missingFields: ['sumInsured', 'startDate', 'expiryDate', 'finalPremium', 'nomineeName'],
    savedBy: USER_IDS.nita,
    savedAt: isoTime(addDays(NOW, -6)),
  },
  {
    id: 'ped-0233',
    policyId: 'pol-draft-0233',
    dealId: null,
    entryPath: 'proposal',
    formSchemaId: 'frm-policy-entry-v2',
    schemaVersion: 2,
    missingFields: ['sumInsured', 'finalPremium'],
    savedBy: USER_IDS.priya,
    savedAt: isoTime(addDays(NOW, -0.5)),
  },
]

/* -------------------------------------------------- schedules and instalments */

const JAYESH_INSTALMENT = money(1_570)
const RAKESH_LIC_INSTALMENT = money(12_540)

export const PREMIUM_SCHEDULES: readonly PremiumSchedule[] = [
  {
    id: 'sch-4402',
    policyId: 'pol-4402',
    state: 'active',
    mode: 'monthly',
    // Typed from the insurer's own schedule. Not the annual figure divided by 12,
    // and the source field says so.
    instalmentAmount: JAYESH_INSTALMENT,
    instalmentAmountSource: 'typed_from_insurer',
    instalmentCount: 12,
    debitDay: 24,
    graceDays: 15,
    startDate: '2026-02-24',
    createdAt: isoTime(new Date('2026-02-24T06:10:00.000Z')),
    supersededByScheduleId: null,
  },
  {
    id: 'sch-4419',
    policyId: 'pol-4419',
    state: 'active',
    mode: 'quarterly',
    instalmentAmount: RAKESH_LIC_INSTALMENT,
    instalmentAmountSource: 'typed_from_insurer',
    instalmentCount: 4,
    debitDay: 1,
    graceDays: 30,
    startDate: '2026-04-01',
    createdAt: isoTime(new Date('2026-04-01T06:10:00.000Z')),
    supersededByScheduleId: null,
  },
]

function jayeshInstalments(): InstalmentDue[] {
  const start = new Date('2026-02-24T00:00:00.000Z')
  return Array.from({ length: 12 }, (_, index) => {
    const dueDate = addMonths(start, index)
    // Six settled, the seventh sitting in grace after the mandate failure, the
    // rest still scheduled. The grace window closes on 8 September.
    const state: InstalmentDue['state'] =
      index < 6 ? 'paid' : index === 6 ? 'in_grace' : 'scheduled'
    return {
      id: `ins-4402-${String(index + 1).padStart(2, '0')}`,
      scheduleId: 'sch-4402',
      policyId: 'pol-4402',
      sequence: index + 1,
      dueDate: isoDate(dueDate),
      amount: JAYESH_INSTALMENT,
      state,
      collectionRecordId: index === 0 ? 'col-0003' : null,
      paidAt: state === 'paid' ? isoTime(addDays(dueDate, 1)) : null,
    }
  })
}

function rakeshLicInstalments(): InstalmentDue[] {
  const start = new Date('2026-04-01T00:00:00.000Z')
  return Array.from({ length: 4 }, (_, index) => {
    const dueDate = addMonths(start, index * 3)
    const state: InstalmentDue['state'] = index < 2 ? 'paid' : 'scheduled'
    return {
      id: `ins-4419-${String(index + 1).padStart(2, '0')}`,
      scheduleId: 'sch-4419',
      policyId: 'pol-4419',
      sequence: index + 1,
      dueDate: isoDate(dueDate),
      amount: RAKESH_LIC_INSTALMENT,
      state,
      collectionRecordId: null,
      paidAt: state === 'paid' ? isoTime(addDays(dueDate, 2)) : null,
    }
  })
}

export const INSTALMENTS: readonly InstalmentDue[] = [
  ...jayeshInstalments(),
  ...rakeshLicInstalments(),
]

export const MANDATES: readonly Mandate[] = [
  {
    id: 'mnd-4402',
    policyId: 'pol-4402',
    customerId: 'cus-jayesh-kapadia',
    kind: 'enach',
    reference: 'ENACH-HE-4402-8827',
    bankName: 'Bank of Baroda',
    debitDay: 24,
    validFrom: '2026-02-24',
    validUntil: '2027-02-23',
    state: 'debit_failed',
    registeredBy: USER_IDS.priya,
    registeredAt: isoTime(new Date('2026-02-24T06:20:00.000Z')),
  },
]

export const MANDATE_EVENTS: readonly MandateEvent[] = [
  {
    id: 'mev-4402-06',
    mandateId: 'mnd-4402',
    occurredAt: isoTime(new Date('2026-07-24T04:00:00.000Z')),
    outcome: 'success',
    reference: 'PRES-4402-0724',
    failureReason: null,
  },
  {
    id: 'mev-4402-07',
    mandateId: 'mnd-4402',
    occurredAt: isoTime(new Date('2026-08-24T04:00:00.000Z')),
    outcome: 'failure',
    reference: 'PRES-4402-0824',
    failureReason: 'Bank reported insufficient funds on presentation.',
  },
]

/* --------------------------------------------------------------- collections */

export const COLLECTIONS: readonly CollectionRecord[] = [
  // Canvas 3.4 and 3.5 — an on-field cheque, recorded and waiting on back-office
  // verification. A bounce can be recorded from here.
  {
    id: 'col-0001',
    policyId: 'pol-4388',
    customerId: 'cus-rakesh-patel',
    agencyId: 'agy-jagad-hdfc',
    state: 'recorded',
    route: 'via_agency',
    instrument: 'cheque',
    mode: 'on_field',
    amount: money(28_532, 40),
    reference: 'CHQ-114892',
    collectedBy: USER_IDS.kiran,
    collectedAt: isoTime(addDays(NOW, -2)),
    verifiedBy: null,
    verifiedAt: null,
    bounceReason: null,
    instalmentId: null,
  },

  // Canvas 3.3 — the customer intends to pay the company directly. Nothing is
  // recorded yet, and no amount is defaulted for them.
  {
    id: 'col-0002',
    policyId: 'pol-draft-0224',
    customerId: 'cus-hitesh-mehta',
    agencyId: null,
    state: 'pending',
    route: 'direct_to_company',
    instrument: 'online',
    mode: 'back_office',
    amount: null,
    reference: null,
    collectedBy: null,
    collectedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    bounceReason: null,
    instalmentId: null,
  },

  {
    id: 'col-0003',
    policyId: 'pol-4402',
    customerId: 'cus-jayesh-kapadia',
    agencyId: 'agy-jagad-hdfc',
    state: 'closed',
    route: 'via_agency',
    instrument: 'mandate',
    mode: 'back_office',
    amount: JAYESH_INSTALMENT,
    reference: 'PRES-4402-0224',
    collectedBy: USER_IDS.priya,
    collectedAt: isoTime(new Date('2026-02-25T05:00:00.000Z')),
    verifiedBy: USER_IDS.priya,
    verifiedAt: isoTime(new Date('2026-02-25T05:30:00.000Z')),
    bounceReason: null,
    instalmentId: 'ins-4402-01',
  },
]

/* ----------------------------------------------------------------- documents */

export const DOCUMENTS: readonly DocumentRecord[] = [
  {
    id: 'doc-aadhaar-rakesh',
    systemNo: localNo('DOC', 1),
    subjectEntity: 'Customer',
    subjectId: 'cus-rakesh-patel',
    docType: 'aadhaar',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -12)),
    verifiedAt: isoTime(addDays(NOW, -11)),
    verifiedBy: USER_IDS.priya,
    reviewState: 'verified',
    retentionClass: 'standard',
    isPresent: true,
    uploadedByName: 'Rakesh Patel',
    fileName: 'aadhaar-front.jpg',
    fileUrl: 'mock://documents/aadhaar-rakesh.jpg',
    mimeType: 'image/jpeg',
    extractedText: null,
    // Masked at extraction, per §9. The full number never reaches storage.
    ocrFields: [{ name: 'aadhaarLast4', value: '4102', confirmed: true }],
  },
  {
    id: 'doc-pan-rakesh',
    systemNo: localNo('DOC', 2),
    subjectEntity: 'Customer',
    subjectId: 'cus-rakesh-patel',
    docType: 'pan',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -12)),
    verifiedAt: null,
    verifiedBy: null,
    reviewState: 'submitted',
    retentionClass: 'standard',
    isPresent: true,
    uploadedByName: 'Rakesh Patel',
    fileName: 'pan-card.jpg',
    fileUrl: 'mock://documents/pan-rakesh.jpg',
    mimeType: 'image/jpeg',
    extractedText: null,
    ocrFields: [{ name: 'panNumber', value: 'ABCPP1234K', confirmed: false }],
  },
  {
    // Canvas 3.6 — the insurer's policy PDF, OCR run, nothing confirmed yet. The
    // form holding these cannot submit until a person has looked at each one.
    id: 'doc-pol-draft-0224',
    systemNo: localNo('DOC', 3),
    subjectEntity: 'Policy',
    subjectId: 'pol-draft-0224',
    docType: 'policy_pdf',
    version: 1,
    submittedAt: isoTime(addDays(NOW, -1)),
    verifiedAt: null,
    verifiedBy: null,
    reviewState: 'submitted',
    retentionClass: 'health',
    isPresent: true,
    uploadedByName: 'Priya Desai',
    fileName: 'HE-OPS-policy-schedule.pdf',
    fileUrl: 'mock://documents/pol-draft-0224.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [
      { name: 'insurerNo', value: '2825 1188 4410 00', confirmed: false },
      { name: 'startDate', value: '2026-09-01', confirmed: false },
      { name: 'expiryDate', value: '2027-08-31', confirmed: false },
      { name: 'finalPremium', value: '16,826.80', confirmed: false },
    ],
  },
  {
    id: 'doc-pol-4388',
    systemNo: localNo('DOC', 4),
    subjectEntity: 'Policy',
    subjectId: 'pol-4388',
    docType: 'policy_pdf',
    version: 1,
    submittedAt: isoTime(new Date('2026-03-15T07:00:00.000Z')),
    verifiedAt: isoTime(new Date('2026-03-15T08:00:00.000Z')),
    verifiedBy: USER_IDS.priya,
    reviewState: 'verified',
    retentionClass: 'health',
    isPresent: true,
    uploadedByName: 'Priya Desai',
    fileName: 'optima-secure-policy-schedule.pdf',
    fileUrl: 'mock://documents/pol-4388.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [],
  },
  {
    id: 'doc-qtn-0332',
    systemNo: localNo('DOC', 5),
    subjectEntity: 'Quotation',
    subjectId: 'qtn-0332',
    docType: 'quotation_pdf',
    version: 2,
    submittedAt: isoTime(addDays(NOW, -4)),
    verifiedAt: null,
    verifiedBy: null,
    reviewState: 'submitted',
    retentionClass: 'standard',
    isPresent: true,
    uploadedByName: 'Nita Shah',
    fileName: 'QTN-0332-v2.pdf',
    fileUrl: 'mock://documents/qtn-0332-v2.pdf',
    mimeType: 'application/pdf',
    extractedText: null,
    ocrFields: [],
  },
  {
    id: 'doc-clm-0412',
    systemNo: localNo('DOC', 6),
    subjectEntity: 'Claim',
    subjectId: 'clm-0412',
    docType: 'discharge_summary',
    version: 1,
    submittedAt: null,
    verifiedAt: null,
    verifiedBy: null,
    reviewState: 'awaiting',
    retentionClass: 'claims',
    isPresent: false,
    uploadedByName: null,
    fileName: null,
    fileUrl: null,
    mimeType: null,
    extractedText: null,
    ocrFields: [],
  },
]

/* -------------------------------------------------------------------- claims */

/** The company checklist a file claim is worked against, per the config seed. */
const CLAIM_CHECKLIST: readonly string[] = [
  'Claim form',
  'Discharge summary',
  'Hospital final bill',
  'Investigation reports',
  'Cancelled cheque leaf',
]

type ClaimSeed = {
  readonly sequence: number
  readonly id: string
  readonly policyId: string
  readonly customerId: string
  readonly claimType: Claim['claimType']
  readonly state: Claim['state']
  readonly ownerId?: string | null
  readonly raisedDaysAgo: number
  readonly settledNet?: Money
  readonly deduction?: Money
  readonly companyRemark?: string | null
  readonly documentIds?: readonly string[]
  readonly checklistItems?: readonly string[]
  readonly documentsCollected?: readonly string[]
}

function buildClaim(seed: ClaimSeed): Claim {
  return {
    id: seed.id,
    systemNo: systemNo('claim', seed.sequence),
    insurerNo: null,
    policyId: seed.policyId,
    customerId: seed.customerId,
    memberId: null,
    claimType: seed.claimType,
    state: seed.state,
    ownerId: seed.ownerId === undefined ? USER_IDS.amit : seed.ownerId,
    agentId: AGENT_IDS.kiran,
    raisedAt: isoTime(addDays(NOW, -seed.raisedDaysAgo)),
    intimatedAt:
      seed.state === 'raised' || seed.state === 'blocked'
        ? null
        : isoTime(addDays(NOW, -seed.raisedDaysAgo + 1)),
    settlement: {
      amount: seed.settledNet ?? null,
      deduction: seed.deduction ?? null,
      source: seed.settledNet ? 'insurer_advice' : null,
      insurerAdviceRef: seed.settledNet ? `ADV-${seed.sequence}` : null,
    },
    companyRemark: seed.companyRemark ?? null,
    documentIds: seed.documentIds ?? [],
    checklistItems: seed.checklistItems ?? [],
    documentsCollected: seed.documentsCollected ?? [],
  }
}

export const CLAIMS: readonly Claim[] = [
  buildClaim({
    sequence: 398,
    id: 'clm-0398',
    policyId: 'pol-4441',
    customerId: 'cus-falguni-shah',
    claimType: 'file',
    state: 'closed',
    raisedDaysAgo: 120,
    settledNet: money(64_500),
    deduction: money(8_200),
    companyRemark: 'Settled as per policy terms after standard deductions.',
    checklistItems: CLAIM_CHECKLIST,
    documentsCollected: CLAIM_CHECKLIST,
  }),
  buildClaim({
    sequence: 402,
    id: 'clm-0402',
    policyId: 'pol-4388',
    customerId: 'cus-rakesh-patel',
    claimType: 'file',
    state: 'checklist_raised',
    raisedDaysAgo: 22,
    checklistItems: CLAIM_CHECKLIST,
    documentsCollected: ['Claim form'],
  }),
  buildClaim({
    sequence: 411,
    id: 'clm-0411',
    policyId: 'pol-4431',
    customerId: 'cus-nilesh-bhatt',
    claimType: 'file',
    state: 'intimated',
    raisedDaysAgo: 14,
  }),
  buildClaim({
    // The prototype's cashless claim: the tokenised upload link has gone out and
    // the discharge summary has not come back yet.
    sequence: 412,
    id: 'clm-0412',
    policyId: 'pol-4388',
    customerId: 'cus-rakesh-patel',
    claimType: 'cashless',
    state: 'upload_link_sent',
    raisedDaysAgo: 9,
    documentIds: ['doc-clm-0412'],
  }),
  buildClaim({
    sequence: 414,
    id: 'clm-0414',
    policyId: 'pol-4377',
    customerId: 'cus-falguni-shah',
    claimType: 'file',
    // Raised against a lapsed policy: canvas 4.2 walks from here, and the
    // validation refuses with a sentence rather than a greyed button.
    state: 'raised',
    ownerId: null,
    raisedDaysAgo: 8,
  }),
  buildClaim({
    sequence: 416,
    id: 'clm-0416',
    policyId: 'pol-4425',
    customerId: 'cus-rakesh-patel',
    claimType: 'file',
    state: 'picked_up',
    raisedDaysAgo: 6,
  }),
  buildClaim({
    sequence: 417,
    id: 'clm-0417',
    policyId: 'pol-4402',
    customerId: 'cus-jayesh-kapadia',
    claimType: 'file',
    state: 'query_open',
    raisedDaysAgo: 5,
    companyRemark: 'Insurer asked for the treating consultant note before proceeding.',
    checklistItems: CLAIM_CHECKLIST,
    documentsCollected: CLAIM_CHECKLIST,
  }),
  buildClaim({
    sequence: 418,
    id: 'clm-0418',
    policyId: 'pol-4437',
    customerId: 'cus-bhavesh-trivedi',
    claimType: 'file',
    state: 'settlement_recorded',
    raisedDaysAgo: 4,
    settledNet: money(31_800),
    deduction: money(2_500),
    checklistItems: CLAIM_CHECKLIST,
    documentsCollected: CLAIM_CHECKLIST,
  }),
  buildClaim({
    sequence: 419,
    id: 'clm-0419',
    policyId: 'pol-4443',
    customerId: 'cus-falguni-shah',
    claimType: 'file',
    state: 'raised',
    ownerId: null,
    raisedDaysAgo: 1,
  }),
]

/* ------------------------------------------------------- renewals and tasks */

type RenewalSeed = {
  readonly id: string
  readonly policyId: string
  readonly customerId: string
  readonly expiryDate: string
  readonly state: RenewalTask['state']
  readonly assigneeId?: string | null
  readonly remindersSent?: number
}

const RENEWAL_LEAD_DAYS = 45

function buildRenewal(seed: RenewalSeed): RenewalTask {
  const expiry = new Date(`${seed.expiryDate}T00:00:00.000Z`)
  return {
    id: seed.id,
    policyId: seed.policyId,
    customerId: seed.customerId,
    state: seed.state,
    dueOn: isoDate(addDays(expiry, -RENEWAL_LEAD_DAYS)),
    expiryDate: seed.expiryDate,
    assigneeId: seed.assigneeId ?? null,
    remindersSent: seed.remindersSent ?? 0,
    lastReminderAt: (seed.remindersSent ?? 0) > 0 ? isoTime(addDays(NOW, -3)) : null,
    lapseReason: null,
    createdAt: isoTime(addDays(NOW, -30)),
  }
}

export const RENEWAL_TASKS: readonly RenewalTask[] = [
  buildRenewal({
    id: 'rnw-4431',
    policyId: 'pol-4431',
    customerId: 'cus-nilesh-bhatt',
    expiryDate: '2026-08-30',
    state: 'reminded',
    assigneeId: USER_IDS.sneha,
    remindersSent: 2,
  }),
  buildRenewal({
    id: 'rnw-4437',
    policyId: 'pol-4437',
    customerId: 'cus-bhavesh-trivedi',
    expiryDate: '2026-08-28',
    state: 'assigned',
    assigneeId: USER_IDS.sneha,
  }),
  buildRenewal({
    id: 'rnw-4441',
    policyId: 'pol-4441',
    customerId: 'cus-falguni-shah',
    expiryDate: '2026-08-31',
    state: 'in_pool',
  }),
  buildRenewal({
    id: 'rnw-4443',
    policyId: 'pol-4443',
    customerId: 'cus-falguni-shah',
    expiryDate: '2026-09-12',
    state: 'in_pool',
  }),
  buildRenewal({
    id: 'rnw-4402',
    policyId: 'pol-4402',
    customerId: 'cus-jayesh-kapadia',
    expiryDate: '2027-02-23',
    state: 'scheduled',
  }),
  buildRenewal({
    id: 'rnw-4377',
    policyId: 'pol-4377',
    customerId: 'cus-falguni-shah',
    expiryDate: '2025-06-30',
    state: 'win_back_list',
  }),
]

export const TASKS: readonly Task[] = [
  {
    id: 'tsk-0001',
    systemNo: systemNo('task', 1),
    kind: 'mandate_failure',
    title: 'Jayesh Kapadia - mandate failed, grace closes 8 September',
    subjectEntity: 'Policy',
    subjectId: 'pol-4402',
    ownerId: USER_IDS.priya,
    teamId: TEAM_IDS.backOffice,
    agentId: null,
    state: 'open',
    priority: 'urgent',
    dueAt: isoTime(new Date('2026-08-24T12:00:00.000Z')),
    createdAt: isoTime(new Date('2026-08-24T04:05:00.000Z')),
    completedAt: null,
    raisedBy: 'mandate.failureFollowUp',
  },
  {
    id: 'tsk-0002',
    systemNo: systemNo('task', 2),
    kind: 'kyc_chase',
    title: 'Rakesh Patel - consent link sent, no response yet',
    subjectEntity: 'Customer',
    subjectId: 'cus-rakesh-patel',
    ownerId: USER_IDS.priya,
    teamId: TEAM_IDS.backOffice,
    agentId: AGENT_IDS.kiran,
    state: 'open',
    priority: 'high',
    dueAt: isoTime(addDays(NOW, 1)),
    createdAt: isoTime(addDays(NOW, -2)),
    completedAt: null,
    raisedBy: USER_IDS.priya,
  },
  {
    id: 'tsk-0003',
    systemNo: systemNo('task', 3),
    kind: 'policy_entry',
    title: 'POL-DRAFT-0219 - finish the entry for Falguni Shah',
    subjectEntity: 'Policy',
    subjectId: 'pol-draft-0219',
    ownerId: USER_IDS.priya,
    teamId: TEAM_IDS.backOffice,
    agentId: null,
    state: 'in_progress',
    priority: 'normal',
    dueAt: isoTime(addDays(NOW, 2)),
    createdAt: isoTime(addDays(NOW, -2)),
    completedAt: null,
    raisedBy: USER_IDS.priya,
  },
  {
    id: 'tsk-0004',
    systemNo: systemNo('task', 4),
    kind: 'claim_pickup',
    title: 'CLM-0402 - collect the discharge papers from the Patel household',
    subjectEntity: 'Claim',
    subjectId: 'clm-0402',
    ownerId: USER_IDS.amit,
    teamId: TEAM_IDS.claims,
    agentId: AGENT_IDS.kiran,
    state: 'open',
    priority: 'high',
    dueAt: isoTime(addDays(NOW, 1)),
    createdAt: isoTime(addDays(NOW, -3)),
    completedAt: null,
    raisedBy: USER_IDS.amit,
  },
  {
    id: 'tsk-0005',
    systemNo: systemNo('task', 5),
    kind: 'renewal_call',
    title: 'Nilesh Bhatt - renewal call before 30 August',
    subjectEntity: 'Policy',
    subjectId: 'pol-4431',
    ownerId: USER_IDS.sneha,
    teamId: TEAM_IDS.renewals,
    agentId: AGENT_IDS.kiran,
    state: 'open',
    priority: 'urgent',
    dueAt: isoTime(addDays(NOW, 2)),
    createdAt: isoTime(addDays(NOW, -10)),
    completedAt: null,
    raisedBy: 'renewal.schedule',
  },
]

/* ------------------------------------------------------- messages and ledger */

export const MESSAGE_LOGS: readonly MessageLog[] = [
  {
    id: 'msg-0001',
    templateKey: 'inquiry.assigned',
    channel: 'whatsapp',
    toName: 'Kiran Solanki',
    toAddress: '9825010003',
    subjectEntity: 'Inquiry',
    subjectId: 'inq-1045',
    sentAt: isoTime(addMinutes(NOW, -35)),
    state: 'sent',
  },
  {
    id: 'msg-0002',
    templateKey: 'quotation.shared',
    channel: 'whatsapp',
    toName: 'Hitesh Mehta',
    toAddress: '9825110006',
    subjectEntity: 'Quotation',
    subjectId: 'qtn-0331',
    sentAt: isoTime(addDays(NOW, -6)),
    state: 'sent',
  },
  {
    id: 'msg-0003',
    templateKey: 'credentials.issued',
    channel: 'whatsapp',
    toName: 'Jayesh Kapadia',
    toAddress: '9825110002',
    subjectEntity: 'Customer',
    subjectId: 'cus-jayesh-kapadia',
    sentAt: isoTime(addDays(NOW, -298)),
    state: 'sent',
  },
  {
    id: 'msg-0004',
    templateKey: 'policy.issued',
    channel: 'whatsapp',
    toName: 'Rakesh Patel',
    toAddress: '9825110001',
    subjectEntity: 'Policy',
    subjectId: 'pol-4388',
    sentAt: isoTime(new Date('2026-03-15T08:15:00.000Z')),
    state: 'sent',
  },
  {
    id: 'msg-0005',
    templateKey: 'renewal.reminder',
    channel: 'whatsapp',
    toName: 'Nilesh Bhatt',
    toAddress: '9825110003',
    subjectEntity: 'Policy',
    subjectId: 'pol-4431',
    sentAt: isoTime(addDays(NOW, -3)),
    state: 'sent',
  },
  {
    id: 'msg-0006',
    templateKey: 'mandate.failed',
    channel: 'whatsapp',
    toName: 'Jayesh Kapadia',
    toAddress: '9825110002',
    subjectEntity: 'Policy',
    subjectId: 'pol-4402',
    sentAt: isoTime(new Date('2026-08-24T04:10:00.000Z')),
    state: 'sent',
  },
]

export const LEDGER_ENTRIES: readonly LedgerEntry[] = [
  {
    id: 'lgr-4388',
    policyId: 'pol-4388',
    agencyId: 'agy-jagad-hdfc',
    agentId: AGENT_IDS.kiran,
    subAgentId: null,
    kind: 'commission_booked',
    amount: money(3_627),
    bookedAt: isoTime(new Date('2026-03-20T05:00:00.000Z')),
    bookedBy: USER_IDS.vivek,
    note: 'Booked from the HDFC Ergo statement for March.',
  },
  {
    id: 'lgr-4419',
    policyId: 'pol-4419',
    agencyId: 'agy-jagad-lic',
    agentId: AGENT_IDS.kiran,
    subAgentId: null,
    kind: 'commission_booked',
    amount: money(12_000),
    bookedAt: isoTime(new Date('2026-04-08T05:00:00.000Z')),
    bookedBy: USER_IDS.vivek,
    note: 'First-year commission per the LIC statement.',
  },
  {
    id: 'lgr-4425',
    policyId: 'pol-4425',
    agencyId: 'agy-jagad-motor',
    agentId: AGENT_IDS.kiran,
    subAgentId: null,
    kind: 'commission_booked',
    amount: money(912),
    bookedAt: isoTime(new Date('2026-05-28T05:00:00.000Z')),
    bookedBy: USER_IDS.vivek,
    note: 'Booked from the Bajaj Allianz statement for May.',
  },
]

/** The agencies the story cast actually places through, for the integrity test. */
export const STORY_AGENCY_IDS: readonly Agency['id'][] = [
  'agy-jagad-hdfc',
  'agy-jagad-lic',
  'agy-jagad-general',
  'agy-jagad-motor',
]
