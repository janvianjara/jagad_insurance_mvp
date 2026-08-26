/**
 * The configuration seed — plan §8 ("Config seed"), canvas flow 6.
 *
 * Flow 6's claim is that "the whole system is configuration, not code", and this
 * file is where that claim is either true or a slogan. Eight real insurers the
 * prototype already names, their products per line, the benefit catalogue and its
 * per-product maps, four agencies with per company-and-product percentages, the
 * six staff personas from the walkthrough, and the recipes whose parameters are
 * the TAT, the renewal lead and the auto-share switch that flows 1, 2 and 5 turn
 * on.
 *
 * Nothing here is random. The seed is hand-written, in full, because a
 * configuration a client recognises is worth more than a configuration a
 * generator produced — and because the volume set in `volume.ts` picks from these
 * rows, so a shuffle here would move every generated policy too.
 *
 * Percentages are basis points, matching `commissionShare`: 15 per cent is 1500.
 */

import { STARTER_TEMPLATES } from '../../domain/permissions'
import type { Agency, AgencyPolicyScope } from '../repo/agencies'
import type { Agent, CommissionSplit } from '../repo/agents'
import type { BenefitItem, PolicyBenefitMap } from '../repo/benefits'
import type { Company, CompanyContact, InsuranceLine } from '../repo/companies'
import type { CommissionRule } from '../repo/commission'
import type {
  FormSchema,
  InquiryCategory,
  MasterType,
  MasterValue,
  MessageTemplate,
  Recipe,
  RetentionClass,
  StaffUser,
  Team,
} from '../repo/config'
import type { DocChecklist, Product } from '../repo/products'
import { isoTime } from './clock'

const SEEDED_AT = isoTime(new Date('2026-01-05T04:30:00.000Z'))

/* ------------------------------------------------------------------ companies */

type CompanySeed = {
  readonly key: string
  readonly name: string
  readonly shortName: string
  readonly lines: readonly InsuranceLine[]
  readonly contact: { readonly name: string; readonly role: string }
}

const COMPANY_SEEDS: readonly CompanySeed[] = [
  {
    key: 'hdfc-ergo',
    name: 'HDFC Ergo General Insurance',
    shortName: 'HDFC Ergo',
    lines: ['health', 'motor', 'travel'],
    contact: { name: 'Rohan Deshpande', role: 'Relationship Manager' },
  },
  {
    key: 'niva-bupa',
    name: 'Niva Bupa Health Insurance',
    shortName: 'Niva Bupa',
    lines: ['health'],
    contact: { name: 'Anita Kulkarni', role: 'Channel Manager' },
  },
  {
    key: 'bajaj-allianz',
    name: 'Bajaj Allianz General Insurance',
    shortName: 'Bajaj Allianz',
    lines: ['health', 'motor', 'property'],
    contact: { name: 'Sanjay Mehra', role: 'Branch Head' },
  },
  {
    key: 'icici-lombard',
    name: 'ICICI Lombard General Insurance',
    shortName: 'ICICI Lombard',
    lines: ['health', 'motor', 'travel'],
    contact: { name: 'Pooja Iyer', role: 'Relationship Manager' },
  },
  {
    key: 'tata-aig',
    name: 'Tata AIG General Insurance',
    shortName: 'Tata AIG',
    lines: ['health', 'motor', 'travel'],
    contact: { name: 'Farhan Qureshi', role: 'Agency Manager' },
  },
  {
    key: 'iffco-tokio',
    name: 'IFFCO Tokio General Insurance',
    shortName: 'IFFCO Tokio',
    lines: ['health', 'motor', 'property'],
    contact: { name: 'Devendra Rathod', role: 'Regional Manager' },
  },
  {
    key: 'royal-sundaram',
    name: 'Royal Sundaram General Insurance',
    shortName: 'Royal Sundaram',
    lines: ['health', 'motor'],
    contact: { name: 'Lakshmi Narayan', role: 'Channel Manager' },
  },
  {
    key: 'lic',
    name: 'Life Insurance Corporation of India',
    shortName: 'LIC',
    lines: ['life'],
    contact: { name: 'Bharat Solanki', role: 'Development Officer' },
  },
]

export const companyId = (key: string): string => `cmp-${key}`

export const COMPANIES: readonly Company[] = COMPANY_SEEDS.map((seed) => ({
  id: companyId(seed.key),
  key: seed.key,
  name: seed.name,
  shortName: seed.shortName,
  lines: seed.lines,
  claimsEmail: `claims@${seed.key}.example`,
  active: true,
}))

export const COMPANY_CONTACTS: readonly CompanyContact[] = COMPANY_SEEDS.map((seed, index) => ({
  id: `cnt-${seed.key}`,
  companyId: companyId(seed.key),
  name: seed.contact.name,
  role: seed.contact.role,
  mobile: `9820${String(100000 + index * 111).padStart(6, '0')}`,
  email: `${seed.contact.name.toLowerCase().replace(/\s+/g, '.')}@${seed.key}.example`,
}))

/* ------------------------------------------------------------------- products */

type ProductSeed = {
  readonly company: string
  readonly code: string
  readonly name: string
  readonly line: InsuranceLine
}

