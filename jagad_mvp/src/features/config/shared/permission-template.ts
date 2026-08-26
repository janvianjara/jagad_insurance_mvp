/**
 * The permission-template editor's arithmetic — FR-01.2/.3, plan §7.
 *
 * Every function here is pure and every one returns a new template. That is the
 * whole design: `STARTER_TEMPLATES` is a shipped library an agency starts from,
 * and P-10a's rule is clone-and-edit, never mutate. A helper that took a
 * template and changed it in place would make that rule a convention; helpers
 * that can only build new objects make it a property of the code.
 *
 * `copyTemplate` copies the arrays as well as the record, so a clone shares no
 * structure at all with the starter it came from — otherwise `grants[resource]`
 * would still point at the frozen literal in `src/domain/permissions.ts`, and
 * the first `push` anyone wrote would edit the library for every agency.
 */

import { ACTIONS, RESOURCES, STARTER_TEMPLATES, can } from '../../../domain/permissions'
import type {
  AbacScope,
  Action,
  PermissionTemplate,
  Resource,
  ScopeLevel,
  User,
} from '../../../domain/permissions'
import type { DataClass } from '../../../domain/dataclass'
import type { ConfigTemplate } from './config-types'
import { TEMPLATE_ORIGINS } from './config-types'

/** Field classes a template may be granted. The other two are always visible. */
export const GRANTABLE_CLASSES: readonly DataClass[] = ['sensitive', 'document-content']

export const DATA_CLASS_LABELS: Readonly<Record<string, string>> = {
  operational: 'Operational',
  contact: 'Contact',
  sensitive: 'Sensitive (KYC, health, financial)',
  'document-content': 'Document content',
}

export const RESOURCE_LABELS: Readonly<Record<Resource, string>> = {
  assistant: 'Assistant',
  inquiries: 'Inquiries',
  quotations: 'Quotations',
  deals: 'Deals',
  customers: 'Customers',
  policies: 'Policies',
  backOffice: 'Back office',
  tasks: 'Tasks',
  renewals: 'Renewals',
  claims: 'Claims',
  endorsements: 'Endorsements',
  commission: 'Commission',
  wallet: 'Wallet',
  documents: 'Documents',
  reports: 'Reports',
  config: 'Configuration',
}

export const SCOPE_LEVEL_LABELS: Readonly<Record<ScopeLevel, string>> = {
  own: 'Own records',
  team: 'The team',
  all: 'Everything',
}

/* ------------------------------------------------------------------ copying */

function copyScope(scope: AbacScope): AbacScope {
  return {
    level: scope.level,
    ...(scope.companies ? { companies: [...scope.companies] } : {}),
    ...(scope.categories ? { categories: [...scope.categories] } : {}),
    ...(scope.includeSubAgents === undefined
      ? {}
      : { includeSubAgents: scope.includeSubAgents }),
  }
}

/** A structurally independent copy. Nothing is shared with the source. */
export function copyTemplate(source: PermissionTemplate): PermissionTemplate {
  const grants: Partial<Record<Resource, readonly Action[]>> = {}
  for (const [resource, actions] of Object.entries(source.grants)) {
    if (actions) grants[resource as Resource] = [...actions]
  }

  const scopes: Partial<Record<Resource, AbacScope>> = {}
  for (const [resource, scope] of Object.entries(source.scopes)) {
    if (scope) scopes[resource as Resource] = copyScope(scope)
  }

  return {
    key: source.key,
    label: source.label,
    grants,
    scopes,
    dataClasses: [...source.dataClasses],
  }
}

/** The shipped library, as library rows. Starters are never editable. */
export function starterLibrary(): readonly ConfigTemplate[] {
  return Object.values(STARTER_TEMPLATES).map((starter) => ({
    ...copyTemplate(starter),
    origin: TEMPLATE_ORIGINS.starter,
    clonedFrom: null,
    editable: false,
  }))
}

function uniqueKey(base: string, taken: readonly string[]): string {
  let candidate = `${base}-copy`
  let suffix = 2
  while (taken.includes(candidate)) {
    candidate = `${base}-copy-${suffix}`
    suffix += 1
  }
  return candidate
}

