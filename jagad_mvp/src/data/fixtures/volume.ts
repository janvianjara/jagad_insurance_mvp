/**
 * The volume set — plan §8, "~300 customers, ~500 policies, ~800 tasks".
 *
 * Its job is not to look real. Its job is to make U12's speed budgets measurable
 * and to expose the need for table virtualisation early, before fifteen screens
 * have been built against a forty-row fixture. So it is generated, and it is
 * generated from the seeded PRNG only: the same seed produces the same ids, the
 * same names and the same dates on every run, which is what lets the determinism
 * test be a test rather than a hope.
 *
 * On money, one thing is deliberate and worth stating. Premiums are not
 * generated. They are drawn from a table of figures written into this file by a
 * person, exactly as an insurer's quote is typed into the platform, and the
 * only arithmetic performed on them is Final = Net + GST. Nothing here divides,
 * multiplies or estimates an amount — a generator that priced insurance would be
 * the same D3 violation as a screen that did.
 */

import { addMoney, money } from '../../domain/money'
import type { Money } from '../../domain/money'
import type { Customer } from '../repo/customers'
import type { InsuranceLine } from '../repo/companies'
import type { Policy } from '../repo/policies'
import type { Task } from '../repo/tasks'
import { AGENCIES, AGENT_IDS, PRODUCTS, TEAM_IDS, USER_IDS } from './config-seed'
import { addDays, isoDate, isoTime } from './clock'
import { systemNo, volumeId } from './ids'
import { createPrng } from './prng'
import type { Prng } from './prng'

export type VolumeCounts = {
  readonly customers: number
  readonly policies: number
  readonly tasks: number
}

export const DEFAULT_VOLUME: VolumeCounts = { customers: 300, policies: 500, tasks: 800 }

/** Where the generated numbering starts, so it never collides with the story cast. */
const CUSTOMER_SEQUENCE_START = 100
const POLICY_SEQUENCE_START = 5000
const TASK_SEQUENCE_START = 100

const FIRST_NAMES = [
  'Amit', 'Anjali', 'Ashish', 'Bhavna', 'Chirag', 'Darshan', 'Dhara', 'Dhruv',
  'Foram', 'Gaurav', 'Harsh', 'Heta', 'Hiren', 'Jignesh', 'Jyoti', 'Kalpesh',
  'Kavita', 'Kunal', 'Manish', 'Mitali', 'Nirav', 'Nisha', 'Parth', 'Pinal',
  'Pratik', 'Rajesh', 'Rekha', 'Ronak', 'Sagar', 'Sejal', 'Shreya', 'Sunil',
  'Tarun', 'Trupti', 'Umang', 'Vaishali', 'Vikram', 'Yash', 'Zarna', 'Bhargav',
]

const SURNAMES = [
  'Patel', 'Shah', 'Desai', 'Mehta', 'Joshi', 'Trivedi', 'Bhatt', 'Solanki',
  'Vora', 'Amin', 'Parikh', 'Modi', 'Gandhi', 'Chokshi', 'Naik', 'Rana',
  'Kapadia', 'Zaveri', 'Bhavsar', 'Thakkar', 'Panchal', 'Raval', 'Dave', 'Sheth',
]

const CITIES = [
  { city: 'Surat', pincode: '395007' },
  { city: 'Ahmedabad', pincode: '380015' },
  { city: 'Vadodara', pincode: '390007' },
  { city: 'Rajkot', pincode: '360005' },
  { city: 'Navsari', pincode: '396445' },
  { city: 'Bharuch', pincode: '392001' },
]

const OWNER_IDS = [USER_IDS.kiran, USER_IDS.nita, USER_IDS.nikunj, USER_IDS.priya]

const CUSTOMER_STATUS_POOL: readonly Customer['status'][] = [
  'active', 'active', 'active', 'active', 'prospect', 'prospect', 'lapsed', 'dormant',
]

const CUSTOMER_SOURCE_POOL: readonly Customer['source'][] = [
  'website', 'website', 'referral', 'walk_in', 'campaign', 'sub_agent', 'renewal',
]

const KYC_POOL: readonly Customer['kycState'][] = ['complete', 'complete', 'complete', 'partial', 'pending']
const CONSENT_POOL: readonly Customer['consentState'][] = ['submitted', 'submitted', 'link_issued', 'not_sent']

/**
 * Typed premium figures, one table per line. A generated policy picks a pair; it
 * never produces one. Both halves are what a person read off an insurer's quote.
 */
