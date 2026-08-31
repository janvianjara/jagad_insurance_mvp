/**
 * Row-level ABAC - the scope leak this module exists to close.
 *
 * The build gated routes and never rows: `<RequireAccess>` asked whether an
 * account could open `/commission`, and every row of the agency's commission
 * book was then rendered to whoever got in. §11 says an agent's grant is
 * `{ level: 'own', includeSubAgents: true }`, so the book an agent may read is
 * their own business and their own sub-agents' - and nothing else.
 *
 * Every assertion below is about a row, not a route. The one that matters most
 * is `a peer agent's line is invisible`: on a money screen that is the
 * difference between a commission ledger and a leak of what every colleague
 * earns, and it is the assertion that would fail first if somebody replaced
 * `visibleTo` with a deny-list.
 */

import { describe, expect, it } from 'vitest'
import { STARTER_TEMPLATES } from './permissions'
import type { PermissionTemplate, User } from './permissions'
import { canSee, hiddenCount, scopeOf, visibleTo } from './visibility'
import type { ScopeLens } from './visibility'

/* ------------------------------------------------------------------- fixtures */

const AGENT = {
  kiran: 'agt-kiran',
  nita: 'agt-nita',
  /** Reports to Kiran. */
  meera: 'agt-meera',
  /** Also reports to Kiran - Meera's sibling, and the one she must never see. */
  ravi: 'agt-ravi',
  /** Reports to Nita, so two hops from Kiran. */
  tara: 'agt-tara',
} as const

const TEAM = { sales: 'team-sales', ops: 'team-ops' } as const

/** A commission line, reduced to the attributes a scope is tested against. */
type Line = {
  readonly id: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly ownerId?: string | null
  readonly teamId?: string | null
  readonly companyId?: string | null
}

const COMMISSION: ScopeLens<Line> = {
  resource: 'commission',
  attributesOf: (line) => line,
}

const WALLET: ScopeLens<Line> = {
  resource: 'wallet',
  attributesOf: (line) => line,
}

const BOOK: readonly Line[] = [
  { id: 'own', agentId: AGENT.kiran, subAgentId: null, teamId: TEAM.sales },
  { id: 'own-sub-meera', agentId: AGENT.kiran, subAgentId: AGENT.meera, teamId: TEAM.sales },
  { id: 'own-sub-ravi', agentId: AGENT.kiran, subAgentId: AGENT.ravi, teamId: TEAM.sales },
  { id: 'peer', agentId: AGENT.nita, subAgentId: null, teamId: TEAM.sales },
  { id: 'peer-sub', agentId: AGENT.nita, subAgentId: AGENT.tara, teamId: TEAM.sales },
  { id: 'direct', agentId: null, subAgentId: null, teamId: TEAM.ops },
]

function user(over: Partial<User> & { template: PermissionTemplate }): User {
  return { id: 'usr-x', name: 'Test account', templateKey: over.template.key, ...over }
}

const admin = user({ id: 'usr-vivek', name: 'Vivek', template: STARTER_TEMPLATES.admin })

const kiran = user({
  id: 'usr-kiran',
  name: 'Kiran',
  template: STARTER_TEMPLATES.agent,
  agentId: AGENT.kiran,
  teamId: TEAM.sales,
})

const nita = user({
  id: 'usr-nita',
  name: 'Nita',
  template: STARTER_TEMPLATES.agent,
  agentId: AGENT.nita,
  teamId: TEAM.sales,
})

const meera = user({
  id: 'usr-meera',
  name: 'Meera',
  template: STARTER_TEMPLATES.subAgent,
  agentId: AGENT.meera,
  parentAgentId: AGENT.kiran,
})

const ravi = user({
  id: 'usr-ravi',
  name: 'Ravi',
  template: STARTER_TEMPLATES.subAgent,
  agentId: AGENT.ravi,
  parentAgentId: AGENT.kiran,
})

/**
 * A team-scoped reader. The starter library has no commission template at team
 * level, so this one is built here rather than by widening a shipped template to
 * suit a test.
 */
const TEAM_READER: PermissionTemplate = {
  key: 'teamReader',
  label: 'Team reader',
  grants: { commission: ['view'] },
  scopes: { commission: { level: 'team' } },
  dataClasses: ['operational', 'contact'],
}

const manager = user({
  id: 'usr-nikunj',
  name: 'Nikunj',
  template: TEAM_READER,
  teamId: TEAM.sales,
})

function ids(rows: readonly Line[]): readonly string[] {
  return rows.map((row) => row.id)
}

/* ---------------------------------------------------------------------- tests */

describe('scopeOf', () => {
  it('drops an attribute the record does not carry, rather than passing null through', () => {
    expect(scopeOf({ agentId: null, subAgentId: null, teamId: TEAM.sales })).toEqual({
      teamId: TEAM.sales,
    })
  })

  it('keeps an absent attribute from matching a user who is also missing it', () => {
    // The failure this prevents: `record.agentId === user.agentId` with both
    // undefined reads as true, and every unsourced row in the book becomes
    // visible to every account. The evaluator guards its side; this guards ours.
    const unsourced: Line = { id: 'direct', agentId: null, subAgentId: null }
    const staffWithoutAnAgentRecord = user({
      id: 'usr-desk',
      name: 'Desk',
      template: STARTER_TEMPLATES.agent,
    })

    expect(canSee(staffWithoutAnAgentRecord, unsourced, COMMISSION)).toBe(false)
  })
})

