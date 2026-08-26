/**
 * The navigation rail, as typed configuration — plan §3 "Navigation model".
 *
 * The prototype's `NAV` map transfers almost unchanged, with one rule added:
 * every item carries the permission it requires, so the rail is rendered by the
 * same `can()` evaluator that guards the routes. There is no second list of who
 * may see what, which is the only way the rail and the router cannot disagree.
 *
 * Two things are load-bearing here and neither is decoration.
 *
 * **Assistant is first in every role (decision D-G).** It is declared first in
 * all seven configurations below, and `/assistant` is the landing view. The
 * sub-agent is the apparent exception: D-G still puts the item first, and the
 * permission filter drops it because the sub-agent template grants no
 * `assistant` resource (§3's role table gives that role Leads / Customers /
 * Wallet). Configuration and permission each say their own thing; neither is
 * edited to agree with the other.
 *
 * **Counts are queue depths, not badges.** §3: "The nav counts are not
 * decoration — they are the queue depths that make U1 work, and must be live."
 * So a count is a function of the repositories and the signed-in user, resolved
 * at render against the same data the queue itself will show. Every one of them
 * asks for a single row and reads `total`, because `total` is the size of the
 * filtered set rather than of the page.
 */

import type { Repositories } from '../data/repo'
import { CLAIM_STATES, DEAL_STATES, INQUIRY_STATES, KYC_CONSENT_STATES, POLICY_STATES, QUOTATION_STATES, RENEWAL_STATES } from '../domain/workflows'
import { TASK_STATES } from '../data/repo'
import { can } from '../domain/permissions'
import type { Action, Resource, StarterTemplateKey, User } from '../domain/permissions'
import type { IconName } from '../ui/Icon'
import type { SubtleTone } from '../ui/tone'

/** A live queue depth. Resolved per render of the rail, per signed-in user. */
export type NavCount = (repositories: Repositories, user: User) => Promise<number>

export type NavItem = {
  readonly key: string
  readonly label: string
  readonly to: string
  readonly icon: IconName
  /** The permission key. `can(user, action, resource)` decides whether it renders. */
  readonly resource: Resource
  /** Defaults to `view`; `/inquiries/new` style items ask for `create`. */
  readonly action?: Action
  /** Exact-match highlighting, for a parent path that has children. */
  readonly end?: boolean
  readonly count?: NavCount
  /** What the number counts, spoken. "4" alone means nothing read aloud. */
  readonly countLabel?: string
  /** Lime when the number means something needs a person; neutral otherwise. */
  readonly countTone?: SubtleTone
}

export type NavSection = {
  readonly key: string
  readonly label: string
  readonly items: readonly NavItem[]
}

export type RoleNav = {
  readonly role: StarterTemplateKey
  /** §3's "Lands on" column. `/` resolves through here. */
  readonly landing: string
  readonly sections: readonly NavSection[]
}

/* ------------------------------------------------------------------ counts */

const OPEN_INQUIRIES = [
  INQUIRY_STATES.new,
  INQUIRY_STATES.assigned,
  INQUIRY_STATES.accepted,
  INQUIRY_STATES.reassigned,
  INQUIRY_STATES.escalated,
]

const LIVE_QUOTATIONS = [
  QUOTATION_STATES.draft,
  QUOTATION_STATES.composed,
  QUOTATION_STATES.generated,
  QUOTATION_STATES.shared,
  QUOTATION_STATES.revisionRequested,
]

const UNFINISHED_POLICIES = [POLICY_STATES.draft, POLICY_STATES.proposal, POLICY_STATES.sent]

const LIVE_CLAIMS = Object.values(CLAIM_STATES).filter((state) => state !== CLAIM_STATES.closed)

const POOLED_RENEWALS = [RENEWAL_STATES.inPool, RENEWAL_STATES.scheduled]

/** One row is enough: `total` reports the whole filtered set, not the page. */
const PROBE = { pageSize: 1 } as const

const openInquiries: NavCount = async (repositories) =>
  (await repositories.inquiries.list({ ...PROBE, filters: { status: OPEN_INQUIRIES } })).total

const myInquiries: NavCount = async (repositories, user) =>
  (
    await repositories.inquiries.list({
      ...PROBE,
      filters: { status: OPEN_INQUIRIES, ownerId: [user.id] },
    })
  ).total

const teamInquiries: NavCount = async (repositories, user) =>
  (
    await repositories.inquiries.list({
      ...PROBE,
      filters: user.teamId
        ? { status: OPEN_INQUIRIES, teamId: [user.teamId] }
        : { status: OPEN_INQUIRIES },
    })
  ).total

