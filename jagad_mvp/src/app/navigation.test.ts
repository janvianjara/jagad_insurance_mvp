import { beforeAll, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../data/mock'
import type { Repositories } from '../data/repo'
import { STARTER_TEMPLATES, can } from '../domain/permissions'
import type { StarterTemplateKey, User } from '../domain/permissions'
import { NAVIGATION, landingFor, navigationFor, visibleNavigation } from './navigation'

const ROLES = Object.keys(STARTER_TEMPLATES) as StarterTemplateKey[]

function userFor(role: StarterTemplateKey): User {
  return {
    id: `user-${role}`,
    name: role,
    templateKey: role,
    template: STARTER_TEMPLATES[role],
    teamId: 'team-sales',
    agentId: 'agent-kiran',
  }
}

let repositories: Repositories

beforeAll(() => {
  repositories = createMockRepositories({ latency: NO_LATENCY })
})

describe('navigation configuration', () => {
  it('covers every starter template', () => {
    expect(Object.keys(NAVIGATION).sort()).toEqual([...ROLES].sort())
  })

  // Decision D-G: the Assistant is the first item in every role's rail.
  it.each(ROLES)('puts the Assistant first for %s', (role) => {
    const first = navigationFor(userFor(role)).sections[0]?.items[0]
    expect(first?.key).toBe('assistant')
    expect(first?.to).toBe('/assistant')
  })

  it('lands every role that holds the Assistant grant on /assistant', () => {
    for (const role of ROLES) {
      const user = userFor(role)
      if (can(user, 'view', 'assistant')) expect(landingFor(user)).toBe('/assistant')
    }
  })

  it('does not land the sub-agent on a screen the template refuses', () => {
    const subAgent = userFor('subAgent')
    expect(can(subAgent, 'view', 'assistant')).toBe(false)
    expect(landingFor(subAgent)).toBe('/inquiries')
  })

  it('gives every item a unique key inside its role', () => {
    for (const role of ROLES) {
      const keys = navigationFor(userFor(role)).sections.flatMap((section) =>
        section.items.map((item) => `${section.key}/${item.key}`),
      )
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('permission filtering', () => {
  it('renders only what the role may open', () => {
    for (const role of ROLES) {
      const user = userFor(role)
      for (const section of visibleNavigation(user)) {
        for (const item of section.items) {
          expect(can(user, item.action ?? 'view', item.resource)).toBe(true)
        }
      }
    }
  })

  it('drops the Assistant for the sub-agent, and only for the sub-agent', () => {
    for (const role of ROLES) {
      const keys = visibleNavigation(userFor(role)).flatMap((section) =>
        section.items.map((item) => item.key),
      )
      expect(keys.includes('assistant')).toBe(role !== 'subAgent')
    }
  })

  it('never renders an empty section heading', () => {
    for (const role of ROLES) {
      for (const section of visibleNavigation(userFor(role))) {
        expect(section.items.length).toBeGreaterThan(0)
      }
    }
  })

  it('gives the admin configuration and the agent none', () => {
    const adminKeys = visibleNavigation(userFor('admin')).flatMap((section) =>
      section.items.map((item) => item.key),
    )
    const agentKeys = visibleNavigation(userFor('agent')).flatMap((section) =>
      section.items.map((item) => item.key),
    )

    expect(adminKeys).toContain('config')
    expect(agentKeys).not.toContain('config')
  })

  /*
   * The rail has to fit on the screen it is drawn on. Twenty-six items did not:
   * at 1440x900 it cut off mid-item, and everything under Configuration was
   * unreachable without a scroll nothing advertised.
   *
   * The bound is deliberately generous — this is a guard against the rail
   * quietly growing back, not a design constraint on any one role.
   */
  it('keeps every role’s rail short enough to fit on one screen', () => {
    for (const role of ROLES) {
      const items = visibleNavigation(userFor(role)).flatMap((section) => section.items)
      expect(items.length, `${role} rail`).toBeLessThanOrEqual(16)
    }
  })
})

describe('live counts', () => {
  it('resolves every declared count against the repositories', async () => {
    for (const role of ROLES) {
      const user = userFor(role)
      for (const section of visibleNavigation(user)) {
        for (const item of section.items) {
          if (!item.count) continue
          const depth = await item.count(repositories, user)
          expect(Number.isInteger(depth), `${role}/${item.key} returned ${depth}`).toBe(true)
          expect(depth).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('reads a real queue depth rather than a constant', async () => {
    const admin = userFor('admin')
    const inquiries = visibleNavigation(admin)
      .flatMap((section) => section.items)
      .find((item) => item.key === 'inquiries')

    const depth = await inquiries?.count?.(repositories, admin)
    const open = await repositories.inquiries.list({
      pageSize: 1,
      filters: { status: ['new', 'assigned', 'accepted', 'reassigned', 'escalated'] },
    })

    expect(depth).toBe(open.total)
    expect(depth).toBeGreaterThan(0)
  })

  it('scopes an agent count to that agent', async () => {
    const agent = userFor('agent')
    const leads = visibleNavigation(agent)
      .flatMap((section) => section.items)
      .find((item) => item.key === 'inquiries')

    const mine = await leads?.count?.(repositories, agent)
    const everyone = await repositories.inquiries.list({ pageSize: 1 })

    expect(mine).toBeLessThanOrEqual(everyone.total)
  })

  it('gives every count a spoken label', () => {
    for (const role of ROLES) {
      for (const section of navigationFor(userFor(role)).sections) {
        for (const item of section.items) {
          if (item.count) expect(item.countLabel).toBeTruthy()
        }
      }
    }
  })
})