const PRODUCT_SEEDS: readonly ProductSeed[] = [
  { company: 'hdfc-ergo', code: 'HE-OPS', name: 'Optima Secure', line: 'health' },
  { company: 'hdfc-ergo', code: 'HE-OPR', name: 'Optima Restore', line: 'health' },
  { company: 'hdfc-ergo', code: 'HE-MTS', name: 'Motor Secure', line: 'motor' },
  { company: 'niva-bupa', code: 'NB-RA2', name: 'ReAssure 2.0', line: 'health' },
  { company: 'niva-bupa', code: 'NB-HCP', name: 'Health Companion', line: 'health' },
  { company: 'niva-bupa', code: 'NB-SRF', name: 'Senior First', line: 'health' },
  { company: 'bajaj-allianz', code: 'BA-HGD', name: 'Health Guard', line: 'health' },
  { company: 'bajaj-allianz', code: 'BA-MPK', name: 'Motor Package', line: 'motor' },
  { company: 'bajaj-allianz', code: 'BA-HSH', name: 'Home Shield', line: 'property' },
  { company: 'icici-lombard', code: 'IL-CHI', name: 'Complete Health Insurance', line: 'health' },
  { company: 'icici-lombard', code: 'IL-PCP', name: 'Private Car Package', line: 'motor' },
  { company: 'icici-lombard', code: 'IL-TRP', name: 'Travel Protect', line: 'travel' },
  { company: 'tata-aig', code: 'TA-MCP', name: 'MediCare Premier', line: 'health' },
  { company: 'tata-aig', code: 'TA-ATS', name: 'Auto Secure', line: 'motor' },
  { company: 'tata-aig', code: 'TA-TVG', name: 'Travel Guard', line: 'travel' },
  { company: 'iffco-tokio', code: 'IT-FHP', name: 'Family Health Protector', line: 'health' },
  { company: 'iffco-tokio', code: 'IT-CVP', name: 'Commercial Vehicle Package', line: 'motor' },
  { company: 'iffco-tokio', code: 'IT-HFP', name: 'Home Family Protector', line: 'property' },
  { company: 'royal-sundaram', code: 'RS-LLS', name: 'Lifeline Supreme', line: 'health' },
  { company: 'royal-sundaram', code: 'RS-LLE', name: 'Lifeline Elite', line: 'health' },
  { company: 'royal-sundaram', code: 'RS-CSH', name: 'Car Shield', line: 'motor' },
  { company: 'lic', code: 'LC-JVA', name: 'Jeevan Anand', line: 'life' },
  { company: 'lic', code: 'LC-JVL', name: 'Jeevan Labh', line: 'life' },
  { company: 'lic', code: 'LC-NEP', name: 'New Endowment Plan', line: 'life' },
]

export const productId = (code: string): string => `prd-${code.toLowerCase()}`

/** The category a line's demand arrives under. Routing and catalogue share it. */
export const categoryIdForLine = (line: InsuranceLine): string => `cat-${line}`

export const PRODUCTS: readonly Product[] = PRODUCT_SEEDS.map((seed) => ({
  id: productId(seed.code),
  companyId: companyId(seed.company),
  code: seed.code,
  name: seed.name,
  line: seed.line,
  categoryId: categoryIdForLine(seed.line),
  formSchemaId: seed.code === 'HE-OPS' ? 'frm-policy-entry-optima' : null,
  active: true,
}))

/* ------------------------------------------------------------------- benefits */

type BenefitSeed = {
  readonly key: string
  readonly label: string
  readonly line: InsuranceLine
  readonly kind: 'amount' | 'text' | 'covered'
  /** The brochure values a configurator types. Picked by product position, never generated. */
  readonly defaults: readonly string[]
}