const unroutedInquiries: NavCount = async (repositories) =>
  (await repositories.inquiries.unrouted(PROBE)).total

const liveQuotations: NavCount = async (repositories) =>
  (await repositories.quotations.list({ ...PROBE, filters: { status: LIVE_QUOTATIONS } })).total

const myQuotations: NavCount = async (repositories, user) =>
  (
    await repositories.quotations.list({
      ...PROBE,
      filters: { status: LIVE_QUOTATIONS, ownerId: [user.id] },
    })
  ).total

const openDeals: NavCount = async (repositories) =>
  (
    await repositories.deals.list({
      ...PROBE,
      filters: { status: [DEAL_STATES.created, DEAL_STATES.lineItemsSet] },
    })
  ).total

const dealsAwaitingEntry: NavCount = async (repositories) =>
  (await repositories.deals.awaitingPolicyEntry(PROBE)).total

const allCustomers: NavCount = async (repositories) => (await repositories.customers.list(PROBE)).total

const myCustomers: NavCount = async (repositories, user) =>
  (await repositories.customers.list({ ...PROBE, filters: { ownerId: [user.id] } })).total

const livePolicies: NavCount = async (repositories) =>
  (await repositories.policies.list({ ...PROBE, filters: { status: [POLICY_STATES.issued] } })).total

const myPolicies: NavCount = async (repositories, user) =>
  (
    await repositories.policies.list({
      ...PROBE,
      filters: user.agentId
        ? { status: [POLICY_STATES.issued], agentId: [user.agentId] }
        : { status: [POLICY_STATES.issued] },
    })
  ).total

const unfinishedPolicies: NavCount = async (repositories) =>
  (await repositories.policies.list({ ...PROBE, filters: { status: UNFINISHED_POLICIES } })).total

const entryDrafts: NavCount = async (repositories) =>
  (await repositories.policies.completionQueue(PROBE)).total

const kycOutstanding: NavCount = async (repositories) =>
  (
    await repositories.customers.list({
      ...PROBE,
      filters: { kycState: [KYC_CONSENT_STATES.pending, KYC_CONSENT_STATES.partial] },
    })
  ).total

const documentsToReview: NavCount = async (repositories) =>
  (await repositories.documents.awaitingReview(PROBE)).total

const openTasks: NavCount = async (repositories) =>
  (await repositories.tasks.list({ ...PROBE, filters: { state: [TASK_STATES.open] } })).total

const myTasks: NavCount = async (repositories, user) =>
  (
    await repositories.tasks.list({
      ...PROBE,
      filters: { state: [TASK_STATES.open], ownerId: [user.id] },
    })
  ).total

const claimQueue: NavCount = async (repositories) =>
  (await repositories.claims.list({ ...PROBE, filters: { state: LIVE_CLAIMS } })).total

const renewalPool: NavCount = async (repositories) =>
  (await repositories.renewals.list({ ...PROBE, filters: { state: POOLED_RENEWALS } })).total

/* -------------------------------------------------------------- shared items */

const ASSISTANT: NavItem = {
  key: 'assistant',
  label: 'Assistant',
  to: '/assistant',
  icon: 'spark',
  resource: 'assistant',
  end: true,
}

const REFERENCE_CUSTOMERS: NavItem = {
  key: 'customers',
  label: 'Customers',
  to: '/customers',
  icon: 'users',
  resource: 'customers',
}

const REFERENCE_POLICIES: NavItem = {
  key: 'policies',
  label: 'Policies',
  to: '/policies',
  icon: 'shield',
  resource: 'policies',
}

const DOCUMENTS: NavItem = {
  key: 'documents',
  label: 'Documents',
  to: '/documents',
  icon: 'folder',
  resource: 'documents',
}

/* -------------------------------------------------------------- the six rails */

