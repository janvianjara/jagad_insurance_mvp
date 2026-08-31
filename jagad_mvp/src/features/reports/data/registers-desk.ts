/**
 * The two registers — FR-19.2.
 *
 * A register is the authoritative list of records of one kind, and this module
 * is where the rows come from. It composes reads that already exist on
 * `Repositories`; it holds no command, writes nothing and, like every other file
 * in this feature, produces no figure that nobody typed.
 *
 * ---------------------------------------------------------------------------
 * Why a desk rather than a repository method
 * ---------------------------------------------------------------------------
 *
 * A portfolio row is not a record. It is one customer seen across five tables —
 * their policies, the companies those sit with, the claims and endorsements open
 * against them, the payments not yet settled — and no repository owns that join.
 * `collection-desk.ts` is the established pattern for exactly this, so the join
 * happens here and the screen above it stays a `<WorkQueue>` configured.
 *
 * Because the rows are composed rather than stored, the URL's `ListQuery` has to
 * be run over them here too. `queryRows` is the same shape the repositories use
 * — named filters, one sort, one page — and an undeclared filter throws rather
 * than quietly matching everything, which is `renewal-desk`'s rule and the right
 * one: a filter that silently does nothing is a count nobody can reconcile.
 *
 * ---------------------------------------------------------------------------
 * What a portfolio row will not carry
 * ---------------------------------------------------------------------------
 *
 *   - No Aadhaar number. The last four digits at most, which is the whole of
 *     what the constitution permits in staff UI, and the field the customer
 *     record actually holds. `aadhaarNumber` is never read here.
 *   - No lifetime value, no expected renewal premium, no propensity score.
 *     `recordedPremium` is `sumMoney` over the final premiums that EXIST, and
 *     the row says how many policies that total covers and how many it does not.
 *   - No health or diagnosis text of any kind.
 */

import { sumMoney, zero } from '../../../domain/money'
import type { Money } from '../../../domain/money'
import { can } from '../../../domain/permissions'
import type { ScopedRecord, User } from '../../../domain/permissions'
import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
import type {
  Claim,
  Company,
  Customer,
  Endorsement,
  ListQuery,
  Page,
  Policy,
  Repositories,
} from '../../../data/repo'

/** Big enough to hold the whole in-memory set; a register reads the book. */
const SCAN_SIZE = 10_000

const EVERYTHING: ListQuery = { page: 1, pageSize: SCAN_SIZE }

/* ------------------------------------------------------------- local query */

type Reader<Row> = (row: Row) => string
type Comparable<Row> = (row: Row) => string | number

export type QuerySpec<Row> = {
  readonly search: readonly Reader<Row>[]
  readonly filters: Readonly<Record<string, Reader<Row>>>
  readonly sorts: Readonly<Record<string, Comparable<Row>>>
  readonly defaultSort: { readonly field: string; readonly direction: 'asc' | 'desc' }
  readonly noun: string
}

/**
 * The URL's query, run over composed rows.
 *
 * Deliberately the repository's own shape rather than a convenience: a register
 * has to behave like every other queue in the product — same parameters, same
 * paging, same reconstructible URL — and the fastest way for it not to is for
 * its list logic to be written differently.
 */
export function queryRows<Row>(
  rows: readonly Row[],
  spec: QuerySpec<Row>,
  query: ListQuery = {},
): Page<Row> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  const matched = rows.filter((row) => {
    if (needle !== '' && !spec.search.some((read) => read(row).toLowerCase().includes(needle))) {
      return false
    }
    for (const [key, selected] of Object.entries(filters)) {
      if (selected.length === 0) continue
      const read = spec.filters[key]
      if (!read) {
        throw new Error(
          `Unknown ${spec.noun} filter "${key}". A filter that quietly does nothing is a count nobody can reconcile.`,
        )
      }
      if (!selected.includes(read(row))) return false
    }
    return true
  })

  const sort = query.sort ?? spec.defaultSort
  const read = spec.sorts[sort.field] ?? spec.sorts[spec.defaultSort.field]
  const direction = sort.direction === 'desc' ? -1 : 1
  const ordered = [...matched].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
    return String(left).localeCompare(String(right)) * direction
  })

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(ordered.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return {
    rows: ordered.slice(start, start + pageSize),
    total: ordered.length,
    page,
    pageSize,
    pageCount,
  }
}