const BENEFIT_SEEDS: readonly BenefitSeed[] = [
  { key: 'sum-insured', label: 'Sum insured', line: 'health', kind: 'amount', defaults: ['5,00,000', '10,00,000', '15,00,000'] },
  { key: 'room-rent', label: 'Room rent limit', line: 'health', kind: 'text', defaults: ['Single private room', 'No capping', '1% of sum insured'] },
  { key: 'icu-limit', label: 'ICU limit', line: 'health', kind: 'text', defaults: ['No capping', '2% of sum insured', 'Actuals'] },
  { key: 'pre-hosp', label: 'Pre-hospitalisation', line: 'health', kind: 'text', defaults: ['30 days', '60 days', '90 days'] },
  { key: 'post-hosp', label: 'Post-hospitalisation', line: 'health', kind: 'text', defaults: ['60 days', '90 days', '180 days'] },
  { key: 'day-care', label: 'Day care procedures', line: 'health', kind: 'text', defaults: ['All day care', '586 procedures', 'Listed procedures'] },
  { key: 'ambulance', label: 'Ambulance cover', line: 'health', kind: 'amount', defaults: ['2,000 per event', '5,000 per event', 'Actuals'] },
  { key: 'maternity', label: 'Maternity cover', line: 'health', kind: 'text', defaults: ['Not covered', 'After 24 months', 'After 36 months'] },
  { key: 'new-born', label: 'New born cover', line: 'health', kind: 'text', defaults: ['Not covered', 'From day one', 'After 90 days'] },
  { key: 'restore', label: 'Restore benefit', line: 'health', kind: 'text', defaults: ['Not available', '100% once a year', 'Unlimited'] },
  { key: 'ncb', label: 'No claim bonus', line: 'health', kind: 'text', defaults: ['10% per year, max 50%', '50% per year, max 100%', 'Not applicable'] },
  { key: 'ped-wait', label: 'Pre-existing waiting period', line: 'health', kind: 'text', defaults: ['48 months', '36 months', '24 months'] },
  { key: 'domiciliary', label: 'Domiciliary treatment', line: 'health', kind: 'text', defaults: ['Covered', 'Not covered', 'Up to 10% of sum insured'] },
  { key: 'organ-donor', label: 'Organ donor cover', line: 'health', kind: 'text', defaults: ['Covered', 'Up to sum insured', 'Not covered'] },
  { key: 'ayush', label: 'AYUSH treatment', line: 'health', kind: 'text', defaults: ['Covered in full', 'Up to 25% of sum insured', 'Not covered'] },
  { key: 'health-checkup', label: 'Annual health check-up', line: 'health', kind: 'text', defaults: ['Every year', 'Every second year', 'Not included'] },
  { key: 'co-payment', label: 'Co-payment', line: 'health', kind: 'text', defaults: ['Nil', '10% above age 61', '20% above age 61'] },
  { key: 'zone-pricing', label: 'Zone based pricing', line: 'health', kind: 'text', defaults: ['Zone 2', 'Zone 1', 'Not applicable'] },

  { key: 'own-damage', label: 'Own damage cover', line: 'motor', kind: 'covered', defaults: ['Covered', 'Covered', 'Covered'] },
  { key: 'third-party', label: 'Third party liability', line: 'motor', kind: 'text', defaults: ['Statutory limit', 'Statutory limit', 'Statutory limit'] },
  { key: 'zero-dep', label: 'Zero depreciation', line: 'motor', kind: 'text', defaults: ['Add-on', 'Included', 'Not available'] },
  { key: 'engine-protect', label: 'Engine protect', line: 'motor', kind: 'text', defaults: ['Add-on', 'Included', 'Not available'] },
  { key: 'roadside', label: 'Roadside assistance', line: 'motor', kind: 'text', defaults: ['24x7', 'Daytime only', 'Add-on'] },
  { key: 'consumables', label: 'Consumables cover', line: 'motor', kind: 'text', defaults: ['Add-on', 'Included', 'Not available'] },
  { key: 'return-invoice', label: 'Return to invoice', line: 'motor', kind: 'text', defaults: ['Add-on', 'Included', 'Not available'] },
  { key: 'ncb-protect', label: 'NCB protect', line: 'motor', kind: 'text', defaults: ['Add-on', 'Included', 'Not available'] },

  { key: 'sum-assured', label: 'Sum assured', line: 'life', kind: 'amount', defaults: ['10,00,000', '25,00,000', '50,00,000'] },
  { key: 'policy-term', label: 'Policy term', line: 'life', kind: 'text', defaults: ['15 years', '20 years', '25 years'] },
  { key: 'ppt', label: 'Premium paying term', line: 'life', kind: 'text', defaults: ['15 years', '12 years', '10 years'] },
  { key: 'maturity-benefit', label: 'Maturity benefit', line: 'life', kind: 'text', defaults: ['Sum assured plus bonus', 'Sum assured', 'Sum assured plus loyalty addition'] },
  { key: 'death-benefit', label: 'Death benefit', line: 'life', kind: 'text', defaults: ['Sum assured plus bonus', '10 times annual premium', 'Sum assured'] },
  { key: 'accident-rider', label: 'Accidental death rider', line: 'life', kind: 'text', defaults: ['Available', 'Included', 'Not available'] },

  { key: 'travel-medical', label: 'Medical expenses abroad', line: 'travel', kind: 'amount', defaults: ['USD 50,000', 'USD 100,000', 'USD 250,000'] },
  { key: 'trip-cancel', label: 'Trip cancellation', line: 'travel', kind: 'amount', defaults: ['USD 500', 'USD 1,000', 'USD 1,500'] },
  { key: 'baggage-loss', label: 'Baggage loss', line: 'travel', kind: 'amount', defaults: ['USD 500', 'USD 1,000', 'USD 1,200'] },
  { key: 'passport-loss', label: 'Passport loss', line: 'travel', kind: 'amount', defaults: ['USD 250', 'USD 300', 'USD 500'] },
  { key: 'flight-delay', label: 'Flight delay', line: 'travel', kind: 'text', defaults: ['After 6 hours', 'After 12 hours', 'After 4 hours'] },
  { key: 'travel-pa', label: 'Personal accident', line: 'travel', kind: 'amount', defaults: ['USD 15,000', 'USD 25,000', 'USD 50,000'] },

  { key: 'structure-cover', label: 'Structure cover', line: 'property', kind: 'amount', defaults: ['25,00,000', '50,00,000', '75,00,000'] },
  { key: 'contents-cover', label: 'Contents cover', line: 'property', kind: 'amount', defaults: ['5,00,000', '10,00,000', '15,00,000'] },
  { key: 'burglary', label: 'Burglary cover', line: 'property', kind: 'text', defaults: ['Covered', 'Add-on', 'Not covered'] },
  { key: 'natural-calamity', label: 'Natural calamity cover', line: 'property', kind: 'text', defaults: ['Covered', 'Covered', 'Add-on'] },
]

export const benefitId = (key: string): string => `ben-${key}`

export const BENEFIT_ITEMS: readonly BenefitItem[] = BENEFIT_SEEDS.map((seed, index) => ({
  id: benefitId(seed.key),
  key: seed.key,
  label: seed.label,
  line: seed.line,
  valueKind: seed.kind,
  sortOrder: index + 1,
  active: true,
}))

/**
 * One map row per benefit of the product's line. The default is chosen by the
 * product's position within its line, so two companies' sheets differ in the way
 * two brochures differ — and identically on every run.
 */
export const POLICY_BENEFIT_MAPS: readonly PolicyBenefitMap[] = PRODUCTS.flatMap(
  (product, productIndex) => {
    const forLine = BENEFIT_SEEDS.filter((benefit) => benefit.line === product.line)
    return forLine.map((benefit, benefitIndex) => ({
      id: `pbm-${product.code.toLowerCase()}-${benefit.key}`,
      productId: product.id,
      benefitItemId: benefitId(benefit.key),
      defaultValue: benefit.defaults[(productIndex + benefitIndex) % benefit.defaults.length],
      sortOrder: benefitIndex + 1,
    }))
  },
)

