/**
 * The Assistant's repository facade — plan §14.1, FR-22.3 and FR-22.13.
 *
 * Every method here returns a projection. Not an entity, not an entity with the
 * bad fields deleted, not a `Pick` written by hand at the call site — a value
 * built by `project()` from the allow-list. That is what "it has no route to an
 * entity" means in §14.1, and it is why the Assistant feature can be forbidden
 * from importing `src/domain` and `src/data/repo` at all: everything it needs
 * has an Assistant-facing type in `projection.ts`.
 *
 * Two gates, and they are not interchangeable — the comment in `permissions.ts`
 * makes the same point from the other side:
 *
 *   `can()`         decides WHICH RECORDS this user may read. The Assistant runs
 *                   as the requesting user, with no elevation, ever (FR-22.3).
 *                   A sub-agent asking about a sibling's customer gets nothing.
 *   the projection  decides WHICH FIELDS anybody's Assistant may read. An admin
 *                   holds the `sensitive` grant and sees an Aadhaar last-4 in the
 *                   UI; their Assistant still receives no such field, because the
 *                   allow-list has no opinion about who is asking.
 *
 * Both are needed. Neither substitutes for the other.
 *
 * Order of operations matters: scope-filter first, project second, paginate
 * third. Filtering after pagination would produce a page of five rows claiming a
 * total of forty — a count nobody can reconcile, and the queue-header bug
 * `Page.total` exists to prevent. The mock adapter holds everything in memory, so
 * the facade scans and pages itself; a real API would push the scope predicate
 * into the query and this file would shrink.
 */

import { can } from '../../domain/permissions'
import type { Resource, ScopedRecord, User } from '../../domain/permissions'
import type { Repositories } from '../repo'
import { DEFAULT_PAGE_SIZE } from '../repo/query'
import type { ListQuery, Page } from '../repo/query'
import { project, projectAll } from './projection'
import type {
  AssistantAgency,
  AssistantAgent,
  AssistantBenefitItem,
  AssistantCategory,
  AssistantClaim,
  AssistantCollection,
  AssistantCompany,
  AssistantConsent,
  AssistantCustomer,
  AssistantDeal,
  AssistantDocument,
  AssistantHousehold,
  AssistantInquiry,
  AssistantInstalment,
  AssistantMandate,
  AssistantMandateEvent,
  AssistantMember,
  AssistantMessage,
  AssistantPolicy,
  AssistantPolicyDraft,
  AssistantPolicyVersion,
  AssistantProduct,
  AssistantQuotation,
  AssistantQuotationLine,
  AssistantRenewal,
  AssistantSchedule,
  AssistantStaffUser,
  AssistantTask,
  AssistantTeam,
} from './projection'

/**
 * How many rows the facade pulls before scope-filtering. The mock store's largest
 * table is ~800 rows; this is deliberately larger so a scan is never silently
 * truncated, and it is a mock-adapter concern rather than a product limit.
 */
const SCOPE_SCAN_LIMIT = 10_000

/** A household, projected. Three lists, no entity among them. */
export type AssistantHouseholdView = {
  readonly household: AssistantHousehold
  readonly customers: readonly AssistantCustomer[]
  readonly members: readonly AssistantMember[]
}