describe('an unscoped admin', () => {
  it('sees the whole book', () => {
    expect(ids(visibleTo(admin, BOOK, COMMISSION))).toEqual(ids(BOOK))
    expect(hiddenCount(admin, BOOK, COMMISSION)).toBe(0)
  })
})

describe("an agent scoped to their own book", () => {
  it('sees the business they sourced', () => {
    expect(ids(visibleTo(kiran, BOOK, COMMISSION))).toContain('own')
  })

  it("sees their sub-agents' business, because the grant includes sub-agents", () => {
    const seen = ids(visibleTo(kiran, BOOK, COMMISSION))
    expect(seen).toContain('own-sub-meera')
    expect(seen).toContain('own-sub-ravi')
  })

  it('DOES NOT see a peer agent line - the leak this predicate exists to close', () => {
    const seen = ids(visibleTo(kiran, BOOK, COMMISSION))

    expect(seen).not.toContain('peer')
    expect(canSee(kiran, BOOK[3], COMMISSION)).toBe(false)

    // And symmetrically, so the pass is not an accident of who was listed first.
    expect(ids(visibleTo(nita, BOOK, COMMISSION))).not.toContain('own')
  })

  it("does not reach a peer's sub-agent either - the grant is one hop, not a tree", () => {
    expect(ids(visibleTo(kiran, BOOK, COMMISSION))).not.toContain('peer-sub')
  })

  it('does not see direct business nobody sourced', () => {
    expect(ids(visibleTo(kiran, BOOK, COMMISSION))).not.toContain('direct')
  })

  it('sees exactly three of the six lines, and can be told how many it cannot', () => {
    expect(ids(visibleTo(kiran, BOOK, COMMISSION))).toEqual([
      'own',
      'own-sub-meera',
      'own-sub-ravi',
    ])
    expect(hiddenCount(kiran, BOOK, COMMISSION)).toBe(3)
  })
})

describe('a sub-agent scoped to their own leads', () => {
  it('sees the lines their own share was carved from', () => {
    expect(ids(visibleTo(meera, BOOK, WALLET))).toEqual(['own-sub-meera'])
  })

  it('DOES NOT see a sibling sub-agent under the same parent', () => {
    expect(ids(visibleTo(meera, BOOK, WALLET))).not.toContain('own-sub-ravi')
    expect(ids(visibleTo(ravi, BOOK, WALLET))).not.toContain('own-sub-meera')
  })

  it("does not see their own parent's other business", () => {
    expect(ids(visibleTo(meera, BOOK, WALLET))).not.toContain('own')
  })

  it('holds no commission grant at all, so the ledger is empty rather than narrowed', () => {
    // Two different refusals, and the distinction is the point: the sub-agent is
    // refused the commission MODULE, and reaches the same lines through the
    // wallet, which is the resource their template actually grants.
    expect(visibleTo(meera, BOOK, COMMISSION)).toEqual([])
    expect(visibleTo(meera, BOOK, WALLET)).toHaveLength(1)
  })
})

describe('a team scope', () => {
  it('sees the team and nothing beyond it', () => {
    const seen = ids(visibleTo(manager, BOOK, COMMISSION))

    expect(seen).toContain('own')
    expect(seen).toContain('peer')
    expect(seen).not.toContain('direct')
  })

  it('is narrowed by an attribute filter on top of the level', () => {
    const oneCompany: PermissionTemplate = {
      ...TEAM_READER,
      scopes: { commission: { level: 'team', companies: ['cmp-hdfc'] } },
    }
    const narrowed = user({ id: 'usr-n', name: 'Narrowed', template: oneCompany, teamId: TEAM.sales })

    const lines: readonly Line[] = [
      { id: 'hdfc', agentId: AGENT.kiran, subAgentId: null, teamId: TEAM.sales, companyId: 'cmp-hdfc' },
      { id: 'lic', agentId: AGENT.kiran, subAgentId: null, teamId: TEAM.sales, companyId: 'cmp-lic' },
    ]

    expect(ids(visibleTo(narrowed, lines, COMMISSION))).toEqual(['hdfc'])
  })
})

describe('an account with no grant for the resource', () => {
  it('sees nothing, whatever the row says', () => {
    const claims = user({ id: 'usr-amit', name: 'Amit', template: STARTER_TEMPLATES.claims })
    expect(visibleTo(claims, BOOK, COMMISSION)).toEqual([])
  })
})

describe('the filter itself', () => {
  it('keeps the order it was given and never mutates the source', () => {
    const before = [...BOOK]
    const seen = visibleTo(admin, BOOK, COMMISSION)

    expect(seen).not.toBe(BOOK)
    expect(BOOK).toEqual(before)
    expect(ids(seen)).toEqual(ids(BOOK))
  })

  it('answers the same question one row at a time as it does over a list', () => {
    for (const line of BOOK) {
      expect(canSee(kiran, line, COMMISSION)).toBe(
        visibleTo(kiran, BOOK, COMMISSION).includes(line),
      )
    }
  })

  it('narrows further when the lens asks about an action the template does not grant', () => {
    // The agent template grants `view` on commission and nothing else, so the
    // same row that reads is refused for an edit. A toolbar gates on this.
    expect(canSee(kiran, BOOK[0], COMMISSION)).toBe(true)
    expect(canSee(kiran, BOOK[0], { ...COMMISSION, action: 'edit' })).toBe(false)
  })
})