/* ----------------------------------------------------------------- checklists */

const KYC_ITEMS = ['Aadhaar (last 4 recorded)', 'PAN card', 'Passport photograph', 'Address proof']
const POLICY_ITEMS = ['Signed proposal form', 'Premium receipt reference', 'Nominee declaration']
const CLAIM_ITEMS = [
  'Claim form',
  'Discharge summary',
  'Hospital final bill',
  'Investigation reports',
  'Cancelled cheque leaf',
]

export const DOC_CHECKLISTS: readonly DocChecklist[] = COMPANIES.flatMap((company) => [
  { id: `chk-${company.key}-kyc`, companyId: company.id, productId: null, purpose: 'kyc' as const, items: KYC_ITEMS },
  { id: `chk-${company.key}-policy`, companyId: company.id, productId: null, purpose: 'policy' as const, items: POLICY_ITEMS },
  { id: `chk-${company.key}-claim`, companyId: company.id, productId: null, purpose: 'claim' as const, items: CLAIM_ITEMS },
])

/* ------------------------------------------------------------------ agencies */

type AgencySeed = {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly type: 'individual' | 'broker'
  readonly companies: readonly string[]
}

/**
 * Canvas 6.3: an Individual agency locks to one company, a Broker allows many.
 * The seed says so structurally — one entry against several — rather than in a
 * comment somebody has to remember to read.
 */
const AGENCY_SEEDS: readonly AgencySeed[] = [
  { id: 'agy-jagad-hdfc', code: 'JAG-IND-HE', name: 'Jagad Insurance (HDFC Ergo)', type: 'individual', companies: ['hdfc-ergo'] },
  { id: 'agy-jagad-lic', code: 'JAG-IND-LC', name: 'Jagad Insurance (LIC)', type: 'individual', companies: ['lic'] },
  {
    id: 'agy-jagad-general',
    code: 'JAG-BRK-GEN',
    name: 'Jagad Insurance Brokers - General',
    type: 'broker',
    companies: ['niva-bupa', 'bajaj-allianz', 'icici-lombard', 'tata-aig'],
  },
  {
    id: 'agy-jagad-motor',
    code: 'JAG-BRK-MOT',
    name: 'Jagad Insurance Brokers - Motor and Property',
    type: 'broker',
    companies: ['iffco-tokio', 'royal-sundaram', 'bajaj-allianz'],
  },
]

export const AGENCIES: readonly Agency[] = AGENCY_SEEDS.map((seed) => ({
  id: seed.id,
  code: seed.code,
  name: seed.name,
  type: seed.type,
  companyIds: seed.companies.map(companyId),
  city: 'Surat',
  active: true,
}))

/** The rate that came with each appointment, per company and per product. */
const BASE_RATE_BY_LINE: Readonly<Record<InsuranceLine, number>> = {
  health: 1500,
  motor: 1000,
  life: 2500,
  travel: 1200,
  property: 1000,
}

export const AGENCY_SCOPES: readonly AgencyPolicyScope[] = AGENCY_SEEDS.flatMap((agency) =>
  PRODUCTS.filter((product) => agency.companies.includes(product.companyId.replace('cmp-', ''))).map(
    (product, index) => ({
      id: `aps-${agency.id.replace('agy-', '')}-${product.code.toLowerCase()}`,
      agencyId: agency.id,
      companyId: product.companyId,
      productId: product.id,
      commissionPercentBp: BASE_RATE_BY_LINE[product.line] + (index % 3) * 50,
      effectiveFrom: SEEDED_AT,
      active: true,
    }),
  ),
)

export const COMMISSION_RULES: readonly CommissionRule[] = AGENCY_SCOPES.map((scope) => ({
  id: `crl-${scope.id.replace('aps-', '')}`,
  agencyId: scope.agencyId,
  companyId: scope.companyId,
  productId: scope.productId,
  basisPercentBp: scope.commissionPercentBp,
  effectiveFrom: scope.effectiveFrom,
  effectiveTo: null,
  active: true,
}))

/* --------------------------------------------------------- users and channel */

export const USER_IDS = {
  vivek: 'usr-vivek-jagad',
  nikunj: 'usr-nikunj-shah',
  kiran: 'usr-kiran-solanki',
  priya: 'usr-priya-desai',
  amit: 'usr-amit-rana',
  sneha: 'usr-sneha-patel',
  nita: 'usr-nita-shah',
  meera: 'usr-meera-joshi',
} as const

export const TEAM_IDS = {
  sales: 'tem-sales',
  backOffice: 'tem-back-office',
  claims: 'tem-claims',
  renewals: 'tem-renewals',
} as const

export const AGENT_IDS = {
  kiran: 'agt-kiran-solanki',
  meera: 'agt-meera-joshi',
} as const

/**
 * The six personas from the prototype walkthrough, plus two the M0 scenarios
 * need: Nita Shah is the "next in category" a reassignment moves to (canvas 1.3),
 * and Meera Joshi is the sub-agent reporting to Kiran Solanki (canvas 1.6).
 * Both are named in the prototype.
 */