const PREMIUM_TABLE: Readonly<Record<InsuranceLine, readonly (readonly [Money, Money])[]>> = {
  health: [
    [money(8_400), money(1_512)],
    [money(11_260), money(2_026, 80)],
    [money(14_260), money(2_566, 80)],
    [money(18_400), money(3_312)],
    [money(21_500), money(3_870)],
    [money(24_180), money(4_352, 40)],
    [money(31_900), money(5_742)],
    [money(44_600), money(8_028)],
  ],
  motor: [
    [money(4_820), money(867, 60)],
    [money(6_140), money(1_105, 20)],
    [money(7_640), money(1_375, 20)],
    [money(9_120), money(1_641, 60)],
    [money(12_450), money(2_241)],
    [money(16_800), money(3_024)],
  ],
  life: [
    [money(18_000), money(810)],
    [money(24_000), money(1_080)],
    [money(36_000), money(1_620)],
    [money(48_000), money(2_160)],
    [money(60_000), money(2_700)],
  ],
  travel: [
    [money(1_850), money(333)],
    [money(2_640), money(475, 20)],
    [money(4_100), money(738)],
    [money(6_300), money(1_134)],
  ],
  property: [
    [money(3_400), money(612)],
    [money(5_900), money(1_062)],
    [money(9_800), money(1_764)],
  ],
}

const SUM_INSURED_TABLE: Readonly<Record<InsuranceLine, readonly Money[]>> = {
  health: [money(3_00_000), money(5_00_000), money(7_50_000), money(10_00_000), money(15_00_000)],
  motor: [money(3_20_000), money(4_80_000), money(6_40_000), money(9_10_000)],
  life: [money(10_00_000), money(25_00_000), money(50_00_000)],
  travel: [money(41_00_000), money(82_00_000)],
  property: [money(25_00_000), money(50_00_000)],
}

const RETENTION_BY_LINE: Readonly<Record<InsuranceLine, string>> = {
  health: 'health',
  motor: 'motor',
  life: 'standard',
  travel: 'standard',
  property: 'standard',
}

const POLICY_STATUS_POOL: readonly Policy['status'][] = [
  'issued', 'issued', 'issued', 'issued', 'issued', 'issued', 'issued',
  'dispatched', 'documents_collected', 'closed', 'lapsed', 'draft', 'proposal', 'sent',
]

const PREMIUM_MODE_POOL: readonly Policy['premiumMode'][] = [
  'annual', 'annual', 'annual', 'annual', 'half_yearly', 'quarterly', 'monthly', 'single',
]

const TASK_KIND_POOL: readonly Task['kind'][] = [
  'inquiry_follow_up',
  'kyc_chase',
  'payment_follow_up',
  'document_collection',
  'renewal_call',
  'policy_entry',
]

const TASK_STATE_POOL: readonly Task['state'][] = ['open', 'open', 'open', 'in_progress', 'done', 'done', 'cancelled']
const TASK_PRIORITY_POOL: readonly Task['priority'][] = ['normal', 'normal', 'normal', 'high', 'urgent']

/** A synthetic ten-digit mobile. Obviously in-range, obviously not anybody's. */
function mobileFor(prng: Prng): string {
  return `98${String(prng.int(10_000_000, 99_999_999))}`
}

/** Which agencies are appointed for a company. Built once, read per policy. */
function agenciesByCompany(): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>()
  for (const agency of AGENCIES) {
    for (const company of agency.companyIds) {
      const existing = index.get(company) ?? []
      existing.push(agency.id)
      index.set(company, existing)
    }
  }
  return index
}

export type VolumeSet = {
  readonly customers: readonly Customer[]
  readonly policies: readonly Policy[]
  readonly tasks: readonly Task[]
}