/* ----------------------------------------------------------------- scope */

function customerScope(customer: Customer): ScopedRecord {
  return {
    ownerId: customer.ownerId,
    ...(customer.agentId === null ? {} : { agentId: customer.agentId }),
    ...(customer.subAgentId === null ? {} : { subAgentId: customer.subAgentId }),
  }
}

function policyScope(policy: Policy): ScopedRecord {
  return {
    ...(policy.agentId === null ? {} : { agentId: policy.agentId }),
    ...(policy.subAgentId === null ? {} : { subAgentId: policy.subAgentId }),
    companyId: policy.companyId,
  }
}

/* ------------------------------------------------------- client portfolio */

/**
 * The states in which a policy is a HOLDING rather than a piece of paperwork.
 *
 * A portfolio answers "what does this person have with us", so a draft proposal
 * is not in it. The same set the reports desk calls premium-bearing, because two
 * screens disagreeing about what counts as held is how a total stops being
 * trusted.
 */
const HELD: readonly string[] = ['issued', 'dispatched', 'documents_collected', 'closed', 'locked']

/** In force, and therefore carrying a renewal date worth calling about. */
const IN_FORCE: readonly string[] = ['issued', 'dispatched', 'documents_collected']

/** A payment nobody has settled yet. The "still outstanding" half of the row. */
const UNSETTLED: readonly string[] = ['unpaid', 'reference_recorded', 'part_paid']

/** Claim states that mean the desk is still carrying it. */
function claimIsOpen(claim: Claim): boolean {
  return claim.state !== 'closed'
}

/** Endorsement states that mean somebody still owes a decision or a version. */
function endorsementIsOpen(endorsement: Endorsement): boolean {
  return endorsement.state !== 'policy_versioned' && endorsement.state !== 'refund_not_eligible'
}