/**
 * Clone-and-edit, the only way a template is created. The copy is editable, it
 * remembers where it came from, and the source is returned untouched — the tests
 * assert exactly that against the starter library.
 */
export function cloneTemplate(
  source: PermissionTemplate,
  takenKeys: readonly string[],
): ConfigTemplate {
  const copy = copyTemplate(source)
  return {
    ...copy,
    key: uniqueKey(source.key, takenKeys),
    label: `${source.label} (copy)`,
    origin: TEMPLATE_ORIGINS.clone,
    clonedFrom: source.key,
    editable: true,
  }
}

/* ------------------------------------------------------------------ editing */

export function withLabel(template: ConfigTemplate, label: string): ConfigTemplate {
  return { ...template, label }
}

/**
 * Grants or withdraws one action. A resource granted its first action also gets
 * an explicit `own` scope, so the editor shows the reach the evaluator will
 * actually apply rather than leaving it implicit.
 */
export function withGrant(
  template: ConfigTemplate,
  resource: Resource,
  action: Action,
  granted: boolean,
): ConfigTemplate {
  const held = template.grants[resource] ?? []
  const next = granted
    ? ACTIONS.filter((candidate) => candidate === action || held.includes(candidate))
    : held.filter((candidate) => candidate !== action)

  const grants: Partial<Record<Resource, readonly Action[]>> = { ...template.grants }
  const scopes: Partial<Record<Resource, AbacScope>> = { ...template.scopes }

  if (next.length === 0) {
    delete grants[resource]
    delete scopes[resource]
  } else {
    grants[resource] = next
    if (!scopes[resource]) scopes[resource] = { level: 'own' }
  }

  return { ...template, grants, scopes }
}

function withScope(
  template: ConfigTemplate,
  resource: Resource,
  scope: AbacScope,
): ConfigTemplate {
  return { ...template, scopes: { ...template.scopes, [resource]: scope } }
}

export function scopeOf(template: ConfigTemplate, resource: Resource): AbacScope {
  return template.scopes[resource] ?? { level: 'own' }
}

export function withScopeLevel(
  template: ConfigTemplate,
  resource: Resource,
  level: ScopeLevel,
): ConfigTemplate {
  return withScope(template, resource, { ...scopeOf(template, resource), level })
}

/**
 * The three narrowings, each rebuilt rather than patched. An empty selection
 * means "every company", so it is stored as an absent key — the evaluator reads
 * an absent list as no restriction, and a present empty one would read as
 * "no company at all".
 */
function narrowed(
  scope: AbacScope,
  next: {
    companies?: readonly string[]
    categories?: readonly string[]
    includeSubAgents?: boolean
  },
): AbacScope {
  const companies = next.companies ?? scope.companies ?? []
  const categories = next.categories ?? scope.categories ?? []
  const subAgents = next.includeSubAgents ?? scope.includeSubAgents ?? false

  return {
    level: scope.level,
    ...(companies.length > 0 ? { companies: [...companies] } : {}),
    ...(categories.length > 0 ? { categories: [...categories] } : {}),
    ...(subAgents ? { includeSubAgents: true } : {}),
  }
}

export function withScopeCompanies(
  template: ConfigTemplate,
  resource: Resource,
  companies: readonly string[],
): ConfigTemplate {
  return withScope(template, resource, narrowed(scopeOf(template, resource), { companies }))
}

export function withScopeCategories(
  template: ConfigTemplate,
  resource: Resource,
  categories: readonly string[],
): ConfigTemplate {
  return withScope(template, resource, narrowed(scopeOf(template, resource), { categories }))
}

export function withSubAgentReach(
  template: ConfigTemplate,
  resource: Resource,
  includeSubAgents: boolean,
): ConfigTemplate {
  return withScope(
    template,
    resource,
    narrowed(scopeOf(template, resource), { includeSubAgents }),
  )
}

export function withDataClass(
  template: ConfigTemplate,
  dataClass: DataClass,
  held: boolean,
): ConfigTemplate {
  const current = template.dataClasses.filter((candidate) => candidate !== dataClass)
  return { ...template, dataClasses: held ? [...current, dataClass] : current }
}