export type AssistantRepository = {
  /** Whose eyes this facade reads with. Never swapped, never elevated. */
  readonly user: User

  /** False when this user's template grants no Assistant at all — a sub-agent, today. */
  readonly enabled: boolean

  customers(query?: ListQuery): Promise<Page<AssistantCustomer>>
  customer(id: string): Promise<AssistantCustomer | null>
  members(customerId: string): Promise<readonly AssistantMember[]>
  household(householdId: string): Promise<AssistantHouseholdView | null>
  consent(customerId: string): Promise<AssistantConsent | null>

  inquiries(query?: ListQuery): Promise<Page<AssistantInquiry>>
  inquiry(id: string): Promise<AssistantInquiry | null>

  quotations(query?: ListQuery): Promise<Page<AssistantQuotation>>
  quotation(id: string): Promise<AssistantQuotation | null>
  quotationLines(quotationId: string): Promise<readonly AssistantQuotationLine[]>

  deals(query?: ListQuery): Promise<Page<AssistantDeal>>
  deal(id: string): Promise<AssistantDeal | null>

  policies(query?: ListQuery): Promise<Page<AssistantPolicy>>
  policy(id: string): Promise<AssistantPolicy | null>
  policiesForCustomer(customerId: string): Promise<readonly AssistantPolicy[]>
  policyVersions(policyId: string): Promise<readonly AssistantPolicyVersion[]>
  policyDraft(policyId: string): Promise<AssistantPolicyDraft | null>

  schedule(policyId: string): Promise<AssistantSchedule | null>
  instalments(policyId: string): Promise<readonly AssistantInstalment[]>
  mandate(policyId: string): Promise<AssistantMandate | null>
  mandateEvents(policyId: string): Promise<readonly AssistantMandateEvent[]>
  collections(policyId: string): Promise<readonly AssistantCollection[]>

  /** Metadata only, and only for a subject this user may already read. */
  documents(subjectEntity: string, subjectId: string): Promise<readonly AssistantDocument[]>
  /** Which checklist items are present. Presence, never content (FR-22.14). */
  documentPresence(
    subjectEntity: string,
    subjectId: string,
  ): Promise<Readonly<Record<string, boolean>>>

  tasks(query?: ListQuery): Promise<Page<AssistantTask>>
  task(id: string): Promise<AssistantTask | null>
  renewals(query?: ListQuery): Promise<Page<AssistantRenewal>>

  claims(query?: ListQuery): Promise<Page<AssistantClaim>>
  claim(id: string): Promise<AssistantClaim | null>
  claimsForCustomer(customerId: string): Promise<readonly AssistantClaim[]>

  messages(subjectEntity: string, subjectId: string): Promise<readonly AssistantMessage[]>

  companies(): Promise<readonly AssistantCompany[]>
  products(): Promise<readonly AssistantProduct[]>
  benefitItems(): Promise<readonly AssistantBenefitItem[]>
  agencies(): Promise<readonly AssistantAgency[]>
  agents(): Promise<readonly AssistantAgent[]>
  staff(): Promise<readonly AssistantStaffUser[]>
  teams(): Promise<readonly AssistantTeam[]>
  categories(): Promise<readonly AssistantCategory[]>
}

/* ------------------------------------------------------------------ scoping */

/**
 * The attributes `can()` tests, lifted off a row. Entities carry `null` for an
 * absent owner and `ScopedRecord` speaks in `undefined`, so the two have to meet
 * somewhere; here is that somewhere.
 */
type ScopeSource = {
  readonly ownerId?: string | null
  readonly teamId?: string | null
  readonly companyId?: string | null
  readonly categoryId?: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
}

function scopeOf(row: ScopeSource, ownerOverride?: string | null): ScopedRecord {
  return {
    ownerId: (ownerOverride ?? row.ownerId) ?? undefined,
    teamId: row.teamId ?? undefined,
    companyId: row.companyId ?? undefined,
    categoryId: row.categoryId ?? undefined,
    agentId: row.agentId ?? undefined,
    subAgentId: row.subAgentId ?? undefined,
  }
}

function pageOf<T>(rows: readonly T[], query: ListQuery): Page<T> {
  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(rows.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize, pageCount }
}

function emptyPageOf<T>(query: ListQuery): Page<T> {
  return pageOf<T>([], query)
}

