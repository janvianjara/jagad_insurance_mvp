/**
 * Global record search — the one thing an agency desk does more often than
 * anything else, and the one thing the route map never named.
 *
 * A person on the phone has a name or a number and needs the record behind it.
 * Every queue in the product can already filter itself by free text, so the
 * capability existed; what did not exist was a way to ask all of them at once.
 * That is all this is: a fan-out over the repositories the signed-in user is
 * allowed to read, folded into one ranked, grouped answer.
 *
 * Three decisions are load-bearing.
 *
 * **It is an allow-list, not a filter.** A group is only queried when
 * `can(user, 'view', resource)` says so. Resources the user may not see are
 * never read, rather than read and then hidden — the same discipline the rail
 * and the router already share, and the only version that cannot leak a count.
 *
 * **A name finds policies.** `POLICY_LIST_SPEC` searches `systemNo` and
 * `insurerNo` only, so "Patel" matches no policy however many Patel holds. But
 * `customerId` is a declared filter, so resolving the name to customers first
 * and listing their policies second answers the question the person actually
 * asked. The composition lives here rather than in the repository because it is
 * a reading of two repositories, which is what a desk is for.
 *
 * **Nothing here reads a protected field.** Aadhaar is never a search term and
 * never a rendered one; the repositories' own search specs cover name, mobile
 * and record numbers, and this file adds no reader of its own.
 */

import { can } from '../../domain/permissions'
import type { Resource, User } from '../../domain/permissions'
import type { Repositories } from '../../data/repo'

/** How many rows a group shows before it defers to its queue. */
export const GROUP_LIMIT = 5

/** Below this, the fan-out is noise: two characters match most of the book. */
export const MIN_TERM_LENGTH = 2

export const SEARCH_KINDS = {
  customer: 'customer',
  policy: 'policy',
  inquiry: 'inquiry',
  quotation: 'quotation',
  deal: 'deal',
  claim: 'claim',
  task: 'task',
} as const

export type SearchKind = (typeof SEARCH_KINDS)[keyof typeof SEARCH_KINDS]

/**
 * One row of an answer.
 *
 * `systemNo` and `insurerNo` are separate because dual numbering is a product
 * invariant: the system number always exists, the insurer's arrives later, and a
 * search result is exactly where somebody is looking for the one they were
 * quoted on the phone.
 */
export type SearchHit = {
  readonly kind: SearchKind
  readonly id: string
  readonly systemNo: string
  readonly insurerNo: string | null
  /**
   * Whether this entity carries an insurer number at all. Distinguishes "the
   * insurer has not issued one yet", which `<RecordId>` says out loud, from "an
   * inquiry never has one", where saying it would be noise.
   */
  readonly carriesInsurerNo: boolean
  /** The human-readable identity: a person's name, or the record's subject. */
  readonly title: string
  /** One disambiguating fact — status, company, when. Never a protected field. */
  readonly detail: string
  /** Where Enter goes. */
  readonly to: string
}

export type SearchGroup = {
  readonly kind: SearchKind
  readonly label: string
  readonly hits: readonly SearchHit[]
  /** The size of the whole match, not of the page — so "5 of 41" is honest. */
  readonly total: number
  /** The queue, carrying the same term, for when five is not enough. */
  readonly seeAllTo: string
}

/** The permission each group is gated on. Read before the group is queried. */
const RESOURCE_FOR: Readonly<Record<SearchKind, Resource>> = {
  customer: 'customers',
  policy: 'policies',
  inquiry: 'inquiries',
  quotation: 'quotations',
  deal: 'deals',
  claim: 'claims',
  task: 'tasks',
}

const LABEL_FOR: Readonly<Record<SearchKind, string>> = {
  customer: 'Customers',
  policy: 'Policies',
  inquiry: 'Inquiries',
  quotation: 'Quotations',
  deal: 'Deals',
  claim: 'Claims',
  task: 'Tasks',
}

const QUEUE_FOR: Readonly<Record<SearchKind, string>> = {
  customer: '/customers',
  policy: '/policies',
  inquiry: '/inquiries',
  quotation: '/quotations',
  deal: '/deals',
  claim: '/claims',
  task: '/tasks',
}