export const NAVIGATION: Readonly<Record<StarterTemplateKey, RoleNav>> = {
  admin: {
    role: 'admin',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'front-office',
        label: 'Front office',
        items: [
          {
            key: 'inquiries',
            label: 'Inquiries',
            to: '/inquiries',
            icon: 'inbox',
            resource: 'inquiries',
            count: openInquiries,
            countLabel: 'open inquiries',
            countTone: 'attn',
          },
          {
            // The rail carries the filter in the URL, which is the whole of what
            // a pinned queue is here — no second screen, no second query.
            key: 'inquiries-unrouted',
            label: 'Unrouted',
            to: '/inquiries?status=unrouted',
            icon: 'alert',
            resource: 'inquiries',
            count: unroutedInquiries,
            countLabel: 'inquiries nobody was routed',
            countTone: 'attn',
          },
          {
            key: 'quotations',
            label: 'Quotations',
            to: '/quotations',
            icon: 'doc',
            resource: 'quotations',
            count: liveQuotations,
            countLabel: 'live quotations',
          },
          {
            key: 'deals',
            label: 'Deals',
            to: '/deals',
            icon: 'book',
            resource: 'deals',
            count: openDeals,
            countLabel: 'open deals',
          },
          { ...REFERENCE_CUSTOMERS, count: allCustomers, countLabel: 'customers' },
        ],
      },
      {
        key: 'operations',
        label: 'Operations',
        items: [
          {
            key: 'policies',
            label: 'Policies',
            to: '/policies',
            icon: 'shield',
            resource: 'policies',
            count: livePolicies,
            countLabel: 'in-force policies',
          },
          {
            key: 'back-office',
            label: 'Back office',
            to: '/back-office',
            icon: 'grid',
            resource: 'backOffice',
            end: true,
            count: entryDrafts,
            countLabel: 'entries to finish',
            countTone: 'attn',
          },
          {
            key: 'renewals',
            label: 'Renewals',
            to: '/renewals',
            icon: 'clock',
            resource: 'renewals',
            count: renewalPool,
            countLabel: 'renewals in the pool',
          },
          {
            key: 'claims',
            label: 'Claims',
            to: '/claims',
            icon: 'alert',
            resource: 'claims',
            count: claimQueue,
            countLabel: 'live claims',
          },
          {
            key: 'endorsements',
            label: 'Endorsements',
            to: '/endorsements',
            icon: 'edit',
            resource: 'endorsements',
          },
          {
            key: 'tasks',
            label: 'Tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: openTasks,
            countLabel: 'open tasks',
          },
        ],
      },
      {
        key: 'money',
        label: 'Money',
        items: [
          {
            key: 'commission',
            label: 'Commission',
            to: '/commission',
            icon: 'coin',
            resource: 'commission',
            end: true,
          },
          { key: 'reports', label: 'Reports', to: '/reports', icon: 'chart', resource: 'reports' },
        ],
      },
      {
        key: 'records',
        label: 'Records',
        items: [{ ...DOCUMENTS, count: documentsToReview, countLabel: 'documents to review' }],
      },
      {
        key: 'configuration',
        label: 'Configuration',
        items: [
          { key: 'config-users', label: 'Users', to: '/config/users', icon: 'users', resource: 'config' },
          { key: 'config-masters', label: 'Masters', to: '/config/masters', icon: 'folder', resource: 'config' },
          { key: 'config-companies', label: 'Companies', to: '/config/companies', icon: 'building', resource: 'config' },
          { key: 'config-products', label: 'Products', to: '/config/products', icon: 'book', resource: 'config' },
          { key: 'config-benefits', label: 'Benefits', to: '/config/benefits', icon: 'grid', resource: 'config' },
          { key: 'config-agencies', label: 'Agencies', to: '/config/agencies', icon: 'building', resource: 'config' },
          { key: 'config-agents', label: 'Agents', to: '/config/agents', icon: 'users', resource: 'config' },
          { key: 'config-forms', label: 'Forms', to: '/config/forms', icon: 'edit', resource: 'config' },
          { key: 'config-templates', label: 'Templates', to: '/config/templates', icon: 'msg', resource: 'config' },
          { key: 'config-integrations', label: 'Integrations', to: '/config/integrations', icon: 'plug', resource: 'config' },
          { key: 'config-automation', label: 'Automation', to: '/config/automation', icon: 'spark', resource: 'config' },
          { key: 'config-compliance', label: 'Compliance', to: '/config/compliance', icon: 'lock', resource: 'config' },
        ],
      },
    ],
  },

  salesManager: {
    role: 'salesManager',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'front-office',
        label: 'Front office',
        items: [
          {
            key: 'inquiries',
            label: 'Pipeline',
            to: '/inquiries',
            icon: 'inbox',
            resource: 'inquiries',
            count: teamInquiries,
            countLabel: 'open inquiries in the team',
            countTone: 'attn',
          },
          {
            key: 'quotations',
            label: 'Quotations',
            to: '/quotations',
            icon: 'doc',
            resource: 'quotations',
            count: liveQuotations,
            countLabel: 'live quotations',
          },
          { key: 'deals', label: 'Deals', to: '/deals', icon: 'book', resource: 'deals', count: openDeals, countLabel: 'open deals' },
        ],
      },
      {
        key: 'my-work',
        label: 'My work',
        items: [
          {
            key: 'tasks',
            label: 'My tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: myTasks,
            countLabel: 'open tasks assigned to me',
            countTone: 'attn',
          },
          { key: 'reports', label: 'Reports', to: '/reports', icon: 'chart', resource: 'reports' },
        ],
      },
      {
        key: 'reference',
        label: 'Reference',
        items: [
          { ...REFERENCE_CUSTOMERS, count: allCustomers, countLabel: 'customers' },
          REFERENCE_POLICIES,
          DOCUMENTS,
        ],
      },
    ],
  },

  agent: {
    role: 'agent',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'my-book',
        label: 'My book',
        items: [
          {
            key: 'inquiries',
            label: 'My leads',
            to: '/inquiries',
            icon: 'inbox',
            resource: 'inquiries',
            count: myInquiries,
            countLabel: 'open leads assigned to me',
            countTone: 'attn',
          },
          {
            key: 'quotations',
            label: 'My quotations',
            to: '/quotations',
            icon: 'doc',
            resource: 'quotations',
            count: myQuotations,
            countLabel: 'live quotations of mine',
          },
          { key: 'deals', label: 'Deals', to: '/deals', icon: 'book', resource: 'deals' },
          { ...REFERENCE_CUSTOMERS, label: 'My customers', count: myCustomers, countLabel: 'customers of mine' },
          { ...REFERENCE_POLICIES, label: 'My policies', count: myPolicies, countLabel: 'in-force policies of mine' },
        ],
      },
      {
        key: 'money',
        label: 'Money',
        items: [
          {
            key: 'commission',
            label: 'Commission',
            to: '/commission',
            icon: 'coin',
            resource: 'commission',
            end: true,
          },
        ],
      },
      {
        key: 'reference',
        label: 'Reference',
        items: [
          {
            key: 'tasks',
            label: 'My tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: myTasks,
            countLabel: 'open tasks assigned to me',
          },
          DOCUMENTS,
        ],
      },
    ],
  },

  backOffice: {
    role: 'backOffice',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'my-queue',
        label: 'My queue',
        items: [
          {
            key: 'back-office',
            label: 'Work queue',
            to: '/back-office',
            icon: 'grid',
            resource: 'backOffice',
            end: true,
            count: entryDrafts,
            countLabel: 'entries to finish',
            countTone: 'attn',
          },
          {
            key: 'back-office-drafts',
            label: 'Drafts',
            to: '/back-office/drafts',
            icon: 'edit',
            resource: 'backOffice',
            count: unfinishedPolicies,
            countLabel: 'unfinished policies',
          },
          {
            key: 'back-office-kyc',
            label: 'KYC',
            to: '/back-office/kyc',
            icon: 'lock',
            resource: 'backOffice',
            count: kycOutstanding,
            countLabel: 'customers with KYC outstanding',
            countTone: 'attn',
          },
          {
            key: 'back-office-collections',
            label: 'Collections',
            to: '/back-office/collections',
            icon: 'coin',
            resource: 'backOffice',
          },
          {
            key: 'back-office-issuance',
            label: 'Issuance',
            to: '/back-office/issuance',
            icon: 'shield',
            resource: 'backOffice',
          },
          {
            key: 'back-office-ocr',
            label: 'OCR review',
            to: '/back-office/ocr-review',
            icon: 'search',
            resource: 'backOffice',
            count: documentsToReview,
            countLabel: 'documents to review',
            countTone: 'attn',
          },
        ],
      },
      {
        key: 'servicing',
        label: 'Servicing',
        items: [
          {
            key: 'policies',
            label: 'Policies',
            to: '/policies',
            icon: 'shield',
            resource: 'policies',
            count: livePolicies,
            countLabel: 'in-force policies',
          },
          {
            key: 'deals',
            label: 'Policy entry',
            to: '/deals',
            icon: 'book',
            resource: 'deals',
            count: dealsAwaitingEntry,
            countLabel: 'deals awaiting policy entry',
            countTone: 'attn',
          },
          {
            key: 'tasks',
            label: 'Tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: openTasks,
            countLabel: 'open tasks',
          },
        ],
      },
      {
        key: 'records',
        label: 'Records',
        items: [
          { ...REFERENCE_CUSTOMERS, count: allCustomers, countLabel: 'customers' },
          { ...DOCUMENTS, count: documentsToReview, countLabel: 'documents to review' },
        ],
      },
    ],
  },

  claims: {
    role: 'claims',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'claims',
        label: 'Claims',
        items: [
          {
            key: 'claims',
            label: 'Claim queue',
            to: '/claims',
            icon: 'alert',
            resource: 'claims',
            end: true,
            count: claimQueue,
            countLabel: 'live claims',
            countTone: 'attn',
          },
          {
            key: 'claims-new',
            label: 'Intimate a claim',
            to: '/claims/new',
            icon: 'plus',
            resource: 'claims',
            action: 'create',
          },
          {
            key: 'tasks',
            label: 'My tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: myTasks,
            countLabel: 'open tasks assigned to me',
          },
        ],
      },
      {
        key: 'reference',
        label: 'Reference',
        items: [REFERENCE_CUSTOMERS, REFERENCE_POLICIES, DOCUMENTS],
      },
    ],
  },

  renewals: {
    role: 'renewals',
    landing: '/assistant',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'renewals',
        label: 'Renewals',
        items: [
          {
            key: 'renewals',
            label: 'Renewal pool',
            to: '/renewals',
            icon: 'clock',
            resource: 'renewals',
            end: true,
            count: renewalPool,
            countLabel: 'renewals in the pool',
            countTone: 'attn',
          },
          {
            key: 'renewals-instalments',
            label: 'Instalments',
            to: '/renewals/instalments',
            icon: 'coin',
            resource: 'renewals',
          },
          {
            key: 'renewals-notices',
            label: 'Notices',
            to: '/renewals/notices',
            icon: 'msg',
            resource: 'renewals',
          },
        ],
      },
      {
        key: 'reference',
        label: 'Reference',
        items: [
          REFERENCE_CUSTOMERS,
          REFERENCE_POLICIES,
          {
            key: 'tasks',
            label: 'My tasks',
            to: '/tasks',
            icon: 'check',
            resource: 'tasks',
            count: myTasks,
            countLabel: 'open tasks assigned to me',
          },
        ],
      },
    ],
  },

  subAgent: {
    role: 'subAgent',
    // §3: "My leads (mobile-first)". The Assistant item is still declared first
    // per D-G; the permission filter removes it because this template does not
    // grant the resource, which is also why the landing is not /assistant.
    landing: '/inquiries',
    sections: [
      { key: 'assistant', label: 'Start here', items: [ASSISTANT] },
      {
        key: 'leads',
        label: 'Leads',
        items: [
          {
            key: 'inquiries',
            label: 'My leads',
            to: '/inquiries',
            icon: 'inbox',
            resource: 'inquiries',
            count: myInquiries,
            countLabel: 'open leads of mine',
            countTone: 'attn',
          },
          {
            key: 'inquiries-new',
            label: 'New lead',
            to: '/inquiries/new',
            icon: 'plus',
            resource: 'inquiries',
            action: 'create',
          },
        ],
      },
      {
        key: 'customers',
        label: 'Customers',
        items: [{ ...REFERENCE_CUSTOMERS, label: 'My customers', count: myCustomers, countLabel: 'customers of mine' }],
      },
      {
        key: 'wallet',
        label: 'Wallet',
        items: [{ key: 'wallet', label: 'Wallet', to: '/wallet', icon: 'wallet', resource: 'wallet' }],
      },
    ],
  },
}

/** The rail configuration for whoever is signed in, unfiltered. */
export function navigationFor(user: User): RoleNav {
  return NAVIGATION[user.templateKey as StarterTemplateKey] ?? NAVIGATION.subAgent
}

/**
 * The rail as this user may see it: items they cannot open are removed, and a
 * section left with nothing in it disappears rather than rendering a bare
 * heading.
 */
export function visibleNavigation(user: User): readonly NavSection[] {
  return navigationFor(user)
    .sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => can(user, item.action ?? 'view', item.resource)),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Where `/` sends this user. D-G makes that `/assistant` for every role that
 * holds the Assistant grant; a role that does not gets its own first item rather
 * than a refusal on the landing page.
 */
export function landingFor(user: User): string {
  const nav = navigationFor(user)
  if (can(user, 'view', 'assistant')) return nav.landing
  const first = visibleNavigation(user)[0]?.items[0]
  return first?.to ?? '/inquiries'
}