export const USERS: readonly StaffUser[] = [
  {
    id: USER_IDS.vivek,
    name: 'Vivek Jagad',
    email: 'vivek@jagadinsurance.example',
    mobile: '9825010001',
    templateKey: STARTER_TEMPLATES.admin.key,
    teamId: null,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor', 'cat-life', 'cat-travel', 'cat-property'],
    roleLabel: 'Admin, whole business',
    active: true,
  },
  {
    id: USER_IDS.nikunj,
    name: 'Nikunj Shah',
    email: 'nikunj@jagadinsurance.example',
    mobile: '9825010002',
    templateKey: STARTER_TEMPLATES.salesManager.key,
    teamId: TEAM_IDS.sales,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor', 'cat-life', 'cat-travel'],
    roleLabel: 'Sales, team pipeline',
    active: true,
  },
  {
    id: USER_IDS.kiran,
    name: 'Kiran Solanki',
    email: 'kiran@jagadinsurance.example',
    mobile: '9825010003',
    templateKey: STARTER_TEMPLATES.agent.key,
    teamId: TEAM_IDS.sales,
    agentId: AGENT_IDS.kiran,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor'],
    roleLabel: 'Agent, own customers only',
    active: true,
  },
  {
    id: USER_IDS.priya,
    name: 'Priya Desai',
    email: 'priya@jagadinsurance.example',
    mobile: '9825010004',
    templateKey: STARTER_TEMPLATES.backOffice.key,
    teamId: TEAM_IDS.backOffice,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor', 'cat-life', 'cat-travel', 'cat-property'],
    roleLabel: 'Back-office, assigned queues',
    active: true,
  },
  {
    id: USER_IDS.amit,
    name: 'Amit Rana',
    email: 'amit@jagadinsurance.example',
    mobile: '9825010005',
    templateKey: STARTER_TEMPLATES.claims.key,
    teamId: TEAM_IDS.claims,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor'],
    roleLabel: 'Claims, claim queue',
    active: true,
  },
  {
    id: USER_IDS.sneha,
    name: 'Sneha Patel',
    email: 'sneha@jagadinsurance.example',
    mobile: '9825010006',
    templateKey: STARTER_TEMPLATES.renewals.key,
    teamId: TEAM_IDS.renewals,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor', 'cat-travel'],
    roleLabel: 'Renewals, renewal pool',
    active: true,
  },
  {
    id: USER_IDS.nita,
    name: 'Nita Shah',
    email: 'nita@jagadinsurance.example',
    mobile: '9825010007',
    templateKey: STARTER_TEMPLATES.agent.key,
    teamId: TEAM_IDS.sales,
    agentId: null,
    parentAgentId: null,
    categoryIds: ['cat-health', 'cat-motor', 'cat-life', 'cat-travel', 'cat-property'],
    roleLabel: 'Agent, own customers only',
    active: true,
  },
  {
    id: USER_IDS.meera,
    name: 'Meera Joshi',
    email: 'meera@jagadinsurance.example',
    mobile: '9825010008',
    templateKey: STARTER_TEMPLATES.subAgent.key,
    teamId: null,
    agentId: AGENT_IDS.meera,
    parentAgentId: AGENT_IDS.kiran,
    categoryIds: ['cat-health'],
    roleLabel: 'Sub-agent, own leads',
    active: true,
  },
]

export const TEAMS: readonly Team[] = [
  {
    id: TEAM_IDS.sales,
    name: 'Sales',
    leadUserId: USER_IDS.nikunj,
    memberUserIds: [USER_IDS.nikunj, USER_IDS.kiran, USER_IDS.nita],
  },
  {
    id: TEAM_IDS.backOffice,
    name: 'Back office',
    leadUserId: USER_IDS.priya,
    memberUserIds: [USER_IDS.priya],
  },
  {
    id: TEAM_IDS.claims,
    name: 'Claims',
    leadUserId: USER_IDS.amit,
    memberUserIds: [USER_IDS.amit],
  },
  {
    id: TEAM_IDS.renewals,
    name: 'Renewals',
    leadUserId: USER_IDS.sneha,
    memberUserIds: [USER_IDS.sneha],
  },
]

/**
 * Canvas 6.4's agent settings, in full: the share, the sub-agent grant, the cap
 * the grant is bounded by, and the direct-updates toggle FR-11 reads.
 */
export const AGENTS: readonly Agent[] = [
  {
    id: AGENT_IDS.kiran,
    code: 'AGT-0007',
    name: 'Kiran Solanki',
    mobile: '9825010003',
    email: 'kiran@jagadinsurance.example',
    agencyId: 'agy-jagad-general',
    userId: USER_IDS.kiran,
    parentAgentId: null,
    city: 'Surat',
    categoryIds: ['cat-health', 'cat-motor'],
    sharePercentBp: 6000,
    canGrantSubAgents: true,
    subAgentCapPercentBp: 4000,
    directUpdatesEnabled: true,
    active: true,
  },
  {
    id: AGENT_IDS.meera,
    code: 'AGT-0019',
    name: 'Meera Joshi',
    mobile: '9825010008',
    email: 'meera@jagadinsurance.example',
    agencyId: 'agy-jagad-general',
    userId: USER_IDS.meera,
    parentAgentId: AGENT_IDS.kiran,
    city: 'Surat',
    categoryIds: ['cat-health'],
    sharePercentBp: 3000,
    canGrantSubAgents: false,
    subAgentCapPercentBp: 0,
    directUpdatesEnabled: false,
    active: true,
  },
]

const SPLIT_PRODUCT_CODES = ['NB-RA2', 'BA-HGD', 'IL-CHI', 'TA-MCP'] as const

