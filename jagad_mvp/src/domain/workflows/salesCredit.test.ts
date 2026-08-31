import { describe, expect, it } from 'vitest'
import { reasonOf } from './machine'
import {
  SALES_CREDIT_PRECEDENCE,
  SALES_CREDIT_SOURCES,
  resolveSalesCredit,
  subAgentRequiresAgent,
} from './salesCredit'

const KIRAN = 'agt-kiran'
const MEERA = 'agt-meera'
const OTHER = 'agt-other'

describe('the precedence', () => {
  it('is stated once, highest first, so the order can be asserted rather than inferred', () => {
    expect([...SALES_CREDIT_PRECEDENCE]).toEqual(['stated', 'quotation', 'inquiry', 'customer'])
  })

  it('takes the highest rung that names anybody and records which one it was', () => {
    const credit = resolveSalesCredit({
      quotation: { agentId: KIRAN, subAgentId: MEERA },
      inquiry: { agentId: OTHER, subAgentId: null },
      customer: { agentId: OTHER, subAgentId: null },
    })

    expect(credit.agentId).toBe(KIRAN)
    expect(credit.subAgentId).toBe(MEERA)
    expect(credit.source).toBe(SALES_CREDIT_SOURCES.quotation)
  })

  it('skips a rung that names nobody rather than treating it as an answer', () => {
    const credit = resolveSalesCredit({
      stated: { agentId: null, subAgentId: null },
      quotation: null,
      customer: { agentId: KIRAN, subAgentId: MEERA },
    })

    expect(credit.source).toBe(SALES_CREDIT_SOURCES.customer)
    expect(credit.agentId).toBe(KIRAN)
  })

  it('leaves an unattributed sale unattributed', () => {
    const credit = resolveSalesCredit({})

    expect(credit).toEqual({ agentId: null, subAgentId: null, source: null })
  })
})

describe('completing a missing sub-agent from a lower rung', () => {
  it('takes it when the lower rung names the same agent', () => {
    // The composing agent states themselves; the customer record is what knows
    // the sub-agent sitting under that same agent on this relationship.
    const credit = resolveSalesCredit({
      stated: { agentId: KIRAN, subAgentId: null },
      customer: { agentId: KIRAN, subAgentId: MEERA },
    })

    expect(credit.agentId).toBe(KIRAN)
    expect(credit.subAgentId).toBe(MEERA)
    // The agent's rung is what is recorded — the sub-agent only completed it.
    expect(credit.source).toBe(SALES_CREDIT_SOURCES.stated)
  })

  it('refuses to take it when the lower rung describes a different agent', () => {
    // Meera sits under somebody else. Pairing her with Kiran would carve her
    // share out of a cut belonging to an agent who never agreed to it.
    const credit = resolveSalesCredit({
      stated: { agentId: KIRAN, subAgentId: null },
      customer: { agentId: OTHER, subAgentId: MEERA },
    })

    expect(credit.agentId).toBe(KIRAN)
    expect(credit.subAgentId).toBeNull()
  })

  it('never overwrites a sub-agent the winning rung already named', () => {
    const credit = resolveSalesCredit({
      quotation: { agentId: KIRAN, subAgentId: MEERA },
      customer: { agentId: KIRAN, subAgentId: OTHER },
    })

    expect(credit.subAgentId).toBe(MEERA)
  })

  it('does not complete a rung that names a sub-agent and no agent', () => {
    // There is no agent to match on, so there is nothing to complete against.
    const credit = resolveSalesCredit({
      quotation: { agentId: null, subAgentId: MEERA },
      customer: { agentId: KIRAN, subAgentId: MEERA },
    })

    expect(credit.agentId).toBeNull()
    expect(credit.subAgentId).toBe(MEERA)
    expect(credit.source).toBe(SALES_CREDIT_SOURCES.quotation)
  })
})

describe('the arrangement guard', () => {
  it('refuses a sub-agent with no agent, naming the person who needs one', () => {
    const verdict = subAgentRequiresAgent({ agentId: null, subAgentId: MEERA })

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain(MEERA)
    expect(reasonOf(verdict)).toContain('carved from the agent cut')
  })

  it('allows an agent with no sub-agent, and a sale with neither', () => {
    expect(subAgentRequiresAgent({ agentId: KIRAN, subAgentId: null }).ok).toBe(true)
    expect(subAgentRequiresAgent({ agentId: null, subAgentId: null }).ok).toBe(true)
    expect(subAgentRequiresAgent({ agentId: KIRAN, subAgentId: MEERA }).ok).toBe(true)
  })
})