export function buildVolume(
  seed: number,
  now: Date,
  counts: VolumeCounts = DEFAULT_VOLUME,
): VolumeSet {
  const prng = createPrng(seed)
  const agencyIndex = agenciesByCompany()

  const customers: Customer[] = Array.from({ length: counts.customers }, (_, index) => {
    const sequence = index + 1
    const place = prng.pick(CITIES)
    const status = prng.pick(CUSTOMER_STATUS_POOL)
    const kycState = prng.pick(KYC_POOL)
    const first = prng.pick(FIRST_NAMES)
    const last = prng.pick(SURNAMES)
    const agentSourced = prng.chance(0.45)

    return {
      id: volumeId('cus', sequence),
      systemNo: systemNo('customer', CUSTOMER_SEQUENCE_START + sequence),
      householdId: null,
      status,
      source: prng.pick(CUSTOMER_SOURCE_POOL),
      createdAt: isoTime(addDays(now, -prng.int(30, 1_400))),
      ownerId: prng.pick(OWNER_IDS),
      agentId: agentSourced ? AGENT_IDS.kiran : null,
      subAgentId: agentSourced && prng.chance(0.25) ? AGENT_IDS.meera : null,
      kycState,
      consentState: kycState === 'complete' ? 'submitted' : prng.pick(CONSENT_POOL),
      fullName: `${first} ${last}`,
      mobile: mobileFor(prng),
      altMobile: null,
      email: prng.chance(0.6)
        ? `${first.toLowerCase()}.${last.toLowerCase()}${sequence}@example.com`
        : null,
      addressLine: null,
      city: place.city,
      state: 'Gujarat',
      pincode: place.pincode,
      dateOfBirth: isoDate(new Date(Date.UTC(prng.int(1955, 2004), prng.int(0, 11), prng.int(1, 28)))),
      aadhaarNumber: null,
      aadhaarLast4: kycState === 'pending' ? null : String(prng.int(1_000, 9_999)),
      panNumber: null,
      bankAccountNumber: null,
      bankIfsc: null,
    }
  })

  const policies: Policy[] = Array.from({ length: counts.policies }, (_, index) => {
    const sequence = index + 1
    const customer = prng.pick(customers)
    const product = prng.pick(PRODUCTS)
    const line = product.line
    const [net, gst] = prng.pick(PREMIUM_TABLE[line])
    const status = prng.pick(POLICY_STATUS_POOL)
    const issued = status !== 'draft' && status !== 'proposal' && status !== 'sent'
    const startDate = addDays(now, -prng.int(1, 700))
    const expiryDate = addDays(startDate, line === 'life' ? 7_300 : 365)
    const candidates = agencyIndex.get(product.companyId) ?? [AGENCIES[0].id]

    return {
      id: volumeId('pol', sequence),
      systemNo: issued
        ? systemNo('policy', POLICY_SEQUENCE_START + sequence)
        : systemNo('policyDraft', POLICY_SEQUENCE_START + sequence),
      insurerNo: issued ? `${product.code}-${prng.int(1_000_000, 9_999_999)}` : null,
      customerId: customer.id,
      companyId: product.companyId,
      productId: product.id,
      agencyId: prng.pick(candidates),
      agentId: customer.agentId,
      subAgentId: customer.subAgentId,
      status,
      startDate: issued ? isoDate(startDate) : null,
      expiryDate: issued ? isoDate(expiryDate) : null,
      sumInsured: prng.pick(SUM_INSURED_TABLE[line]),
      netPremium: issued ? net : null,
      gstAmount: issued ? gst : null,
      // The only arithmetic on money the product allows.
      finalPremium: issued ? addMoney(net, gst) : null,
      premiumMode: prng.pick(PREMIUM_MODE_POOL),
      paymentState: issued ? (prng.chance(0.8) ? 'verified' : 'collected') : 'unpaid',
      memberIds: [],
      retentionClass: RETENTION_BY_LINE[line],
      schemaVersion: 2,
      proposerBankAccount: null,
      nomineeAadhaarLast4: null,
      medicalReportSummary: null,
    }
  })

  const tasks: Task[] = Array.from({ length: counts.tasks }, (_, index) => {
    const sequence = index + 1
    const kind = prng.pick(TASK_KIND_POOL)
    const aboutPolicy = kind === 'renewal_call' || kind === 'policy_entry' || kind === 'payment_follow_up'
    const policy = prng.pick(policies)
    const customer = prng.pick(customers)
    const subject = aboutPolicy
      ? { entity: 'Policy', id: policy.id, name: policy.systemNo }
      : { entity: 'Customer', id: customer.id, name: customer.fullName }
    const state = prng.pick(TASK_STATE_POOL)
    const createdAt = addDays(now, -prng.int(1, 90))

    return {
      id: volumeId('tsk', sequence),
      systemNo: systemNo('task', TASK_SEQUENCE_START + sequence),
      kind,
      title: `${subject.name} - ${kind.replace(/_/g, ' ')}`,
      subjectEntity: subject.entity,
      subjectId: subject.id,
      ownerId: prng.pick(OWNER_IDS),
      teamId: prng.pick([TEAM_IDS.sales, TEAM_IDS.backOffice, TEAM_IDS.renewals]),
      agentId: prng.chance(0.4) ? AGENT_IDS.kiran : null,
      state,
      priority: prng.pick(TASK_PRIORITY_POOL),
      dueAt: isoTime(addDays(createdAt, prng.int(1, 21))),
      createdAt: isoTime(createdAt),
      completedAt: state === 'done' ? isoTime(addDays(createdAt, prng.int(1, 14))) : null,
      raisedBy: prng.chance(0.5) ? 'renewal.schedule' : prng.pick(OWNER_IDS),
    }
  })

  return { customers, policies, tasks }
}