export const COMMISSION_SPLITS: readonly CommissionSplit[] = SPLIT_PRODUCT_CODES.map((code) => {
  const product = PRODUCTS.find((candidate) => candidate.code === code) as Product
  return {
    id: `csp-kiran-${code.toLowerCase()}`,
    agencyId: 'agy-jagad-general',
    companyId: product.companyId,
    productId: product.id,
    agentId: AGENT_IDS.kiran,
    subAgentId: AGENT_IDS.meera,
    agentSharePercentBp: 6000,
    subAgentSharePercentBp: 3000,
    effectiveFrom: SEEDED_AT,
  }
})

/* ---------------------------------------------------------------- categories */

/**
 * The TAT lives on the category, not in code — §9 is explicit that it is a
 * routing-recipe parameter and that this platform holds no default.
 */
export const INQUIRY_CATEGORIES: readonly InquiryCategory[] = [
  {
    id: 'cat-health',
    key: 'health',
    label: 'Health',
    line: 'health',
    teamId: TEAM_IDS.sales,
    tatMinutes: 60,
    memberUserIds: [USER_IDS.kiran, USER_IDS.nita],
  },
  {
    id: 'cat-motor',
    key: 'motor',
    label: 'Motor',
    line: 'motor',
    teamId: TEAM_IDS.sales,
    tatMinutes: 60,
    memberUserIds: [USER_IDS.nita, USER_IDS.kiran],
  },
  {
    id: 'cat-life',
    key: 'life',
    label: 'Life',
    line: 'life',
    teamId: TEAM_IDS.sales,
    tatMinutes: 120,
    memberUserIds: [USER_IDS.nita],
  },
  {
    id: 'cat-travel',
    key: 'travel',
    label: 'Travel',
    line: 'travel',
    teamId: TEAM_IDS.sales,
    tatMinutes: 240,
    memberUserIds: [USER_IDS.nita, USER_IDS.sneha],
  },
  {
    id: 'cat-property',
    key: 'property',
    label: 'Property',
    line: 'property',
    teamId: TEAM_IDS.sales,
    tatMinutes: 240,
    memberUserIds: [USER_IDS.nita],
  },
]

/* ------------------------------------------------------------------- masters */

type MasterSeed = {
  readonly key: string
  readonly label: string
  readonly editable: boolean
  readonly values: readonly (readonly [string, string])[]
}

const MASTER_SEEDS: readonly MasterSeed[] = [
  {
    key: 'inquiry_source',
    label: 'Inquiry source',
    editable: true,
    values: [
      ['website', 'Website'],
      ['walk_in', 'Walk in'],
      ['referral', 'Referral'],
      ['sub_agent', 'Sub-agent'],
      ['campaign', 'Campaign'],
      ['renewal', 'Renewal'],
    ],
  },
  {
    key: 'lost_reason',
    label: 'Lost reason',
    editable: true,
    values: [
      ['price', 'Premium too high'],
      ['competitor', 'Bought from another agency'],
      ['deferred', 'Postponed the decision'],
      ['unreachable', 'Could not be reached'],
      ['not_eligible', 'Not eligible for the product'],
    ],
  },
  {
    key: 'relationship',
    label: 'Member relationship',
    editable: false,
    values: [
      ['self', 'Self'],
      ['spouse', 'Spouse'],
      ['son', 'Son'],
      ['daughter', 'Daughter'],
      ['father', 'Father'],
      ['mother', 'Mother'],
      ['other', 'Other'],
    ],
  },
  {
    key: 'city',
    label: 'City',
    editable: true,
    values: [
      ['surat', 'Surat'],
      ['ahmedabad', 'Ahmedabad'],
      ['vadodara', 'Vadodara'],
      ['rajkot', 'Rajkot'],
      ['navsari', 'Navsari'],
      ['bharuch', 'Bharuch'],
    ],
  },
  {
    key: 'occupation',
    label: 'Occupation',
    editable: true,
    values: [
      ['business', 'Business'],
      ['salaried', 'Salaried'],
      ['professional', 'Professional'],
      ['retired', 'Retired'],
      ['homemaker', 'Homemaker'],
    ],
  },
  {
    key: 'bounce_reason',
    label: 'Cheque bounce reason',
    editable: true,
    values: [
      ['insufficient_funds', 'Insufficient funds'],
      ['signature_mismatch', 'Signature mismatch'],
      ['account_closed', 'Account closed'],
      ['stale_cheque', 'Stale cheque'],
    ],
  },
]

export const MASTER_TYPES: readonly MasterType[] = MASTER_SEEDS.map((seed) => ({
  id: `mst-${seed.key.replace(/_/g, '-')}`,
  key: seed.key,
  label: seed.label,
  editable: seed.editable,
}))

export const MASTER_VALUES: readonly MasterValue[] = MASTER_SEEDS.flatMap((seed) =>
  seed.values.map(([key, label], index) => ({
    id: `msv-${seed.key.replace(/_/g, '-')}-${key.replace(/_/g, '-')}`,
    masterTypeId: `mst-${seed.key.replace(/_/g, '-')}`,
    key,
    label,
    sortOrder: index + 1,
    active: true,
  })),
)

export const RETENTION_CLASSES: readonly RetentionClass[] = [
  { id: 'rtn-standard', key: 'standard', label: 'Standard records', years: 7 },
  { id: 'rtn-health', key: 'health', label: 'Health contract records', years: 10 },
  { id: 'rtn-claims', key: 'claims', label: 'Claim records', years: 10 },
  { id: 'rtn-motor', key: 'motor', label: 'Motor contract records', years: 5 },
]

/* -------------------------------------------------------------- form schemas */

