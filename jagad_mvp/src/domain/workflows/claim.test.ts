import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import {
  CLAIM_STATES,
  CLAIM_TYPES,
  SETTLEMENT_SOURCES,
  claimCloseRequiresSettlementAndCompanyRemark,
  claimMachine,
  policyActiveForClaim,
  policyInactiveAndAgentNotified,
  routeStatusMessage,
  settlementTypedFromInsurerAdvice,
} from './claim'
import type { ClaimContext } from './claim'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<ClaimContext> = {}): ClaimContext {
  return {
    claimType: CLAIM_TYPES.cashless,
    policyActive: true,
    policyStatus: 'issued',
    settlement: {
      amount: money(84_200),
      deduction: money(12_800),
      source: SETTLEMENT_SOURCES.insurerAdvice,
      insurerAdviceRef: 'HDFC-STL-44120',
    },
    companyRemark: 'Settled in nine days, one query on the discharge summary.',
    ...overrides,
  }
}

describe('claim on an inactive policy', () => {
  it('blocks a claim raised on an inactive policy and notifies the agent', () => {
    const lapsed = context({ policyActive: false, policyStatus: 'lapsed', agentNotified: true })

    expect(policyActiveForClaim(lapsed).ok).toBe(false)
    expect(reasonOf(policyActiveForClaim(lapsed))).toContain('lapsed')
    expect(claimMachine.canTransition(CLAIM_STATES.raised, CLAIM_STATES.intimated, lapsed).ok).toBe(false)
    expect(claimMachine.canTransition(CLAIM_STATES.raised, CLAIM_STATES.blocked, lapsed).ok).toBe(true)
  })

  it('refuses to block silently when the agent has not been notified', () => {
    const verdict = policyInactiveAndAgentNotified(
      context({ policyActive: false, policyStatus: 'lapsed', agentNotified: false }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('notifies the sourcing agent')
  })

  it('emits claim.blocked with the agent message on the same move', () => {
    const { bus, seen } = recordingBus()
    const outcome = claimMachine.transition(
      CLAIM_STATES.raised,
      CLAIM_STATES.blocked,
      context({ policyActive: false, policyStatus: 'cancelled', agentNotified: true }),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['claim.blocked', 'message.sent'])
  })
})

describe('claim settlement', () => {
  it('types the settlement amount from the insurer advice, never derives it', () => {
    expect(settlementTypedFromInsurerAdvice(context()).ok).toBe(true)

    const derived = settlementTypedFromInsurerAdvice(
      context({
        settlement: {
          amount: money(84_200),
          source: SETTLEMENT_SOURCES.derived,
          insurerAdviceRef: 'HDFC-STL-44120',
        },
      }),
    )
    expect(derived.ok).toBe(false)
    expect(reasonOf(derived)).toContain('never worked out from the claimed figure')
  })

  it('will not record a settlement with no amount typed', () => {
    const empty = settlementTypedFromInsurerAdvice(context({ settlement: { source: SETTLEMENT_SOURCES.insurerAdvice } }))

    expect(empty.ok).toBe(false)
    expect(reasonOf(empty)).toContain('Type the settled amount')
  })

  it('asks for the insurer advice reference the figure was taken from', () => {
    const noRef = settlementTypedFromInsurerAdvice(
      context({ settlement: { amount: money(84_200), source: SETTLEMENT_SOURCES.insurerAdvice } }),
    )
    expect(noRef.ok).toBe(false)
  })
})

describe('claim close', () => {
  it('needs both a settlement record and a company remark', () => {
    expect(claimCloseRequiresSettlementAndCompanyRemark(context()).ok).toBe(true)

    const noRemark = claimCloseRequiresSettlementAndCompanyRemark(context({ companyRemark: '  ' }))
    const noSettlement = claimCloseRequiresSettlementAndCompanyRemark(context({ settlement: undefined }))
    const neither = claimCloseRequiresSettlementAndCompanyRemark(
      context({ settlement: undefined, companyRemark: undefined }),
    )

    expect(noRemark.ok).toBe(false)
    expect(reasonOf(noRemark)).toContain('insurer rating')
    expect(noSettlement.ok).toBe(false)
    expect(neither.ok).toBe(false)
    expect(reasonOf(neither)).toContain('Neither is present')
  })

  it('closes and emits claim.closed once both are present', () => {
    const { bus, seen } = recordingBus()
    const outcome = claimMachine.transition(
      CLAIM_STATES.settlementRecorded,
      CLAIM_STATES.closed,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['claim.closed', 'message.sent'])
  })
})

describe('claim status messages', () => {
  it('routes a status change to the customer by default', () => {
    expect(routeStatusMessage(context({ agentDirectUpdates: true }))).toEqual({ to: 'customer', rerouteLogged: false })
  })

  it('routes to the agent and logs the reroute when direct updates are off', () => {
    expect(routeStatusMessage(context({ agentDirectUpdates: false }))).toEqual({ to: 'agent', rerouteLogged: true })
  })

  it('fires a message on every status change', () => {
    const statusEdges = [
      claimMachine.transitions.picked_up?.upload_link_sent,
      claimMachine.transitions.upload_link_sent?.summary_received,
      claimMachine.transitions.summary_received?.tracked,
      claimMachine.transitions.checklist_raised?.docs_collected,
      claimMachine.transitions.docs_collected?.filed_with_insurer,
      claimMachine.transitions.filed_with_insurer?.query_open,
    ]

    for (const edge of statusEdges) {
      expect(edge?.alsoEmits).toContain('message.sent')
    }
  })
})

describe('claim routes', () => {
  it('sends a cashless claim to the upload link and a file claim to the checklist', () => {
    const cashless = context({ claimType: CLAIM_TYPES.cashless })
    const file = context({ claimType: CLAIM_TYPES.file })

    expect(claimMachine.canTransition(CLAIM_STATES.pickedUp, CLAIM_STATES.uploadLinkSent, cashless).ok).toBe(true)
    expect(claimMachine.canTransition(CLAIM_STATES.pickedUp, CLAIM_STATES.checklistRaised, cashless).ok).toBe(false)
    expect(claimMachine.canTransition(CLAIM_STATES.pickedUp, CLAIM_STATES.checklistRaised, file).ok).toBe(true)
  })

  it('loops between filed_with_insurer and query_open as many times as the insurer asks', () => {
    expect(claimMachine.targetsFrom(CLAIM_STATES.filedWithInsurer)).toContain(CLAIM_STATES.queryOpen)
    expect(claimMachine.targetsFrom(CLAIM_STATES.queryOpen)).toContain(CLAIM_STATES.filedWithInsurer)
  })

  it('will not mark documents collected while the checklist is short', () => {
    const short = context({
      claimType: CLAIM_TYPES.file,
      checklistItems: ['discharge_summary', 'bills', 'kyc'],
      documentsCollected: ['bills'],
    })

    const verdict = claimMachine.canTransition(CLAIM_STATES.checklistRaised, CLAIM_STATES.docsCollected, short)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('discharge_summary')
  })
})