/** The order groups are offered in: who a person asks about, then what they hold. */
export const GROUP_ORDER: readonly SearchKind[] = [
  SEARCH_KINDS.customer,
  SEARCH_KINDS.policy,
  SEARCH_KINDS.inquiry,
  SEARCH_KINDS.quotation,
  SEARCH_KINDS.deal,
  SEARCH_KINDS.claim,
  SEARCH_KINDS.task,
]

/** `q` is the queue's own search parameter, so a "see all" lands pre-filtered. */
function queueLink(kind: SearchKind, term: string): string {
  return `${QUEUE_FOR[kind]}?q=${encodeURIComponent(term)}`
}

const PROBE = { page: 1, pageSize: GROUP_LIMIT } as const

/**
 * Enough of a record number to be worth a policy-number lookup.
 *
 * Record numbers in this product are prefix-dash-digits (`POL-4437`), and
 * insurer numbers are long alphanumeric strings. Either way a term carrying a
 * digit is worth asking the policy repository directly; a term that is only
 * letters is a name, and the name path below handles it.
 */
function looksLikeANumber(term: string): boolean {
  return /\d/.test(term)
}

function dash(value: string | null | undefined): string {
  const text = (value ?? '').trim()
  return text === '' ? 'not recorded' : text
}

/**
 * Policies matching a term, by number and by holder.
 *
 * Two reads, deliberately. The repository's own search covers the numbers; the
 * name path resolves customers first and filters policies by the ids it found,
 * because `customerId` is a declared filter and a customer's name is not a
 * policy field. Merged by id so a policy matching both ways appears once.
 */
async function policyHits(
  repositories: Repositories,
  term: string,
): Promise<{ hits: readonly SearchHit[]; total: number }> {
  const byNumber = looksLikeANumber(term)
    ? await repositories.policies.list({ ...PROBE, search: term })
    : { rows: [], total: 0 }

  const holders = await repositories.customers.list({ page: 1, pageSize: 20, search: term })
  const byHolder =
    holders.rows.length > 0
      ? await repositories.policies.list({
          ...PROBE,
          filters: { customerId: holders.rows.map((customer) => customer.id) },
        })
      : { rows: [], total: 0 }

  const names = new Map(holders.rows.map((customer) => [customer.id, customer.fullName]))
  const merged = new Map<string, SearchHit>()

  for (const policy of [...byNumber.rows, ...byHolder.rows]) {
    if (merged.has(policy.id)) continue
    merged.set(policy.id, {
      kind: SEARCH_KINDS.policy,
      id: policy.id,
      systemNo: policy.systemNo,
      insurerNo: policy.insurerNo,
      carriesInsurerNo: true,
      title: names.get(policy.customerId) ?? policy.systemNo,
      detail: policy.status,
      to: `/policies/${policy.id}`,
    })
  }

  return {
    hits: [...merged.values()].slice(0, GROUP_LIMIT),
    // The two reads overlap, so the true total is unknowable without a third.
    // The larger of the two is the honest floor and never overstates a single
    // read, which is what the "of N" beside the group is claiming.
    total: Math.max(byNumber.total, byHolder.total),
  }
}

async function groupFor(
  kind: SearchKind,
  repositories: Repositories,
  term: string,
): Promise<SearchGroup | null> {
  const found = await hitsFor(kind, repositories, term)
  if (found.hits.length === 0) return null
  return {
    kind,
    label: LABEL_FOR[kind],
    hits: found.hits,
    total: found.total,
    seeAllTo: queueLink(kind, term),
  }
}