const POLICY_ENTRY_STAGES = [
  {
    key: 'proposer',
    label: 'Proposer',
    fields: [
      { key: 'fullName', label: 'Proposer name', kind: 'text' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'mobile', label: 'Mobile', kind: 'text' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'dateOfBirth', label: 'Date of birth', kind: 'date' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'occupation', label: 'Occupation', kind: 'select' as const, required: false, visibleWhen: null, masterTypeId: 'mst-occupation' },
    ],
  },
  {
    key: 'cover',
    label: 'Cover',
    fields: [
      { key: 'sumInsured', label: 'Sum insured', kind: 'money' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'startDate', label: 'Risk start date', kind: 'date' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'expiryDate', label: 'Expiry date', kind: 'date' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'floater', label: 'Family floater', kind: 'boolean' as const, required: false, visibleWhen: null, masterTypeId: null },
      { key: 'memberCount', label: 'Members covered', kind: 'number' as const, required: false, visibleWhen: { field: 'floater', equals: 'true' }, masterTypeId: null },
    ],
  },
  {
    key: 'premium',
    label: 'Premium',
    fields: [
      { key: 'netPremium', label: 'Net premium', kind: 'money' as const, required: false, visibleWhen: null, masterTypeId: null },
      { key: 'gstAmount', label: 'GST', kind: 'money' as const, required: false, visibleWhen: null, masterTypeId: null },
      { key: 'finalPremium', label: 'Final premium', kind: 'money' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'premiumMode', label: 'Premium mode', kind: 'select' as const, required: true, visibleWhen: null, masterTypeId: null },
    ],
  },
  {
    key: 'nominee',
    label: 'Nominee',
    fields: [
      { key: 'nomineeName', label: 'Nominee name', kind: 'text' as const, required: true, visibleWhen: null, masterTypeId: null },
      { key: 'nomineeRelationship', label: 'Relationship', kind: 'select' as const, required: true, visibleWhen: null, masterTypeId: 'mst-relationship' },
      { key: 'nomineeAadhaarLast4', label: 'Nominee Aadhaar last 4', kind: 'text' as const, required: false, visibleWhen: null, masterTypeId: null },
    ],
  },
]

/**
 * Two versions of the same schema, on purpose. Canvas 6.2 promises that "old
 * records keep their original schema", and POL-4388 is pinned to version 1 while
 * every draft opened since renders version 2 — a promise nothing can keep unless
 * both versions are actually present.
 */
export const FORM_SCHEMAS: readonly FormSchema[] = [
  {
    id: 'frm-policy-entry-v1',
    objectKey: 'policy_entry',
    productId: null,
    version: 1,
    stages: POLICY_ENTRY_STAGES.slice(0, 3),
    publishedAt: SEEDED_AT,
    active: false,
  },
  {
    id: 'frm-policy-entry-v2',
    objectKey: 'policy_entry',
    productId: null,
    version: 2,
    stages: POLICY_ENTRY_STAGES,
    publishedAt: isoTime(new Date('2026-05-18T05:00:00.000Z')),
    active: true,
  },
  {
    id: 'frm-policy-entry-optima',
    objectKey: 'policy_entry',
    productId: productId('HE-OPS'),
    version: 1,
    stages: POLICY_ENTRY_STAGES,
    publishedAt: isoTime(new Date('2026-06-02T05:00:00.000Z')),
    active: true,
  },
  {
    id: 'frm-inquiry-v1',
    objectKey: 'inquiry',
    productId: null,
    version: 1,
    stages: [
      {
        key: 'contact',
        label: 'Contact',
        fields: [
          { key: 'contactName', label: 'Name', kind: 'text', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'contactMobile', label: 'Mobile', kind: 'text', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'contactEmail', label: 'Email', kind: 'text', required: false, visibleWhen: null, masterTypeId: null },
          { key: 'source', label: 'Source', kind: 'select', required: true, visibleWhen: null, masterTypeId: 'mst-inquiry-source' },
        ],
      },
    ],
    publishedAt: SEEDED_AT,
    active: true,
  },
  {
    id: 'frm-kyc-v1',
    objectKey: 'kyc',
    productId: null,
    version: 1,
    stages: [
      {
        key: 'identity',
        label: 'Identity',
        fields: [
          { key: 'aadhaarLast4', label: 'Aadhaar last 4', kind: 'text', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'panNumber', label: 'PAN', kind: 'text', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'addressLine', label: 'Address', kind: 'text', required: true, visibleWhen: null, masterTypeId: null },
        ],
      },
    ],
    publishedAt: SEEDED_AT,
    active: true,
  },
  {
    id: 'frm-claim-intimation-v1',
    objectKey: 'claim_intimation',
    productId: null,
    version: 1,
    stages: [
      {
        key: 'event',
        label: 'Event',
        fields: [
          { key: 'claimType', label: 'Claim type', kind: 'select', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'occurredOn', label: 'Date of event', kind: 'date', required: true, visibleWhen: null, masterTypeId: null },
          { key: 'hospitalName', label: 'Hospital', kind: 'text', required: false, visibleWhen: { field: 'claimType', equals: 'cashless' }, masterTypeId: null },
        ],
      },
    ],
    publishedAt: SEEDED_AT,
    active: true,
  },
]

/* -------------------------------------------------------- recipes and templates */

