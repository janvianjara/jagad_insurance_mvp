import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  can,
  canSeeClass,
  RESOURCES,
  scopeFor,
  STARTER_TEMPLATES,
  visibleResources,
} from './permissions'
import type { PermissionTemplate, ScopedRecord, User } from './permissions'

function user(overrides: Partial<User> & { template: PermissionTemplate }): User {
  return {
    id: 'u-test',
    name: 'Test user',
    templateKey: overrides.template.key,
    ...overrides,
  }
}

const admin = user({ id: 'u-vivek', name: 'Vivek Jagad', template: STARTER_TEMPLATES.admin })

const manager = user({
  id: 'u-priya',
  name: 'Priya Desai',
  template: STARTER_TEMPLATES.salesManager,
  teamId: 'team-health',
})

const agent = user({
  id: 'u-kiran',
  name: 'Kiran Solanki',
  template: STARTER_TEMPLATES.agent,
  teamId: 'team-health',
  agentId: 'agent-kiran',
})

const subAgent = user({
  id: 'u-amit',
  name: 'Amit Rana',
  template: STARTER_TEMPLATES.subAgent,
  agentId: 'sub-amit',
  parentAgentId: 'agent-kiran',
})

const siblingSubAgent = user({
  id: 'u-sneha',
  name: 'Sneha Patel',
  template: STARTER_TEMPLATES.subAgent,
  agentId: 'sub-sneha',
  parentAgentId: 'agent-kiran',
})

const backOffice = user({
  id: 'u-nita',
  name: 'Nita Shah',
  template: STARTER_TEMPLATES.backOffice,
})

const amitsLead: ScopedRecord = {
  ownerId: 'u-amit',
  teamId: 'team-health',
  agentId: 'agent-kiran',
  subAgentId: 'sub-amit',
  companyId: 'co-hdfc-ergo',
  categoryId: 'cat-health',
}

const snehasLead: ScopedRecord = {
  ownerId: 'u-sneha',
  teamId: 'team-health',
  agentId: 'agent-kiran',
  subAgentId: 'sub-sneha',
  companyId: 'co-hdfc-ergo',
  categoryId: 'cat-health',
}

const otherTeamLead: ScopedRecord = {
  ownerId: 'u-rahul',
  teamId: 'team-motor',
  companyId: 'co-icici-lombard',
  categoryId: 'cat-motor',
}

describe('module-level grants', () => {
  it('denies a resource the template never granted', () => {
    expect(can(subAgent, 'view', 'commission')).toBe(false)
    expect(can(manager, 'view', 'config')).toBe(false)
  })

  it('denies an action the template did not grant on a resource it did', () => {
    expect(can(subAgent, 'view', 'inquiries')).toBe(true)
    expect(can(subAgent, 'edit', 'inquiries')).toBe(false)
    expect(can(manager, 'delete', 'quotations')).toBe(false)
  })

  it('gives the admin every action on every resource', () => {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        expect(can(admin, action, resource)).toBe(true)
      }
    }
    expect(visibleResources(admin)).toEqual([...RESOURCES])
  })

  it('lets the nav rail ask the module question without a record', () => {
    expect(visibleResources(subAgent)).toEqual(['inquiries', 'customers', 'wallet'])
  })
})

describe('scope: own', () => {
  it('denies a sub-agent a sibling sub-agent lead, which is the Assistant boundary too', () => {
    expect(can(subAgent, 'view', 'inquiries', amitsLead)).toBe(true)
    expect(can(subAgent, 'view', 'inquiries', snehasLead)).toBe(false)
    expect(can(siblingSubAgent, 'view', 'inquiries', amitsLead)).toBe(false)
  })

  it('defaults an ungranted scope to own rather than to everything', () => {
    const narrow: PermissionTemplate = {
      key: 'narrow',
      label: 'No scope declared',
      grants: { inquiries: ['view'] },
      scopes: {},
      dataClasses: ['operational', 'contact'],
    }
    const narrowUser = user({ id: 'u-narrow', template: narrow })

    expect(scopeFor(narrowUser, 'inquiries').level).toBe('own')
    expect(can(narrowUser, 'view', 'inquiries', { ownerId: 'u-narrow' })).toBe(true)
    expect(can(narrowUser, 'view', 'inquiries', amitsLead)).toBe(false)
  })

  it('extends an agent to the sub-agents reporting to them, but no further', () => {
    expect(can(agent, 'view', 'inquiries', amitsLead)).toBe(true)
    expect(can(agent, 'view', 'inquiries', snehasLead)).toBe(true)
    expect(can(agent, 'view', 'inquiries', otherTeamLead)).toBe(false)
  })

  it('does not extend a sub-agent to their own siblings just because they share an agent', () => {
    expect(scopeFor(subAgent, 'inquiries').includeSubAgents).toBeUndefined()
    expect(can(subAgent, 'view', 'customers', snehasLead)).toBe(false)
  })
})