/* ----------------------------------------------------------------- reading */

/** Modules this template opens at all — the same question the nav rail asks. */
export function grantedResources(template: PermissionTemplate): readonly Resource[] {
  return RESOURCES.filter((resource) => (template.grants[resource] ?? []).length > 0)
}

export function actionsOn(template: PermissionTemplate, resource: Resource): readonly Action[] {
  return template.grants[resource] ?? []
}

/** One line for a library card: how much of the product this template opens. */
export function templateReach(template: PermissionTemplate): string {
  const modules = grantedResources(template).length
  if (modules === 0) return 'Opens nothing'
  const sensitive = template.dataClasses.filter((held) =>
    GRANTABLE_CLASSES.includes(held),
  ).length
  const classes = sensitive === 0 ? 'operational and contact fields only' : `${sensitive} sensitive class${sensitive === 1 ? '' : 'es'}`
  return `${modules} of ${RESOURCES.length} modules, ${classes}`
}

/* --------------------------------------------------------------- previewing */

export type TemplateChange = {
  readonly key: string
  readonly label: string
  readonly from: string
  readonly to: string
}

function describeGrant(template: PermissionTemplate, resource: Resource): string {
  const actions = actionsOn(template, resource)
  if (actions.length === 0) return 'no access'
  const scope = template.scopes[resource]?.level ?? 'own'
  return `${actions.join(', ')} · ${SCOPE_LEVEL_LABELS[scope].toLowerCase()}`
}

/**
 * What saving this edit changes, resource by resource, in the shape
 * `<ConfirmGate>` previews. An empty list disables Confirm, which is exactly
 * right for a save that would change nothing.
 */
export function templateChanges(
  before: PermissionTemplate,
  after: PermissionTemplate,
): readonly TemplateChange[] {
  const changes: TemplateChange[] = []

  if (before.label !== after.label) {
    changes.push({ key: 'label', label: 'Name', from: before.label, to: after.label })
  }

  for (const resource of RESOURCES) {
    const from = describeGrant(before, resource)
    const to = describeGrant(after, resource)
    if (from !== to) {
      changes.push({ key: `grant-${resource}`, label: RESOURCE_LABELS[resource], from, to })
    }
  }

  for (const dataClass of GRANTABLE_CLASSES) {
    const from = before.dataClasses.includes(dataClass)
    const to = after.dataClasses.includes(dataClass)
    if (from !== to) {
      changes.push({
        key: `class-${dataClass}`,
        label: DATA_CLASS_LABELS[dataClass] ?? dataClass,
        from: from ? 'visible' : 'hidden',
        to: to ? 'visible' : 'hidden',
      })
    }
  }

  return changes
}

/**
 * What assigning a different template does to one person, said in terms of what
 * they will see — the nav rail is rendered by the same `can()` this reads, so
 * the preview and the consequence cannot disagree.
 */
export function assignmentChanges(
  user: User,
  next: ConfigTemplate,
): readonly TemplateChange[] {
  const before = user.template
  if (before.key === next.key) return []

  const gained = RESOURCES.filter(
    (resource) => !can(user, 'view', resource) && (next.grants[resource] ?? []).includes('view'),
  )
  const lost = RESOURCES.filter(
    (resource) => can(user, 'view', resource) && !(next.grants[resource] ?? []).includes('view'),
  )

  const changes: TemplateChange[] = [
    { key: 'template', label: 'Permission template', from: before.label, to: next.label },
  ]

  if (gained.length > 0) {
    changes.push({
      key: 'gained',
      label: 'Modules that appear',
      from: 'not in the rail',
      to: gained.map((resource) => RESOURCE_LABELS[resource]).join(', '),
    })
  }
  if (lost.length > 0) {
    changes.push({
      key: 'lost',
      label: 'Modules that disappear',
      from: lost.map((resource) => RESOURCE_LABELS[resource]).join(', '),
      to: 'no longer in the rail',
    })
  }

  return changes
}