export const RECIPES: readonly Recipe[] = [
  {
    id: 'rcp-inquiry-routing',
    key: 'inquiry.routing',
    label: 'Route a new inquiry to its category team',
    version: 3,
    trigger: 'inquiry.created',
    parameters: { tatMinutes: 60, escalateToUserId: USER_IDS.nikunj, notifyAssignee: true },
    active: true,
    updatedAt: isoTime(new Date('2026-07-14T06:15:00.000Z')),
  },
  {
    id: 'rcp-inquiry-escalation',
    key: 'inquiry.escalation',
    label: 'Escalate a twice-lapsed inquiry to the sales manager',
    version: 2,
    trigger: 'inquiry.reassigned',
    parameters: { tatMinutes: 60, escalateToUserId: USER_IDS.nikunj, carryHistory: true },
    active: true,
    updatedAt: isoTime(new Date('2026-07-14T06:20:00.000Z')),
  },
  {
    id: 'rcp-quotation-autoshare',
    key: 'quotation.autoShare',
    label: 'Share a quotation with the customer as soon as it exists',
    version: 1,
    trigger: 'quotation.generated',
    parameters: { autoShare: true, channel: 'whatsapp', templateKey: 'quotation.shared' },
    active: true,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'rcp-kyc-credentials',
    key: 'kyc.credentials',
    label: 'Issue portal credentials when KYC completes',
    version: 1,
    trigger: 'kyc.completed',
    parameters: { channel: 'whatsapp', templateKey: 'credentials.issued' },
    active: true,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'rcp-renewal-schedule',
    key: 'renewal.schedule',
    label: 'Open a renewal task ahead of expiry',
    version: 4,
    trigger: 'policy.issued',
    parameters: { leadDays: 45, pool: true },
    active: true,
    updatedAt: isoTime(new Date('2026-08-01T05:45:00.000Z')),
  },
  {
    id: 'rcp-renewal-reminder',
    key: 'renewal.reminder',
    label: 'Send the renewal reminder with year-wise amounts and offers',
    version: 2,
    trigger: 'renewal.due',
    parameters: { maxReminders: 3, channel: 'whatsapp', templateKey: 'renewal.reminder' },
    active: true,
    updatedAt: isoTime(new Date('2026-08-01T05:50:00.000Z')),
  },
  {
    id: 'rcp-collection-bounce',
    key: 'collection.bounceFollowUp',
    label: 'Raise a follow-up task when a cheque bounces',
    version: 1,
    trigger: 'cheque.bounced',
    parameters: { dueInDays: 1, notifyAgent: true, templateKey: 'collection.bounced' },
    active: true,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'rcp-mandate-failure',
    key: 'mandate.failureFollowUp',
    label: 'Raise a same-day follow-up inside grace when a mandate fails',
    version: 1,
    trigger: 'mandate.failed',
    parameters: { sameDay: true, notifyAgent: true, templateKey: 'mandate.failed' },
    active: true,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'rcp-claim-status',
    key: 'claim.statusUpdate',
    label: 'Message the customer whenever a claim status changes',
    version: 1,
    trigger: 'claim.status_changed',
    parameters: { channel: 'whatsapp', templateKey: 'claim.status' },
    active: true,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'rcp-policy-issued',
    key: 'policy.issuedNotice',
    label: 'Message the customer when the policy is issued',
    version: 1,
    trigger: 'policy.issued',
    parameters: { channel: 'whatsapp', templateKey: 'policy.issued' },
    active: true,
    updatedAt: SEEDED_AT,
  },
]

export const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  {
    id: 'tpl-inquiry-assigned',
    key: 'inquiry.assigned',
    label: 'Inquiry assigned to you',
    channel: 'whatsapp',
    subject: null,
    body: 'Inquiry {{systemNo}} for {{contactName}} is with you. Please confirm within {{tatMinutes}} minutes.',
    active: true,
  },
  {
    id: 'tpl-quotation-shared',
    key: 'quotation.shared',
    label: 'Quotation shared with customer',
    channel: 'whatsapp',
    subject: null,
    body: 'Namaste {{customerName}}, your comparison {{systemNo}} from Jagad Insurance is attached.',
    active: true,
  },
  {
    id: 'tpl-credentials-issued',
    key: 'credentials.issued',
    label: 'Portal credentials issued',
    channel: 'whatsapp',
    subject: null,
    body: 'Your Jagad Insurance portal login is ready. Username {{username}}. The password has been sent separately.',
    active: true,
  },
  {
    id: 'tpl-policy-issued',
    key: 'policy.issued',
    label: 'Policy issued',
    channel: 'whatsapp',
    subject: null,
    body: 'Policy {{insurerNo}} is issued and the document is attached. Our reference is {{systemNo}}.',
    active: true,
  },
  {
    id: 'tpl-renewal-reminder',
    key: 'renewal.reminder',
    label: 'Renewal reminder',
    channel: 'whatsapp',
    subject: null,
    body: 'Policy {{systemNo}} expires on {{expiryDate}}. Last year {{lastYearAmount}}, this year {{thisYearAmount}}.',
    active: true,
  },
  {
    id: 'tpl-claim-status',
    key: 'claim.status',
    label: 'Claim status update',
    channel: 'whatsapp',
    subject: null,
    body: 'Claim {{systemNo}} is now {{state}}. You can follow it in your panel.',
    active: true,
  },
  {
    id: 'tpl-mandate-failed',
    key: 'mandate.failed',
    label: 'Mandate presentation failed',
    channel: 'whatsapp',
    subject: null,
    body: 'The bank could not debit the instalment for policy {{systemNo}}. Grace runs to {{graceEndsAt}}.',
    active: true,
  },
  {
    id: 'tpl-collection-bounced',
    key: 'collection.bounced',
    label: 'Cheque bounced',
    channel: 'whatsapp',
    subject: null,
    body: 'The cheque recorded against policy {{systemNo}} has been returned. Reason: {{bounceReason}}.',
    active: true,
  },
]
