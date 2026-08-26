/**
 * Permissions — plan §7 "Permissions are state, and they gate rendering".
 *
 * FR-01.2/.3 make a role a permission template plus an attribute scope, and
 * FR-22.3 makes the Assistant run as the requesting user through this same
 * evaluator. One implementation serves nav items, route guards, toolbar buttons,
 * table columns, bulk actions and every Assistant read.
 *
 * Two axes, and they are not interchangeable:
 *   can()          decides WHICH RECORDS this user may touch.
 *   canSeeClass()  decides WHICH FIELD CLASSES this user may see.
 * An admin has permission to see an Aadhaar number and the Assistant still must
 * not receive one — that is why the projection (§14.1) sits beside this, not
 * inside it.
 */

import type { DataClass } from './dataclass'

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'assign',
  'approve',
  'export',
] as const
export type Action = (typeof ACTIONS)[number]

/** Module keys, one per §4 route group. */
export const RESOURCES = [
  'assistant',
  'inquiries',
  'quotations',
  'deals',
  'customers',
  'policies',
  'backOffice',
  'tasks',
  'renewals',
  'claims',
  'endorsements',
  'commission',
  'wallet',
  'documents',
  'reports',
  'config',
] as const
export type Resource = (typeof RESOURCES)[number]

export const SCOPE_LEVELS = ['own', 'team', 'all'] as const
export type ScopeLevel = (typeof SCOPE_LEVELS)[number]

/**
 * The attribute half of FR-01.3. `level` is the base reach; the optional keys
 * narrow it further, and they intersect — an agency-scoped sales manager sees
 * their team's records for their companies, not either alone.
 */
export type AbacScope = {
  readonly level: ScopeLevel
  /** Restrict to these company ids. Absent means every company. */
  readonly companies?: readonly string[]
  /** Restrict to these product-category ids. Absent means every category. */
  readonly categories?: readonly string[]
  /**
   * Extends `own` to records sourced by sub-agents reporting to this user. An
   * agent sees their sub-agents' book; a sub-agent never sees a sibling's.
   */
  readonly includeSubAgents?: boolean
}

export type PermissionTemplate = {
  readonly key: string
  readonly label: string
  /** Resource to the actions this template grants. An absent resource grants nothing. */
  readonly grants: Readonly<Partial<Record<Resource, readonly Action[]>>>
  /** Resource to its scope. An absent scope on a granted resource means `own`. */
  readonly scopes: Readonly<Partial<Record<Resource, AbacScope>>>
  /**
   * Field classes this template may see. `operational` and `contact` are implicit
   * for every template — without them nobody can read a queue. `sensitive` and
   * `document-content` are grants, listed explicitly or not held.
   */
  readonly dataClasses: readonly DataClass[]
}

export type User = {
  readonly id: string
  readonly name: string
  readonly templateKey: string
  readonly template: PermissionTemplate
  readonly teamId?: string
  /** Set when this user is an agent or sub-agent in the channel. */
  readonly agentId?: string
  /** Set when this user is a sub-agent; names the agent they report to. */
  readonly parentAgentId?: string
}

/**
 * The attributes a record must expose to be scope-tested. Every entity carries
 * these under the same names, which is why the evaluator needs no per-entity code.
 */
export type ScopedRecord = {
  readonly ownerId?: string
  readonly teamId?: string
  readonly companyId?: string
  readonly categoryId?: string
  readonly agentId?: string
  readonly subAgentId?: string
}

const ALWAYS_VISIBLE_CLASSES: readonly DataClass[] = ['operational', 'contact']

const DEFAULT_SCOPE: AbacScope = { level: 'own' }

function grantedActions(user: User, resource: Resource): readonly Action[] {
  return user.template.grants[resource] ?? []
}

export function scopeFor(user: User, resource: Resource): AbacScope {
  return user.template.scopes[resource] ?? DEFAULT_SCOPE
}

function withinLevel(user: User, scope: AbacScope, record: ScopedRecord): boolean {
  if (scope.level === 'all') return true

  const isOwn =
    (record.ownerId !== undefined && record.ownerId === user.id) ||
    (user.agentId !== undefined && record.agentId === user.agentId) ||
    (user.agentId !== undefined && record.subAgentId === user.agentId)

  if (scope.level === 'team') {
    const sharesTeam = user.teamId !== undefined && record.teamId === user.teamId
    return isOwn || sharesTeam
  }

  if (isOwn) return true

  // `own` widened to the sub-agents reporting to this user. The record names the
  // agent its sub-agent reports to, so a sibling sub-agent's record fails here.
  return (
    scope.includeSubAgents === true &&
    record.subAgentId !== undefined &&
    user.agentId !== undefined &&
    record.agentId === user.agentId
  )
}

function withinAttributes(scope: AbacScope, record: ScopedRecord): boolean {
  if (scope.companies && !(record.companyId && scope.companies.includes(record.companyId))) {
    return false
  }
  if (scope.categories && !(record.categoryId && scope.categories.includes(record.categoryId))) {
    return false
  }
  return true
}

/**
 * The evaluator. Without a record this answers the module question a nav item or
 * a route guard asks; with one it also runs the attribute test.
 */
export function can(
  user: User,
  action: Action,
  resource: Resource,
  record?: ScopedRecord,
): boolean {
  if (!grantedActions(user, resource).includes(action)) return false
  if (!record) return true

  const scope = scopeFor(user, resource)
  return withinLevel(user, scope, record) && withinAttributes(scope, record)
}