async function hitsFor(
  kind: SearchKind,
  repositories: Repositories,
  term: string,
): Promise<{ hits: readonly SearchHit[]; total: number }> {
  switch (kind) {
    case SEARCH_KINDS.customer: {
      const page = await repositories.customers.list({ ...PROBE, search: term })
      return {
        total: page.total,
        hits: page.rows.map((customer) => ({
          kind,
          id: customer.id,
          systemNo: customer.systemNo,
          insurerNo: null,
          carriesInsurerNo: false,
          title: customer.fullName,
          detail: dash(customer.mobile),
          to: `/customers/${customer.id}`,
        })),
      }
    }

    case SEARCH_KINDS.policy:
      return policyHits(repositories, term)

    case SEARCH_KINDS.inquiry: {
      const page = await repositories.inquiries.list({ ...PROBE, search: term })
      return {
        total: page.total,
        hits: page.rows.map((inquiry) => ({
          kind,
          id: inquiry.id,
          systemNo: inquiry.systemNo,
          insurerNo: null,
          carriesInsurerNo: false,
          title: dash(inquiry.contactName),
          detail: inquiry.status,
          to: `/inquiries/${inquiry.id}`,
        })),
      }
    }

    case SEARCH_KINDS.quotation: {
      const page = await repositories.quotations.list({ ...PROBE, search: term })
      const customers = await repositories.customers.getMany(
        page.rows.map((quotation) => quotation.customerId),
      )
      const names = new Map(customers.map((customer) => [customer.id, customer.fullName]))
      return {
        total: page.total,
        hits: page.rows.map((quotation) => ({
          kind,
          id: quotation.id,
          systemNo: quotation.systemNo,
          insurerNo: null,
          carriesInsurerNo: false,
          title: names.get(quotation.customerId) ?? quotation.systemNo,
          detail: quotation.status,
          to: `/quotations/${quotation.id}`,
        })),
      }
    }

    case SEARCH_KINDS.deal: {
      const page = await repositories.deals.list({ ...PROBE, search: term })
      const customers = await repositories.customers.getMany(page.rows.map((deal) => deal.customerId))
      const names = new Map(customers.map((customer) => [customer.id, customer.fullName]))
      return {
        total: page.total,
        hits: page.rows.map((deal) => ({
          kind,
          id: deal.id,
          systemNo: deal.systemNo,
          insurerNo: null,
          carriesInsurerNo: false,
          title: names.get(deal.customerId) ?? deal.systemNo,
          detail: deal.status,
          to: `/deals/${deal.id}`,
        })),
      }
    }

    case SEARCH_KINDS.claim: {
      const page = await repositories.claims.list({ ...PROBE, search: term })
      const customers = await repositories.customers.getMany(page.rows.map((claim) => claim.customerId))
      const names = new Map(customers.map((customer) => [customer.id, customer.fullName]))
      return {
        total: page.total,
        hits: page.rows.map((claim) => ({
          kind,
          id: claim.id,
          systemNo: claim.systemNo,
          insurerNo: claim.insurerNo,
          carriesInsurerNo: true,
          title: names.get(claim.customerId) ?? claim.systemNo,
          detail: claim.state,
          to: `/claims/${claim.id}`,
        })),
      }
    }

    case SEARCH_KINDS.task: {
      const page = await repositories.tasks.list({ ...PROBE, search: term })
      return {
        total: page.total,
        hits: page.rows.map((task) => ({
          kind,
          id: task.id,
          systemNo: task.systemNo,
          insurerNo: null,
          carriesInsurerNo: false,
          title: task.title,
          detail: task.state,
          to: '/tasks',
        })),
      }
    }
  }
}

/**
 * The answer, grouped and ordered, for whoever is asking.
 *
 * Groups the user may not view are never queried. Groups that matched nothing
 * are dropped rather than rendered empty — seven empty headings is not an
 * answer. A group that fails is dropped too: one repository refusing must not
 * cost the person the other six, and the failure is already visible as an
 * absent group rather than as a broken palette.
 */
export async function globalSearch(
  repositories: Repositories,
  user: User,
  rawTerm: string,
): Promise<readonly SearchGroup[]> {
  const term = rawTerm.trim()
  if (term.length < MIN_TERM_LENGTH) return []

  const allowed = GROUP_ORDER.filter((kind) => can(user, 'view', RESOURCE_FOR[kind]))

  const settled = await Promise.allSettled(
    allowed.map((kind) => groupFor(kind, repositories, term)),
  )

  return settled.flatMap((outcome) =>
    outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : [],
  )
}

/** Every hit across every group, in render order — what the arrow keys walk. */
export function flattenHits(groups: readonly SearchGroup[]): readonly SearchHit[] {
  return groups.flatMap((group) => group.hits)
}