export function createAssistantRepository(
  repos: Repositories,
  user: User,
): AssistantRepository {
  /**
   * FR-22.3's outer ring. A template with no `assistant` grant has no Assistant,
   * and every method below answers empty rather than throwing — a refusal the
   * landing view renders, not an exception it has to catch.
   */
  const enabled = can(user, 'view', 'assistant')

  const mayRead = (resource: Resource, row?: ScopeSource, ownerOverride?: string | null) =>
    enabled && can(user, 'view', resource, row ? scopeOf(row, ownerOverride) : undefined)

  /** Reference data: a catalogue and a staff directory, carrying no owner to test. */
  const mayReadCatalogue = () => enabled

  async function scan<T>(
    read: (query: ListQuery) => Promise<Page<T>>,
    query: ListQuery,
  ): Promise<readonly T[]> {
    const scanned = await read({ ...query, page: 1, pageSize: SCOPE_SCAN_LIMIT })
    return scanned.rows
  }

  async function customerVisible(customerId: string): Promise<boolean> {
    const customer = await repos.customers.get(customerId)
    return customer !== null && mayRead('customers', customer)
  }

  async function policyVisible(policyId: string): Promise<boolean> {
    const policy = await repos.policies.get(policyId)
    return policy !== null && mayRead('policies', policy)
  }

  /**
   * A document is reached through the thing it is about, so the subject decides
   * who may see the metadata. An unrecognised subject is refused rather than
   * waved through: fail closed is the whole posture of this file.
   */
  async function subjectVisible(subjectEntity: string, subjectId: string): Promise<boolean> {
    if (!mayRead('documents')) return false

    if (subjectEntity === 'Customer') return customerVisible(subjectId)
    if (subjectEntity === 'Policy') return policyVisible(subjectId)
    if (subjectEntity === 'Claim') {
      const claim = await repos.claims.get(subjectId)
      return claim !== null && mayRead('claims', claim)
    }
    return false
  }

  return {
    user,
    enabled,

    /* ------------------------------------------------------------ customers */

    async customers(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.customers.list(q), query)
      const allowed = rows.filter((row) => mayRead('customers', row))
      return pageOf(projectAll('Customer', allowed), query)
    },

    async customer(id) {
      const row = await repos.customers.get(id)
      if (!row || !mayRead('customers', row)) return null
      return project('Customer', row)
    },

    async members(customerId) {
      if (!(await customerVisible(customerId))) return []
      return projectAll('Member', await repos.customers.members(customerId))
    },

    async household(householdId) {
      if (!enabled) return null
      const view = await repos.customers.household(householdId)
      if (!view) return null

      const customers = view.customers.filter((row) => mayRead('customers', row))
      if (customers.length === 0) return null

      const visible = new Set(customers.map((row) => row.id))
      return {
        household: project('Household', view.household),
        customers: projectAll('Customer', customers),
        members: projectAll(
          'Member',
          view.members.filter((member) => visible.has(member.customerId)),
        ),
      }
    },

    async consent(customerId) {
      if (!(await customerVisible(customerId))) return null
      const row = await repos.customers.consent(customerId)
      return row === null ? null : project('ConsentRecord', row)
    },

    /* --------------------------------------------------------------- demand */

    async inquiries(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.inquiries.list(q), query)
      return pageOf(
        projectAll('Inquiry', rows.filter((row) => mayRead('inquiries', row))),
        query,
      )
    },

    async inquiry(id) {
      const row = await repos.inquiries.get(id)
      if (!row || !mayRead('inquiries', row)) return null
      return project('Inquiry', row)
    },

    async quotations(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.quotations.list(q), query)
      return pageOf(
        projectAll('Quotation', rows.filter((row) => mayRead('quotations', row))),
        query,
      )
    },

    async quotation(id) {
      const row = await repos.quotations.get(id)
      if (!row || !mayRead('quotations', row)) return null
      return project('Quotation', row)
    },

    async quotationLines(quotationId) {
      const header = await repos.quotations.get(quotationId)
      if (!header || !mayRead('quotations', header)) return []
      return projectAll('QuotationLine', await repos.quotations.allLines(quotationId))
    },

    async deals(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.deals.list(q), query)
      return pageOf(projectAll('Deal', rows.filter((row) => mayRead('deals', row))), query)
    },

    async deal(id) {
      const row = await repos.deals.get(id)
      if (!row || !mayRead('deals', row)) return null
      return project('Deal', row)
    },

    /* ------------------------------------------------------------- contract */

    async policies(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.policies.list(q), query)
      return pageOf(projectAll('Policy', rows.filter((row) => mayRead('policies', row))), query)
    },

    async policy(id) {
      const row = await repos.policies.get(id)
      if (!row || !mayRead('policies', row)) return null
      return project('Policy', row)
    },

    async policiesForCustomer(customerId) {
      if (!(await customerVisible(customerId))) return []
      const rows = await repos.policies.forCustomer(customerId)
      return projectAll('Policy', rows.filter((row) => mayRead('policies', row)))
    },

    async policyVersions(policyId) {
      if (!(await policyVisible(policyId))) return []
      return projectAll('PolicyVersion', await repos.policies.versions(policyId))
    },

    async policyDraft(policyId) {
      if (!(await policyVisible(policyId))) return null
      const row = await repos.policies.draft(policyId)
      return row === null ? null : project('PolicyEntryDraft', row)
    },

    async schedule(policyId) {
      if (!(await policyVisible(policyId))) return null
      const row = await repos.schedules.forPolicy(policyId)
      return row === null ? null : project('PremiumSchedule', row)
    },

    async instalments(policyId) {
      if (!(await policyVisible(policyId))) return []
      const schedule = await repos.schedules.forPolicy(policyId)
      if (!schedule) return []
      return projectAll('InstalmentDue', await repos.schedules.instalments(schedule.id))
    },

    async mandate(policyId) {
      if (!(await policyVisible(policyId))) return null
      const row = await repos.schedules.mandate(policyId)
      return row === null ? null : project('Mandate', row)
    },

    async mandateEvents(policyId) {
      if (!(await policyVisible(policyId))) return []
      const mandate = await repos.schedules.mandate(policyId)
      if (!mandate) return []
      return projectAll('MandateEvent', await repos.schedules.mandateEvents(mandate.id))
    },

    async collections(policyId) {
      if (!(await policyVisible(policyId))) return []
      return projectAll('CollectionRecord', await repos.collections.forPolicy(policyId))
    },

    /* ------------------------------------------------------------ documents */

    async documents(subjectEntity, subjectId) {
      if (!(await subjectVisible(subjectEntity, subjectId))) return []
      return projectAll('Document', await repos.documents.forSubject(subjectEntity, subjectId))
    },

    async documentPresence(subjectEntity, subjectId) {
      if (!(await subjectVisible(subjectEntity, subjectId))) return {}
      return repos.documents.presence(subjectEntity, subjectId)
    },

    /* ----------------------------------------------------------------- work */

    async tasks(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.tasks.list(q), query)
      return pageOf(projectAll('Task', rows.filter((row) => mayRead('tasks', row))), query)
    },

    async task(id) {
      const row = await repos.tasks.get(id)
      if (!row || !mayRead('tasks', row)) return null
      return project('Task', row)
    },

    async renewals(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.renewals.list(q), query)
      // A renewal task carries an assignee rather than an owner; for scoping they
      // are the same fact, so `own` means "assigned to me" here.
      return pageOf(
        projectAll(
          'RenewalTask',
          rows.filter((row) => mayRead('renewals', {}, row.assigneeId)),
        ),
        query,
      )
    },

    async claims(query = {}) {
      if (!enabled) return emptyPageOf(query)
      const rows = await scan((q) => repos.claims.list(q), query)
      return pageOf(projectAll('Claim', rows.filter((row) => mayRead('claims', row))), query)
    },

    async claim(id) {
      const row = await repos.claims.get(id)
      if (!row || !mayRead('claims', row)) return null
      return project('Claim', row)
    },

    async claimsForCustomer(customerId) {
      if (!(await customerVisible(customerId))) return []
      const rows = await repos.claims.forCustomer(customerId)
      return projectAll('Claim', rows.filter((row) => mayRead('claims', row)))
    },

    async messages(subjectEntity, subjectId) {
      if (!(await subjectVisible(subjectEntity, subjectId))) return []
      return projectAll('MessageLog', await repos.config.messages(subjectEntity, subjectId))
    },

    /* ------------------------------------------------------------ catalogue */

    async companies() {
      if (!mayReadCatalogue()) return []
      const page = await repos.companies.list({ pageSize: SCOPE_SCAN_LIMIT })
      return projectAll('Company', page.rows)
    },

    async products() {
      if (!mayReadCatalogue()) return []
      const page = await repos.products.list({ pageSize: SCOPE_SCAN_LIMIT })
      return projectAll('Product', page.rows)
    },

    async benefitItems() {
      if (!mayReadCatalogue()) return []
      const page = await repos.benefits.list({ pageSize: SCOPE_SCAN_LIMIT })
      return projectAll('BenefitItem', page.rows)
    },

    async agencies() {
      if (!mayReadCatalogue()) return []
      const page = await repos.agencies.list({ pageSize: SCOPE_SCAN_LIMIT })
      return projectAll('Agency', page.rows)
    },

    async agents() {
      if (!mayReadCatalogue()) return []
      const page = await repos.agents.list({ pageSize: SCOPE_SCAN_LIMIT })
      return projectAll('Agent', page.rows)
    },

    async staff() {
      if (!mayReadCatalogue()) return []
      return projectAll('StaffUser', await repos.config.users())
    },

    async teams() {
      if (!mayReadCatalogue()) return []
      return projectAll('Team', await repos.config.teams())
    },

    async categories() {
      if (!mayReadCatalogue()) return []
      return projectAll('InquiryCategory', await repos.config.categories())
    },
  }
}