describe('scope: team', () => {
  it('reaches every record on the team and nothing off it', () => {
    expect(can(manager, 'view', 'inquiries', amitsLead)).toBe(true)
    expect(can(manager, 'view', 'inquiries', snehasLead)).toBe(true)
    expect(can(manager, 'view', 'inquiries', otherTeamLead)).toBe(false)
  })

  it('still reaches the manager own records when the team is not stamped', () => {
    expect(can(manager, 'view', 'inquiries', { ownerId: 'u-priya' })).toBe(true)
  })
})

describe('scope: attributes', () => {
  it('narrows by company on top of the level', () => {
    const restricted = user({
      id: 'u-restricted',
      template: {
        ...STARTER_TEMPLATES.salesManager,
        key: 'salesManagerHdfc',
        scopes: {
          ...STARTER_TEMPLATES.salesManager.scopes,
          inquiries: { level: 'all', companies: ['co-hdfc-ergo'] },
        },
      },
    })

    expect(can(restricted, 'view', 'inquiries', amitsLead)).toBe(true)
    expect(can(restricted, 'view', 'inquiries', otherTeamLead)).toBe(false)
  })

  it('narrows by category, and an unstamped record fails a category-scoped test', () => {
    const healthOnly = user({
      id: 'u-health',
      template: {
        ...STARTER_TEMPLATES.salesManager,
        key: 'salesManagerHealth',
        scopes: {
          ...STARTER_TEMPLATES.salesManager.scopes,
          inquiries: { level: 'all', categories: ['cat-health'] },
        },
      },
    })

    expect(can(healthOnly, 'view', 'inquiries', amitsLead)).toBe(true)
    expect(can(healthOnly, 'view', 'inquiries', otherTeamLead)).toBe(false)
    expect(can(healthOnly, 'view', 'inquiries', { ownerId: 'u-health' })).toBe(false)
  })
})

describe('data classes', () => {
  it('lets every template read operational and contact fields', () => {
    for (const template of Object.values(STARTER_TEMPLATES)) {
      const holder = user({ id: `u-${template.key}`, template })
      expect(canSeeClass(holder, 'operational')).toBe(true)
      expect(canSeeClass(holder, 'contact')).toBe(true)
    }
  })

  it('masks sensitive values from a template without the grant', () => {
    expect(canSeeClass(agent, 'sensitive')).toBe(false)
    expect(canSeeClass(manager, 'sensitive')).toBe(false)
    expect(canSeeClass(subAgent, 'sensitive')).toBe(false)
  })

  it('gives the KYC desk and the admin the sensitive and document grants', () => {
    expect(canSeeClass(backOffice, 'sensitive')).toBe(true)
    expect(canSeeClass(backOffice, 'document-content')).toBe(true)
    expect(canSeeClass(admin, 'sensitive')).toBe(true)
  })

  it('grants document content without granting sensitive values', () => {
    const claims = user({ id: 'u-claims', template: STARTER_TEMPLATES.claims })

    expect(canSeeClass(claims, 'document-content')).toBe(true)
    expect(canSeeClass(claims, 'sensitive')).toBe(false)
  })

  it('is a separate axis from can(): permission to the record is not permission to the field', () => {
    expect(can(agent, 'view', 'customers', amitsLead)).toBe(true)
    expect(canSeeClass(agent, 'sensitive')).toBe(false)
  })
})
