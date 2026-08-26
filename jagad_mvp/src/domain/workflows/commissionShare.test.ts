import { describe, expect, it } from 'vitest'
import { isMoney } from '../money'
import { reasonOf } from './machine'
import {
  BASIS_POINTS_PER_PERCENT,
  COMMISSION_PARTY_KINDS,
  brokerIsPayerNeverPayee,
  formatPercentBp,
  subAgentShareWithinCap,
} from './commissionShare'
import type { CommissionArrangementContext, CommissionShareContext } from './commissionShare'
import commissionShareSource from './commissionShare.ts?raw'

/** Percentages are integer basis points: 15% is 1500. */
function percent(value: number): number {
  return value * BASIS_POINTS_PER_PERCENT
}

function shareContext(overrides: Partial<CommissionShareContext> = {}): CommissionShareContext {
  return { agentSharePercentBp: percent(15), subAgentSharePercentBp: percent(5), ...overrides }
}

function arrangement(overrides: Partial<CommissionArrangementContext> = {}): CommissionArrangementContext {
  return {
    payer: { id: 'co-hdfc', kind: COMMISSION_PARTY_KINDS.company },
    payee: { id: 'ag-kiran-solanki', kind: COMMISSION_PARTY_KINDS.agent, isPlatformUser: true },
    ...overrides,
  }
}

describe('sub-agent share cap', () => {
  it('blocks a share above the configured cap', () => {
    const capped = shareContext({ capPercentBp: percent(4), subAgentSharePercentBp: percent(5) })

    const verdict = subAgentShareWithinCap(capped)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('above the configured cap')
    expect(reasonOf(verdict)).toContain('4%')
    expect(reasonOf(verdict)).toContain('5%')
  })

  it('accepts a share at or under the configured cap', () => {
    expect(subAgentShareWithinCap(shareContext({ capPercentBp: percent(5) })).ok).toBe(true)
    expect(subAgentShareWithinCap(shareContext({ capPercentBp: percent(10) })).ok).toBe(true)
  })

  it('with no cap set, accepts any share within the agent own percentage', () => {
    const noCap = shareContext({ capPercentBp: undefined })

    expect(subAgentShareWithinCap(noCap).ok).toBe(true)
    expect(subAgentShareWithinCap({ ...noCap, subAgentSharePercentBp: percent(15) }).ok).toBe(true)
    expect(subAgentShareWithinCap({ ...noCap, subAgentSharePercentBp: 0 }).ok).toBe(true)
  })

  it('refuses a share above the agent own percentage even with no cap set', () => {
    const verdict = subAgentShareWithinCap(
      shareContext({ capPercentBp: undefined, subAgentSharePercentBp: percent(20) }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('carved out of the agent cut')
    expect(reasonOf(verdict)).toContain('20%')
    expect(reasonOf(verdict)).toContain('15%')
  })

  it('refuses a share above the agent own percentage even when the cap would allow it', () => {
    const verdict = subAgentShareWithinCap(
      shareContext({ capPercentBp: percent(30), subAgentSharePercentBp: percent(20) }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('never be larger')
  })

  it('asks for the agent percentage before a share can be carved from it', () => {
    expect(subAgentShareWithinCap(shareContext({ agentSharePercentBp: undefined })).ok).toBe(false)
    expect(subAgentShareWithinCap(shareContext({ subAgentSharePercentBp: undefined })).ok).toBe(false)
    expect(subAgentShareWithinCap(shareContext({ agentSharePercentBp: percent(120) })).ok).toBe(false)
  })

  it('keeps percentages as whole basis points rather than floats', () => {
    expect(percent(12.5)).toBe(1250)
    expect(formatPercentBp(1250)).toBe('12.50%')
    expect(formatPercentBp(1500)).toBe('15%')
    expect(subAgentShareWithinCap(shareContext({ subAgentSharePercentBp: 512.5 })).ok).toBe(false)
  })
})

describe('a broker is a payer, never a payee and never a user', () => {
  it('refuses an arrangement that would make a broker a payee', () => {
    const verdict = brokerIsPayerNeverPayee(
      arrangement({ payee: { id: 'br-shah-insurance', kind: COMMISSION_PARTY_KINDS.broker } }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('br-shah-insurance')
    expect(reasonOf(verdict)).toContain('never a payee')
  })

  it('accepts a broker on the paying side', () => {
    expect(
      brokerIsPayerNeverPayee(
        arrangement({ payer: { id: 'br-shah-insurance', kind: COMMISSION_PARTY_KINDS.broker } }),
      ).ok,
    ).toBe(true)
  })

  it('refuses a broker that also holds a login', () => {
    const verdict = brokerIsPayerNeverPayee(
      arrangement({
        payer: { id: 'br-shah-insurance', kind: COMMISSION_PARTY_KINDS.broker, isPlatformUser: true },
      }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('never a user')
  })

  it('accepts an agent or a sub-agent as the payee', () => {
    expect(brokerIsPayerNeverPayee(arrangement()).ok).toBe(true)
    expect(
      brokerIsPayerNeverPayee(
        arrangement({ payee: { id: 'sa-nilesh', kind: COMMISSION_PARTY_KINDS.subAgent, isPlatformUser: true } }),
      ).ok,
    ).toBe(true)
  })

  it('names both sides before it will pass anything', () => {
    expect(brokerIsPayerNeverPayee({ payee: arrangement().payee }).ok).toBe(false)
    expect(brokerIsPayerNeverPayee({ payer: arrangement().payer }).ok).toBe(false)
  })
})

describe('the boundary against P-16', () => {
  it('exports nothing that returns a Money, so the chain arithmetic cannot grow here', async () => {
    const shareModule: Record<string, unknown> = await import('./commissionShare')

    const amountProducers = Object.entries(shareModule)
      .filter(([, value]) => typeof value === 'function')
      .filter(([, value]) => {
        try {
          return isMoney((value as (input: unknown) => unknown)(shareContext()))
        } catch {
          return false
        }
      })
      .map(([name]) => name)

    expect(amountProducers).toEqual([])
  })

  it('imports no money helper at all - percentages here are plain integers', () => {
    // Read through Vite's `?raw` rather than node:fs — tsconfig.app carries only
    // the vite/client types, and the browser app config is the right one for a
    // test that ships inside src/.
    const imports = commissionShareSource
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import'))

    expect(imports.some((line) => line.includes('money'))).toBe(false)
    expect(imports.join('\n')).toContain("from './machine'")
  })
})
