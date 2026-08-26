/**
 * THE ROUTE MAP — plan §4, transcribed.
 *
 * Every path the plan names is here, in §4's order, whether or not a screen
 * exists behind it. That is the point: navigation is complete from day one, an
 * escalation notice can link at a screen nobody has built, and the list of what
 * is left to build is the router rather than a document that drifts from it.
 * `routes.test.ts` parses §4 out of the plan and asserts nothing has been left
 * out, so this file cannot fall behind the spec silently.
 *
 * Three columns carry the meaning:
 *
 *   `resource`  the permission key the guard evaluates. `null` means the route
 *               deliberately carries no session — the tokenised pages, login,
 *               and the customer portal, which is a separate shell (D-I).
 *   `layout`    which shell it renders inside. `bare` never touches the session
 *               store or the app shell, per §11.1.
 *   `step`      the playbook step that will build it. Absent for the phases
 *               past M0 that no step has claimed.
 */

import type { Resource } from '../domain/permissions'
import type { Phase } from '../components/PlannedScreen/phase'

export const LAYOUTS = ['app', 'bare', 'portal'] as const
export type Layout = (typeof LAYOUTS)[number]

export type RouteSpec = {
  readonly path: string
  readonly title: string
  readonly phase: Phase
  readonly layout: Layout
  /** `null` where the route is deliberately unguarded. */
  readonly resource: Resource | null
  readonly step?: string
  readonly note?: string
}