export type PortfolioRow = {
  readonly customerId: string
  readonly systemNo: string
  readonly name: string
  readonly mobile: string
  readonly city: string
  /** Last four digits at most. The full number is never read, here or anywhere. */
  readonly aadhaarLast4: string | null
  readonly kycState: string
  readonly consentState: string
  readonly ownerId: string
  /** Policies held, in the states that mean held. */
  readonly policyCount: number
  /** Company short names, in the order the companies list carries them. */
  readonly companies: readonly string[]
  readonly companyIds: readonly string[]
  /** The sum of the final premiums recorded on those policies. Never a projection. */
  readonly recordedPremium: Money
  readonly premiumRecordedOn: number
  /** Held policies with no final premium typed in. Absent, not zero. */
  readonly premiumMissingOn: number
  /** The earliest recorded expiry across the in-force policies. */
  readonly nextExpiry: string | null
  /** In-force policies whose recorded expiry falls inside ninety days. */
  readonly expiringIn90: number
  readonly openClaims: number
  readonly openEndorsements: number
  /** Held policies whose payment state is not settled. */
  readonly unsettledPayments: number
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function portfolioRowFor(
  customer: Customer,
  policies: readonly Policy[],
  claims: readonly Claim[],
  endorsements: readonly Endorsement[],
  companies: ReadonlyMap<string, Company>,
  today: string,
): PortfolioRow {
  const held = policies.filter((policy) => HELD.includes(policy.status))
  const inForce = held.filter((policy) => IN_FORCE.includes(policy.status))

  const recorded = held
    .map((policy) => policy.finalPremium)
    .filter((amount): amount is Money => amount !== null)

  const expiries = inForce
    .map((policy) => policy.expiryDate)
    .filter((date): date is string => date !== null)
    .sort()

  const ninety = addDays(today, 90)
  const companyIds = [...new Set(held.map((policy) => policy.companyId))]

  return {
    customerId: customer.id,
    systemNo: customer.systemNo,
    name: customer.fullName,
    mobile: customer.mobile,
    city: customer.city,
    aadhaarLast4: customer.aadhaarLast4,
    kycState: customer.kycState,
    consentState: customer.consentState,
    ownerId: customer.ownerId,
    policyCount: held.length,
    companies: companyIds.map((id) => companies.get(id)?.shortName ?? id),
    companyIds,
    recordedPremium: recorded.length === 0 ? zero() : sumMoney(recorded),
    premiumRecordedOn: recorded.length,
    premiumMissingOn: held.length - recorded.length,
    nextExpiry: expiries[0] ?? null,
    expiringIn90: expiries.filter((date) => date >= today && date <= ninety).length,
    openClaims: claims.filter(claimIsOpen).length,
    openEndorsements: endorsements.filter(endorsementIsOpen).length,
    unsettledPayments: held.filter((policy) => UNSETTLED.includes(policy.paymentState)).length,
  }
}

export const PORTFOLIO_QUERY: QuerySpec<PortfolioRow> = {
  noun: 'portfolio',
  search: [(row) => row.name, (row) => row.mobile, (row) => row.systemNo, (row) => row.city],
  filters: {
    companyId: (row) => row.companyIds.join(','),
    kycState: (row) => row.kycState,
    consentState: (row) => row.consentState,
    // Three answers rather than a boolean, because "holds nothing" is a real and
    // useful narrowing on this register: it is the list of files nobody has sold
    // anything to yet.
    holding: (row) => (row.policyCount === 0 ? 'none' : row.expiringIn90 > 0 ? 'expiring' : 'held'),
    outstanding: (row) =>
      row.openClaims + row.openEndorsements + row.unsettledPayments > 0 ? 'open' : 'clear',
  },
  sorts: {
    name: (row) => row.name,
    policyCount: (row) => row.policyCount,
    nextExpiry: (row) => row.nextExpiry ?? '9999-12-31',
    recordedPremium: (row) => row.recordedPremium.paise,
  },
  defaultSort: { field: 'nextExpiry', direction: 'asc' },
}

/*
 * The company filter matches on a joined string of ids, so a customer holding
 * with two companies has to match either. `queryRows` compares with `includes`
 * over the selected values, which would fail on the joined form, so the filter
 * is applied before the query instead. Stated here rather than hidden in the
 * desk because it is the one place this register departs from the shape.
 */
function narrowByCompany(rows: readonly PortfolioRow[], query: ListQuery): {
  rows: readonly PortfolioRow[]
  query: ListQuery
} {
  const selected = query.filters?.companyId ?? []
  if (selected.length === 0) return { rows, query }

  const { companyId: _dropped, ...rest } = query.filters ?? {}
  void _dropped
  return {
    rows: rows.filter((row) => row.companyIds.some((id) => selected.includes(id))),
    query: { ...query, filters: rest },
  }
}

/* ----------------------------------------------------- endorsement register */

/**
 * An endorsement with the names a register reads by.
 *
 * The endorsement itself is carried whole rather than flattened, so the register
 * renders it through the same `figureOf` and label maps the endorsement module
 * already owns. Two copies of "what does a correction show in the money column"
 * is precisely how a non-financial endorsement acquires a premium field.
 */
export type EndorsementRegisterRow = {
  readonly endorsement: Endorsement
  readonly policySystemNo: string | null
  readonly policyInsurerNo: string | null
  readonly customerName: string | null
  readonly companyName: string | null
  readonly approverName: string | null
}

export const ENDORSEMENT_REGISTER_QUERY: QuerySpec<EndorsementRegisterRow> = {
  noun: 'endorsement',
  search: [
    (row) => row.endorsement.systemNo,
    (row) => row.endorsement.insurerEndorsementNo ?? '',
    (row) => row.policySystemNo ?? '',
    (row) => row.customerName ?? '',
  ],
  filters: {
    state: (row) => row.endorsement.state,
    type: (row) => row.endorsement.type,
    companyId: (row) => row.companyName ?? '',
    decided: (row) => (row.endorsement.approvedAt === null ? 'open' : 'decided'),
  },
  sorts: {
    effectiveFrom: (row) => row.endorsement.effectiveFrom ?? '',
    requestedAt: (row) => row.endorsement.requestedAt,
    systemNo: (row) => row.endorsement.systemNo,
  },
  defaultSort: { field: 'effectiveFrom', direction: 'desc' },
}

/* ------------------------------------------------------------------ desk */

export type RegistersDesk = {
  /** One row per customer this viewer may read, with the URL's query applied. */
  portfolio(user: User, today: string, query?: ListQuery): Promise<Page<PortfolioRow>>
  /** Every endorsement this viewer may read, with the URL's query applied. */
  endorsementRegister(user: User, query?: ListQuery): Promise<Page<EndorsementRegisterRow>>
  /** Company ids and names, for the filter controls. */
  companies(): Promise<readonly Company[]>
}

const CACHE = new WeakMap<Repositories, RegistersDesk>()

export function registersDesk(repositories: Repositories): RegistersDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

function buildDesk(repositories: Repositories): RegistersDesk {
  return {
    async companies() {
      const page = await repositories.companies.list(EVERYTHING)
      return page.rows
    },

    async portfolio(user, today, query) {
      const [customerPage, policyPage, claimPage, endorsementPage, companyPage] = await Promise.all([
        repositories.customers.list(EVERYTHING),
        repositories.policies.list(EVERYTHING),
        repositories.claims.list(EVERYTHING),
        repositories.endorsements.list(EVERYTHING),
        repositories.companies.list(EVERYTHING),
      ])

      // Scope is a property of the read, not a decoration the screen applies.
      // Every starter template grants `reports` at `level: 'all'`, so today this
      // filters nothing — which is exactly why it is here: the moment an admin
      // narrows a template, the register narrows with it.
      const customers = customerPage.rows.filter((customer) =>
        can(user, 'view', 'reports', customerScope(customer)),
      )
      const policies = policyPage.rows.filter((policy) =>
        can(user, 'view', 'reports', policyScope(policy)),
      )

      const companies = new Map(companyPage.rows.map((company) => [company.id, company]))
      const policiesBy = groupBy(policies, (policy) => policy.customerId)
      const claimsBy = groupBy(claimPage.rows, (claim) => claim.customerId)
      const endorsementsBy = groupBy(endorsementPage.rows, (row) => row.customerId)

      const rows = customers.map((customer) =>
        portfolioRowFor(
          customer,
          policiesBy.get(customer.id) ?? [],
          claimsBy.get(customer.id) ?? [],
          endorsementsBy.get(customer.id) ?? [],
          companies,
          today,
        ),
      )

      const narrowed = narrowByCompany(rows, query ?? {})
      return queryRows(narrowed.rows, PORTFOLIO_QUERY, narrowed.query)
    },

    async endorsementRegister(user, query) {
      const [endorsementPage, policyPage, customerPage, companyPage, staff] = await Promise.all([
        repositories.endorsements.list(EVERYTHING),
        repositories.policies.list(EVERYTHING),
        repositories.customers.list(EVERYTHING),
        repositories.companies.list(EVERYTHING),
        repositories.config.users(),
      ])

      const policies = new Map(policyPage.rows.map((policy) => [policy.id, policy]))
      const customers = new Map(customerPage.rows.map((customer) => [customer.id, customer]))
      const companies = new Map(companyPage.rows.map((company) => [company.id, company]))
      const people = new Map(staff.map((person) => [person.id, person.name]))

      const readable = endorsementPage.rows.filter((endorsement) => {
        const policy = policies.get(endorsement.policyId)
        return policy === undefined
          ? can(user, 'view', 'reports')
          : can(user, 'view', 'reports', policyScope(policy))
      })

      const rows: EndorsementRegisterRow[] = readable.map((endorsement) => {
        const policy = policies.get(endorsement.policyId) ?? null
        const company = policy === null ? null : (companies.get(policy.companyId) ?? null)
        return {
          endorsement,
          policySystemNo: policy?.systemNo ?? null,
          policyInsurerNo: policy?.insurerNo ?? null,
          customerName: customers.get(endorsement.customerId)?.fullName ?? null,
          companyName: company?.shortName ?? null,
          approverName:
            endorsement.approvedBy === null ? null : (people.get(endorsement.approvedBy) ?? null),
        }
      })

      return queryRows(rows, ENDORSEMENT_REGISTER_QUERY, query ?? {})
    },
  }
}

function groupBy<Row>(rows: readonly Row[], key: (row: Row) => string): Map<string, Row[]> {
  const map = new Map<string, Row[]>()
  for (const row of rows) {
    const bucket = map.get(key(row))
    if (bucket) bucket.push(row)
    else map.set(key(row), [row])
  }
  return map
}