/** Drives `<MaskedValue>` and every column that carries a classified field (FR-01.4). */
export function canSeeClass(user: User, dataClass: DataClass): boolean {
  if (ALWAYS_VISIBLE_CLASSES.includes(dataClass)) return true
  return user.template.dataClasses.includes(dataClass)
}

/** Every resource this user may open at all — the nav rail reads this. */
export function visibleResources(user: User): Resource[] {
  return RESOURCES.filter((resource) => can(user, 'view', resource))
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value)
}

export function isResource(value: string): value is Resource {
  return (RESOURCES as readonly string[]).includes(value)
}

const ALL: readonly Action[] = ACTIONS
const READ: readonly Action[] = ['view']
const READ_WRITE: readonly Action[] = ['view', 'create', 'edit']

/**
 * Starter template library — the §3 role table expressed as templates. P-10a's
 * editor clones and edits these rather than inventing roles from nothing; they
 * are seed data, not a fixed role enum.
 */
export const STARTER_TEMPLATES = {
  admin: {
    key: 'admin',
    label: 'Admin — whole business',
    grants: Object.fromEntries(RESOURCES.map((resource) => [resource, ALL])) as Readonly<
      Partial<Record<Resource, readonly Action[]>>
    >,
    scopes: Object.fromEntries(
      RESOURCES.map((resource) => [resource, { level: 'all' } as AbacScope]),
    ) as Readonly<Partial<Record<Resource, AbacScope>>>,
    // The admin holds the sensitive grant; the Assistant still never receives
    // those fields, because the projection decides that, not this list.
    dataClasses: ['operational', 'contact', 'sensitive', 'document-content'],
  },

  salesManager: {
    key: 'salesManager',
    label: 'Sales manager — pipeline',
    grants: {
      assistant: READ,
      inquiries: ['view', 'create', 'edit', 'assign'],
      quotations: READ_WRITE,
      deals: READ_WRITE,
      customers: READ_WRITE,
      policies: READ,
      tasks: READ_WRITE,
      reports: ['view', 'export'],
      documents: READ,
    },
    scopes: {
      inquiries: { level: 'team' },
      quotations: { level: 'team' },
      deals: { level: 'team' },
      customers: { level: 'team' },
      policies: { level: 'team' },
      tasks: { level: 'team' },
      documents: { level: 'team' },
      reports: { level: 'all' },
    },
    dataClasses: ['operational', 'contact'],
  },

  agent: {
    key: 'agent',
    label: 'Agent — own book',
    grants: {
      assistant: READ,
      inquiries: READ_WRITE,
      quotations: READ_WRITE,
      deals: READ_WRITE,
      customers: READ_WRITE,
      policies: READ,
      commission: READ,
      tasks: READ_WRITE,
      documents: READ,
    },
    scopes: {
      inquiries: { level: 'own', includeSubAgents: true },
      quotations: { level: 'own', includeSubAgents: true },
      deals: { level: 'own', includeSubAgents: true },
      customers: { level: 'own', includeSubAgents: true },
      policies: { level: 'own', includeSubAgents: true },
      commission: { level: 'own', includeSubAgents: true },
      tasks: { level: 'own' },
      documents: { level: 'own', includeSubAgents: true },
    },
    dataClasses: ['operational', 'contact'],
  },

  subAgent: {
    key: 'subAgent',
    label: 'Sub-agent — own leads',
    grants: {
      inquiries: ['view', 'create'],
      customers: ['view', 'create'],
      wallet: READ,
    },
    scopes: {
      inquiries: { level: 'own' },
      customers: { level: 'own' },
      wallet: { level: 'own' },
    },
    dataClasses: ['operational', 'contact'],
  },

  backOffice: {
    key: 'backOffice',
    label: 'Back office — operations queue',
    grants: {
      assistant: READ,
      customers: READ_WRITE,
      policies: ['view', 'create', 'edit', 'approve'],
      backOffice: READ_WRITE,
      deals: READ,
      tasks: READ_WRITE,
      documents: READ_WRITE,
    },
    scopes: {
      customers: { level: 'all' },
      policies: { level: 'all' },
      backOffice: { level: 'all' },
      deals: { level: 'all' },
      tasks: { level: 'all' },
      documents: { level: 'all' },
    },
    // KYC review is this desk's job, so it holds both grants.
    dataClasses: ['operational', 'contact', 'sensitive', 'document-content'],
  },

  claims: {
    key: 'claims',
    label: 'Claims — claim queue',
    grants: {
      assistant: READ,
      claims: ['view', 'create', 'edit', 'approve'],
      customers: READ,
      policies: READ,
      tasks: READ_WRITE,
      documents: READ_WRITE,
    },
    scopes: {
      claims: { level: 'all' },
      customers: { level: 'all' },
      policies: { level: 'all' },
      tasks: { level: 'all' },
      documents: { level: 'all' },
    },
    dataClasses: ['operational', 'contact', 'document-content'],
  },

  renewals: {
    key: 'renewals',
    label: 'Renewals — renewal pool',
    grants: {
      assistant: READ,
      renewals: READ_WRITE,
      customers: READ,
      policies: READ,
      tasks: READ_WRITE,
    },
    scopes: {
      renewals: { level: 'all' },
      customers: { level: 'all' },
      policies: { level: 'all' },
      tasks: { level: 'all' },
    },
    dataClasses: ['operational', 'contact'],
  },
} as const satisfies Record<string, PermissionTemplate>

export type StarterTemplateKey = keyof typeof STARTER_TEMPLATES