export const ROUTE_MAP: readonly RouteSpec[] = [
  /* -------------------------------------------------------------- entry */
  {
    path: '/login',
    title: 'Sign in',
    phase: 'M0',
    layout: 'bare',
    resource: null,
    note: 'Sign-in is mocked in M0; the account is chosen from the rail footer.',
  },
  {
    path: '/login/2fa',
    title: 'Two-factor code',
    phase: 'M0',
    layout: 'bare',
    resource: null,
    step: 'P-10a',
    note: 'TOTP; the enforcement matrix is recorded in configuration.',
  },

  {
    path: '/assistant',
    title: 'Assistant',
    phase: 'M0',
    layout: 'app',
    resource: 'assistant',
    step: 'P-09',
    note: 'The landing view: the role’s queue briefing, generated from live counts.',
  },
  {
    path: '/assistant/:threadId',
    title: 'Conversation',
    phase: 'P1',
    layout: 'app',
    resource: 'assistant',
    note: 'A resumed conversation.',
  },

  /* ------------------------------------------------------- front office */
  {
    path: '/inquiries',
    title: 'Inquiries',
    phase: 'M0',
    layout: 'app',
    resource: 'inquiries',
    step: 'P-11',
    note: 'The queue: unassigned and TAT-at-risk pinned, bulk assign.',
  },
  {
    path: '/inquiries/new',
    title: 'New inquiry',
    phase: 'M0',
    layout: 'app',
    resource: 'inquiries',
    step: 'P-11',
    note: 'Minimal capture — a name and a mobile number are enough.',
  },
  {
    path: '/inquiries/:id',
    title: 'Inquiry',
    phase: 'M0',
    layout: 'app',
    resource: 'inquiries',
    step: 'P-11',
    note: 'Detail, assignment trail and the TAT clock.',
  },
  { path: '/quotations', title: 'Quotations', phase: 'M0', layout: 'app', resource: 'quotations', step: 'P-13' },
  {
    path: '/quotations/new',
    title: 'New quotation',
    phase: 'M0',
    layout: 'app',
    resource: 'quotations',
    step: 'P-13',
    note: 'The Composer — customer and policy selection.',
  },
  {
    path: '/quotations/:id',
    title: 'Quotation',
    phase: 'M0',
    layout: 'app',
    resource: 'quotations',
    step: 'P-13',
    note: 'Benefit matrix, versions and sharing.',
  },
  {
    path: '/quotations/:id/v/:version',
    title: 'Quotation version',
    phase: 'P1',
    layout: 'app',
    resource: 'quotations',
    note: 'An immutable prior version.',
  },
  {
    path: '/deals',
    title: 'Deals',
    phase: 'M0',
    layout: 'app',
    resource: 'deals',
    step: 'P-13',
    note: 'Not in §4’s list; the rail needs an index for the deals a role can see.',
  },
  { path: '/deals/:id', title: 'Deal', phase: 'M0', layout: 'app', resource: 'deals', step: 'P-13' },
  { path: '/customers', title: 'Customers', phase: 'M0', layout: 'app', resource: 'customers', step: 'P-14' },
  {
    path: '/customers/:id',
    title: 'Customer',
    phase: 'M0',
    layout: 'app',
    resource: 'customers',
    step: 'P-14',
    note: 'The 360: household, policies, documents, timeline.',
  },
  {
    path: '/customers/:id/consent',
    title: 'Consent ledger',
    phase: 'P1',
    layout: 'app',
    resource: 'customers',
    note: 'The staff view of the consent ledger.',
  },

  /* --------------------------------------------------------- operations */
  { path: '/policies', title: 'Policies', phase: 'M0', layout: 'app', resource: 'policies', step: 'P-15' },
  {
    path: '/policies/new',
    title: 'New policy',
    phase: 'M0',
    layout: 'app',
    resource: 'policies',
    step: 'P-15',
    note: 'Rendered from the product’s schema; ?dealId= pre-populates.',
  },
  { path: '/policies/:id', title: 'Policy', phase: 'M0', layout: 'app', resource: 'policies', step: 'P-15' },
  { path: '/policies/:id/versions', title: 'Policy versions', phase: 'P2', layout: 'app', resource: 'policies' },
  {
    path: '/policies/:id/schedule',
    title: 'Premium schedule',
    phase: 'P2',
    layout: 'app',
    resource: 'policies',
    note: 'Schedule, mandate and debit history (decision D-A).',
  },
  {
    path: '/back-office',
    title: 'Back office',
    phase: 'M0',
    layout: 'app',
    resource: 'backOffice',
    step: 'P-15',
    note: 'The work-queue home.',
  },
  { path: '/back-office/drafts', title: 'Drafts', phase: 'M0', layout: 'app', resource: 'backOffice', step: 'P-15' },
  { path: '/back-office/kyc', title: 'KYC', phase: 'M0', layout: 'app', resource: 'backOffice', step: 'P-14' },
  { path: '/back-office/collections', title: 'Collections', phase: 'P1', layout: 'app', resource: 'backOffice' },
  { path: '/back-office/issuance', title: 'Issuance', phase: 'P1', layout: 'app', resource: 'backOffice' },
  { path: '/back-office/ocr-review', title: 'OCR review', phase: 'P1', layout: 'app', resource: 'backOffice' },
  {
    path: '/tasks',
    title: 'Tasks',
    phase: 'P1',
    layout: 'app',
    resource: 'tasks',
    note: 'The polymorphic queue, push or pull per module.',
  },

  { path: '/renewals', title: 'Renewals', phase: 'P2', layout: 'app', resource: 'renewals', note: 'The pull pool.' },
  { path: '/renewals/:id', title: 'Renewal', phase: 'P2', layout: 'app', resource: 'renewals' },
  {
    path: '/renewals/instalments',
    title: 'Instalments',
    phase: 'P2',
    layout: 'app',
    resource: 'renewals',
    note: 'Dues this week, failed mandates, inside grace (decision D-A).',
  },
  {
    path: '/renewals/notices',
    title: 'Notices',
    phase: 'P2',
    layout: 'app',
    resource: 'renewals',
    note: 'Upload, extract, match, send all.',
  },
  { path: '/renewals/notices/:batchId', title: 'Notice batch', phase: 'P2', layout: 'app', resource: 'renewals' },
  { path: '/claims', title: 'Claims', phase: 'P2', layout: 'app', resource: 'claims' },
  { path: '/claims/new', title: 'Intimate a claim', phase: 'P2', layout: 'app', resource: 'claims' },
  { path: '/claims/:id', title: 'Claim', phase: 'P2', layout: 'app', resource: 'claims' },
  { path: '/endorsements', title: 'Endorsements', phase: 'P2', layout: 'app', resource: 'endorsements' },
  {
    path: '/endorsements/new',
    title: 'New endorsement',
    phase: 'P2',
    layout: 'app',
    resource: 'endorsements',
    note: 'The form reshapes by endorsement type.',
  },
  { path: '/endorsements/:id', title: 'Endorsement', phase: 'P2', layout: 'app', resource: 'endorsements' },

  /* ---------------------------------------------------- money & records */
  {
    path: '/commission',
    title: 'Commission',
    phase: 'P1',
    layout: 'app',
    resource: 'commission',
    step: 'P-16',
    note: 'The read-only ledger view.',
  },
  { path: '/commission/ledger', title: 'Commission ledger', phase: 'P3', layout: 'app', resource: 'commission' },
  { path: '/commission/payouts', title: 'Payouts', phase: 'P3', layout: 'app', resource: 'commission' },
  {
    path: '/wallet',
    title: 'Wallet',
    phase: 'P3',
    layout: 'app',
    resource: 'wallet',
    note: 'Sub-agent only, isolated by attribute scope.',
  },
  { path: '/documents', title: 'Documents', phase: 'P1', layout: 'app', resource: 'documents', note: 'The vault, filtered by access.' },
  { path: '/reports', title: 'Reports', phase: 'P1', layout: 'app', resource: 'reports' },
  { path: '/reports/:key', title: 'Report', phase: 'P1', layout: 'app', resource: 'reports' },

  /* -------------------------------------------------------- configuration */
  {
    path: '/config/users',
    title: 'Users',
    phase: 'M0',
    layout: 'app',
    resource: 'config',
    step: 'P-10a',
    note: 'Users, permission templates, attribute scopes, the 2FA matrix.',
  },
  { path: '/config/masters', title: 'Masters', phase: 'M0', layout: 'app', resource: 'config', step: 'P-10a' },
  {
    path: '/config/forms',
    title: 'Forms',
    phase: 'P1',
    layout: 'app',
    resource: 'config',
    step: 'P-12',
    note: 'The schema builder: stages, fields, branching, preview, versions.',
  },
  {
    path: '/config/companies',
    title: 'Companies',
    phase: 'M0',
    layout: 'app',
    resource: 'config',
    step: 'P-10b',
    note: 'Per line — a life company and a general company are separate records.',
  },
  {
    path: '/config/products',
    title: 'Products',
    phase: 'M0',
    layout: 'app',
    resource: 'config',
    step: 'P-10b',
    note: 'Products and the policy-to-benefit map.',
  },
  { path: '/config/benefits', title: 'Benefits', phase: 'M0', layout: 'app', resource: 'config', step: 'P-10b' },
  {
    path: '/config/agencies',
    title: 'Agencies',
    phase: 'M0',
    layout: 'app',
    resource: 'config',
    step: 'P-10b',
    note: 'Agency master: type, scope, commission percentages.',
  },
  {
    path: '/config/agents',
    title: 'Agents',
    phase: 'M0',
    layout: 'app',
    resource: 'config',
    step: 'P-10b',
    note: 'Agent percentage, sub-agent grant, share cap, direct-updates toggle.',
  },
  { path: '/config/templates', title: 'Message templates', phase: 'P1', layout: 'app', resource: 'config' },
  { path: '/config/integrations', title: 'Integrations', phase: 'P1', layout: 'app', resource: 'config' },
  { path: '/config/automation', title: 'Automation', phase: 'P1', layout: 'app', resource: 'config' },
  {
    path: '/config/compliance',
    title: 'Compliance',
    phase: 'P1',
    layout: 'app',
    resource: 'config',
    note: 'Consent, retention classes, audit search.',
  },

  /* ------------------------------------------------------------- portal */
  { path: '/portal', title: 'Customer portal', phase: 'P1', layout: 'portal', resource: null },
  { path: '/portal/policies', title: 'My policies', phase: 'P1', layout: 'portal', resource: null },
  { path: '/portal/documents', title: 'My documents', phase: 'P1', layout: 'portal', resource: null },
  { path: '/portal/claims', title: 'My claims', phase: 'P2', layout: 'portal', resource: null },
  { path: '/portal/claims/new', title: 'Raise a claim', phase: 'P2', layout: 'portal', resource: null },

  /* --------------------------------------------------------- tokenised */
  {
    path: '/consent/:token',
    title: 'Consent',
    phase: 'P1',
    layout: 'bare',
    resource: null,
    step: 'P-14',
    note: 'Login-free and expiring. Carries no session by design (§11.1).',
  },
  {
    path: '/upload/:token',
    title: 'Upload',
    phase: 'P2',
    layout: 'bare',
    resource: null,
    note: 'Login-free and expiring. Carries no session by design (§11.1).',
  },
]

export function routeSpec(path: string): RouteSpec | undefined {
  return ROUTE_MAP.find((route) => route.path === path)
}
