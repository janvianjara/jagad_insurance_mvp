/**
 * The commission chain, tested against §9's own bullets.
 *
 * Five tests, each named after the line in the plan it answers. The fourth one
 * is the reason this step was planned rather than typed: paise reconciliation is
 * the property that makes a commission book trustworthy, and it is checked
 * against BigInt arithmetic rather than against another float, so a drift would
 * have nowhere to hide.
 */

import { describe, expect, it } from 'vitest'
import { fromPaise, money } from './money'
import type { Money } from './money'
import { reasonOf } from './workflows/machine'
import { BASIS_POINTS_PER_PERCENT } from './workflows/commissionShare'
import {
  COMMISSION_CHANNELS,
  COMMISSION_ENTRY_KINDS,
  COMMISSION_PARTY_KINDS_IN_CHAIN,
  COMMISSION_TRIGGERS,
  chainReconciles,
  commissionChain,
  proportionOf,
} from './commission'
import type { CommissionChain, CommissionChainInput } from './commission'
import type { AppointedPlacement } from './workflows/deal'

/** 15% is 1500 basis points, and nothing in this file writes 0.15. */
function percent(value: number): number {
  return value * BASIS_POINTS_PER_PERCENT
}
/**
 * One appointment, open-ended. Scope is pairs now, so a test that wants an
 * agency appointed for a company AND a product has to say so as one fact.
 */
function appointed(companyId: string, productId: string): AppointedPlacement {
  return {
    scopeId: `aps-${companyId}-${productId}`,
    companyId,
    productId,
    commissionPercentBp: null,
    appointedFrom: '2026-01-01T00:00:00.000Z',
    appointedTo: null,
  }
}


const HDFC = 'cmp-hdfc-ergo'
const LIC = 'cmp-lic'
const FLOATER = 'prd-he-ops'

const OWN_CODE_INPUT: CommissionChainInput = {
  trigger: COMMISSION_TRIGGERS.policyIssued,
  policyId: 'pol-4388',
  basis: money(24_180),
  channel: COMMISSION_CHANNELS.ownCode,
  payer: { id: HDFC, kind: 'company' },
  placement: { companyId: HDFC, productId: FLOATER, label: 'HDFC Ergo Optima Secure' },
  agencyScope: {
    agencyId: 'agy-jagad-hdfc',
    appointments: [appointed(HDFC, FLOATER)],
  },
  agencyPercentBp: percent(15),
  agent: { id: 'agt-kiran', sharePercentBp: percent(60) },
  bookedAt: '2026-03-20T05:00:00.000Z',
  bookedBy: 'usr-vivek-jagad',
}

function chainInput(overrides: Partial<CommissionChainInput> = {}): CommissionChainInput {
  return { ...OWN_CODE_INPUT, ...overrides }
}

/** Unwraps a chain the test expects to succeed, failing loudly when it does not. */
function chainOf(input: CommissionChainInput): CommissionChain {
  const result = commissionChain(input)
  if (!result.ok) throw new Error(`Expected a chain, got a refusal: ${result.reason}`)
  return result.chain
}

/**
 * The exact entitlement, computed in BigInt and truncated toward zero — the same
 * rule the module states, but arrived at by a route that cannot round.
 */
function exactPaise(amount: Money, basisPoints: number): number {
  return Number((BigInt(amount.paise) * BigInt(basisPoints)) / 10_000n)
}

