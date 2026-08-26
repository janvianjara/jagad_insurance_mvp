import { beforeEach, describe, expect, it } from 'vitest'
import { NO_LATENCY, createMockRepositories } from '../../data/mock'
import { can } from '../../domain/permissions'
import { activeAccount, resolveAccount, useSessionStore } from './session'

const repositories = createMockRepositories({ latency: NO_LATENCY })

async function accounts() {
  const staff = await repositories.config.users()
  return staff.filter((person) => person.active).map(resolveAccount)
}

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('resolving a staff record into a user', () => {
  it('attaches the permission template the key names', async () => {
    const resolved = await accounts()
    const admin = resolved.find((account) => account.user.templateKey === 'admin')

    expect(admin?.user.template.key).toBe('admin')
    expect(can(admin!.user, 'view', 'config')).toBe(true)
  })

  it('grants nothing when the template key is unknown', () => {
    const account = resolveAccount({
      id: 'user-x',
      name: 'Unknown template',
      email: 'x@example.test',
      mobile: '9800000000',
      templateKey: 'not-a-template',
      teamId: null,
      agentId: null,
      parentAgentId: null,
      categoryIds: [],
      roleLabel: 'Unknown',
      active: true,
    })

    // A typo in configuration shows up as an empty rail, never as an accidental admin.
    expect(can(account.user, 'view', 'inquiries')).toBe(false)
    expect(can(account.user, 'view', 'config')).toBe(false)
  })

  it('carries the channel identity that a sub-agent scope depends on', async () => {
    const resolved = await accounts()
    const subAgent = resolved.find((account) => account.user.templateKey === 'subAgent')

    expect(subAgent?.user.agentId).toBeTruthy()
    expect(subAgent?.user.parentAgentId).toBeTruthy()
  })
})

describe('the session slice', () => {
  it('is not ready until it is hydrated', () => {
    expect(useSessionStore.getState().ready).toBe(false)
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('hydrates once, defaulting to the first account', async () => {
    const resolved = await accounts()
    useSessionStore.getState().hydrate(resolved)

    const state = useSessionStore.getState()
    expect(state.ready).toBe(true)
    expect(state.user?.id).toBe(resolved[0].user.id)
    expect(state.accounts).toHaveLength(resolved.length)
  })

  it('honours a named account at hydration', async () => {
    const resolved = await accounts()
    const claims = resolved.find((account) => account.user.templateKey === 'claims')!
    useSessionStore.getState().hydrate(resolved, claims.user.id)

    expect(useSessionStore.getState().user?.id).toBe(claims.user.id)
  })

  it('swaps the whole resolved user when the account changes', async () => {
    const resolved = await accounts()
    useSessionStore.getState().hydrate(resolved)

    const agent = resolved.find((account) => account.user.templateKey === 'agent')!
    useSessionStore.getState().switchAccount(agent.user.id)

    const user = useSessionStore.getState().user!
    expect(user.id).toBe(agent.user.id)
    expect(can(user, 'view', 'config')).toBe(false)
    expect(can(user, 'view', 'inquiries')).toBe(true)
  })

  it('ignores a switch to an account it does not hold', async () => {
    const resolved = await accounts()
    useSessionStore.getState().hydrate(resolved)
    const before = useSessionStore.getState().user

    useSessionStore.getState().switchAccount('user-nobody')
    expect(useSessionStore.getState().user).toBe(before)
  })

  it('reports the account record behind the signed-in user', async () => {
    const resolved = await accounts()
    useSessionStore.getState().hydrate(resolved)

    expect(activeAccount(useSessionStore.getState())?.roleLabel).toBe(resolved[0].roleLabel)
  })

  it('holds density, which the shell writes onto the document', () => {
    expect(useSessionStore.getState().density).toBe('comfortable')
    useSessionStore.getState().setDensity('compact')
    expect(useSessionStore.getState().density).toBe('compact')
  })
})