describe('the commission chain', () => {
  it('blocks a share above the configured cap', () => {
    const overCap = commissionChain(
      chainInput({
        agent: { id: 'agt-kiran', sharePercentBp: percent(60) },
        subAgent: { id: 'agt-meera', sharePercentBp: percent(50) },
        capPercentBp: percent(40),
      }),
    )

    expect(overCap.ok).toBe(false)
    expect(reasonOf(overCap)).toContain('above the configured cap')
    expect(reasonOf(overCap)).toContain('40%')

    // And the cap is a ceiling on the share, not on the chain: the same
    // arrangement inside the cap computes, so the refusal is about the number
    // rather than about sub-agents existing.
    const insideCap = chainOf(
      chainInput({
        subAgent: { id: 'agt-meera', sharePercentBp: percent(40) },
        capPercentBp: percent(40),
      }),
    )
    expect(insideCap.subAgentPercentBp).toBe(percent(40))
    expect(chainReconciles(insideCap)).toBe(true)
  })

  it("accepts any share within the agent's own percentage when no cap is set", () => {
    // No cap at all, and the share goes right up to the agent's own 60%. §9 is
    // explicit that this is allowed: no cap set does not mean no ceiling, it
    // means the agent's own percentage is the ceiling.
    const wholeCut = chainOf(
      chainInput({
        agent: { id: 'agt-kiran', sharePercentBp: percent(60) },
        subAgent: { id: 'agt-meera', sharePercentBp: percent(60) },
      }),
    )

    expect(wholeCut.subAgentShare.paise).toBe(wholeCut.agentCut.paise)
    expect(wholeCut.agentNet.paise).toBe(0)
    expect(chainReconciles(wholeCut)).toBe(true)

    // The second ceiling never goes away. A share above the agent's own cut is
    // refused even with no cap configured, because it is carved from that cut.
    const aboveTheCut = commissionChain(
      chainInput({
        agent: { id: 'agt-kiran', sharePercentBp: percent(60) },
        subAgent: { id: 'agt-meera', sharePercentBp: percent(70) },
      }),
    )
    expect(aboveTheCut.ok).toBe(false)
    expect(reasonOf(aboveTheCut)).toContain('carved out of the agent cut')
  })

  it('locks an Individual agency to exactly one company', () => {
    // The lock is not restated in the chain: an Individual agency is appointed
    // for one company, which makes its scope a one-company list, and the P-03
    // guard the chain delegates to reads exactly that. This asserts the chain
    // respects it rather than re-implementing it.
    const individualScope = { agencyId: 'agy-jagad-hdfc', appointments: [appointed(HDFC, FLOATER)] }

    const onItsCompany = chainOf(chainInput({ agencyScope: individualScope }))
    expect(onItsCompany.agencyId).toBe('agy-jagad-hdfc')

    const onAnother = commissionChain(
      chainInput({
        agencyScope: individualScope,
        payer: { id: LIC, kind: 'company' },
        placement: { companyId: LIC, productId: 'prd-lc-jva', label: 'LIC Jeevan Anand' },
      }),
    )

    expect(onAnother.ok).toBe(false)
    expect(reasonOf(onAnother)).toContain('not appointed for')
    expect(reasonOf(onAnother)).toContain('LIC Jeevan Anand')
  })

  it('reconciles to the paisa: the chain parts sum exactly to the pay-in, with no float drift', () => {
    /*
     * The awkward cases on purpose. 33.33% and 16.67% do not divide, the
     * three-way split leaves a remainder at both levels, and the small bases at
     * the end are amounts where a single lost paisa is a visible fraction of the
     * total. Every combination is checked against BigInt truth.
     */
    const rates: readonly (readonly [number, number, number])[] = [
      // [agency, agent, sub-agent] — all basis points of the level above.
      [3_333, 6_666, 3_333], // 33.33% agency, and a three-way split of the pay-in
      [1_667, 5_000, 1_667], // 16.67%
      [1_500, 6_000, 3_000], // the configured Jagad arrangement
      [833, 3_333, 3_333], // agent hands the whole cut on; agent nets zero
      [10_000, 10_000, 9_999], // the whole premium, split one paisa short
      [1_234, 4_321, 1_111],
      [1_500, 0, 0], // no agent at all: the agency keeps everything
    ]

    const bases: readonly Money[] = [
      money(24_180),
      money(9_120),
      money(48_000),
      money(1, 1), // 101 paise
      fromPaise(1),
      fromPaise(7),
      fromPaise(999_983), // a prime-ish figure, so nothing divides cleanly
    ]

    for (const [agencyBp, agentBp, subBp] of rates) {
      for (const basis of bases) {
        const hasAgent = agentBp > 0
        const chain = chainOf(
          chainInput({
            basis,
            agencyPercentBp: agencyBp,
            agent: hasAgent ? { id: 'agt-kiran', sharePercentBp: agentBp } : null,
            subAgent: hasAgent && subBp > 0 ? { id: 'agt-meera', sharePercentBp: subBp } : null,
          }),
        )

        const where = `${agencyBp}/${agentBp}/${subBp} bp on ${basis.paise}p`

        // 1. The pay-in is the exact truncated proportion of the typed basis.
        expect(chain.payIn.paise, `pay-in at ${where}`).toBe(exactPaise(basis, agencyBp))

        // 2. The parts sum to the whole. Exactly, every time — nothing lost and
        //    nothing invented.
        expect(
          chain.netProfit.paise + chain.agentNet.paise + chain.subAgentShare.paise,
          `parts sum to pay-in at ${where}`,
        ).toBe(chain.payIn.paise)
        expect(chainReconciles(chain), `reconciles at ${where}`).toBe(true)

        // 3. The agent's gross cut is its two children added, not a third
        //    truncation — "carved from the agent's own cut", to the paisa.
        expect(chain.agentCut.paise, `cut is its parts at ${where}`).toBe(
          chain.agentNet.paise + chain.subAgentShare.paise,
        )

        // 4. Each outward payee gets exactly their truncated entitlement of the
        //    pay-in. Never a paisa more.
        expect(chain.subAgentShare.paise, `sub-agent share at ${where}`).toBe(
          exactPaise(chain.payIn, subBp > 0 && hasAgent ? subBp : 0),
        )
        expect(chain.agentNet.paise, `agent net at ${where}`).toBe(
          exactPaise(chain.payIn, hasAgent ? agentBp - (subBp > 0 ? subBp : 0) : 0),
        )

        // 5. The remainder lands on the agency, deterministically, and is never
        //    larger than one paisa per outward payee.
        const agencyFloor = exactPaise(chain.payIn, 10_000 - (hasAgent ? agentBp : 0))
        const residual = chain.netProfit.paise - agencyFloor
        expect(residual, `agency is never short at ${where}`).toBeGreaterThanOrEqual(0)
        expect(residual, `residual is bounded at ${where}`).toBeLessThanOrEqual(2)

        // 6. The ledger rows say the same thing the chain does.
        const payInRow = chain.entries.find(
          (entry) => entry.kind === COMMISSION_ENTRY_KINDS.commissionBooked,
        )
        const outward = chain.entries
          .filter((entry) => entry.kind !== COMMISSION_ENTRY_KINDS.commissionBooked)
          .reduce((total, entry) => total + entry.amount.paise, 0)
        expect(payInRow?.amount.paise, `pay-in row at ${where}`).toBe(chain.payIn.paise)
        expect(outward + chain.netProfit.paise, `rows reconcile at ${where}`).toBe(
          chain.payIn.paise,
        )

        // 7. Integer paise throughout. A float that reached an amount would show
        //    up here before it reached a ledger.
        for (const amount of [
          chain.payIn,
          chain.agentCut,
          chain.agentNet,
          chain.subAgentShare,
          chain.netProfit,
        ]) {
          expect(Number.isInteger(amount.paise), `integer paise at ${where}`).toBe(true)
        }
      }
    }

    // Deterministic, not merely correct: the same input twice gives the same
    // allocation, so a remainder is never re-shuffled between runs.
    const first = chainOf(chainInput({ agencyPercentBp: 3_333 }))
    const second = chainOf(chainInput({ agencyPercentBp: 3_333 }))
    expect(first.netProfit.paise).toBe(second.netProfit.paise)
    expect(first.entries.map((entry) => entry.id)).toEqual(second.entries.map((entry) => entry.id))

    // Sign-symmetric, which is what an endorsement delta that reverses an
    // earlier one relies on: the reversal nets the ledger to zero exactly.
    const forward = chainOf(chainInput({ basis: fromPaise(999_983), agencyPercentBp: 1_667 }))
    const reversal = chainOf(
      chainInput({
        trigger: COMMISSION_TRIGGERS.endorsementApproved,
        basis: fromPaise(-999_983),
        agencyPercentBp: 1_667,
      }),
    )
    expect(reversal.payIn.paise).toBe(-forward.payIn.paise)
    expect(reversal.agentNet.paise).toBe(-forward.agentNet.paise)
    expect(reversal.netProfit.paise).toBe(-forward.netProfit.paise)
  })

  it('keeps a broker a payer, never a payee and never a user', () => {
    const broker = { id: 'brk-surat-vendor', kind: 'broker' as const }

    const throughBroker = chainOf(
      chainInput({
        channel: COMMISSION_CHANNELS.brokerChannel,
        payer: broker,
        agencyScope: {
          agencyId: 'agy-jagad-general',
          appointments: [appointed(HDFC, FLOATER)],
        },
        subAgent: { id: 'agt-meera', sharePercentBp: percent(30) },
      }),
    )

    // The broker is on the paying side, and nowhere else.
    expect(throughBroker.payer.id).toBe(broker.id)
    expect(throughBroker.payees).not.toHaveLength(0)
    for (const payee of throughBroker.payees) {
      expect(payee.kind).not.toBe('broker')
      expect(payee.id).not.toBe(broker.id)
    }
    expect(COMMISSION_PARTY_KINDS_IN_CHAIN).not.toContain('broker')

    // No ledger row pays a broker either: the only party ids a row carries are
    // the agency, the agent and the sub-agent.
    for (const entry of throughBroker.entries) {
      expect(entry.agentId).not.toBe(broker.id)
      expect(entry.subAgentId).not.toBe(broker.id)
      expect(entry.agencyId).not.toBe(broker.id)
    }

    // Never a user. A broker with a login is an outside party inside the book.
    const brokerWithLogin = commissionChain(
      chainInput({
        channel: COMMISSION_CHANNELS.brokerChannel,
        payer: { ...broker, isPlatformUser: true },
      }),
    )
    expect(brokerWithLogin.ok).toBe(false)
    expect(reasonOf(brokerWithLogin)).toContain('never a user')

    // And the payer fork holds both ways: a broker cannot pay on an own-code
    // placement, and a company does not pay on a broker channel.
    const brokerOnOwnCode = commissionChain(
      chainInput({ channel: COMMISSION_CHANNELS.ownCode, payer: broker }),
    )
    expect(brokerOnOwnCode.ok).toBe(false)
    expect(reasonOf(brokerOnOwnCode)).toContain('paid by the insurance company')

    const companyOnBrokerChannel = commissionChain(
      chainInput({ channel: COMMISSION_CHANNELS.brokerChannel }),
    )
    expect(companyOnBrokerChannel.ok).toBe(false)
    expect(reasonOf(companyOnBrokerChannel)).toContain('paid by the broker')
  })
})

describe('the proportion primitive', () => {
  it('refuses a rate that is not integer basis points, rather than rounding it', () => {
    expect(() => proportionOf(money(1_000), 15.5)).toThrow(RangeError)
    expect(() => proportionOf(money(1_000), -100)).toThrow(RangeError)
    expect(() => proportionOf(money(1_000), 10_001)).toThrow(RangeError)
  })

  it('refuses an amount too large for exact integer arithmetic', () => {
    expect(() => proportionOf(fromPaise(Number.MAX_SAFE_INTEGER), 10_000)).toThrow(RangeError)
  })
})
