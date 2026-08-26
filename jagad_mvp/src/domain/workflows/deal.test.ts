import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { reasonOf } from './machine'
import { DEAL_STATES, dealHasLineItems, dealMachine, placementInsideAgencyScope } from './deal'
import type { DealContext, DealLineItem } from './deal'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

const HEALTH_FLOATER: DealLineItem = {
  id: 'li-1',
  companyId: 'co-hdfc',
  productId: 'pr-optima',
  label: 'HDFC Ergo Optima Secure, 10L floater',
}

function context(overrides: Partial<DealContext> = {}): DealContext {
  return {
    lineItems: [HEALTH_FLOATER],
    agencyScope: {
      agencyId: 'ag-jagad-broker',
      companyIds: ['co-hdfc', 'co-niva'],
      productIds: ['pr-optima', 'pr-reassure'],
    },
    ...overrides,
  }
}

describe('deal line items', () => {
  it('blocks a zero-line-item deal with a clear message', () => {
    const verdict = dealHasLineItems(context({ lineItems: [] }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('no line items')
    expect(reasonOf(verdict)).toContain('Add at least one company and product')

    const blocked = dealMachine.canTransition(DEAL_STATES.created, DEAL_STATES.lineItemsSet, context({ lineItems: [] }))
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.guard).toBe('dealHasLineItems')
  })

  it('sets line items and emits deal.line_items_set once there is something to place', () => {
    const { bus, seen } = recordingBus()
    const outcome = dealMachine.transition(DEAL_STATES.created, DEAL_STATES.lineItemsSet, context(), { bus })

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['deal.line_items_set'])
  })
})

describe('deal placement scope', () => {
  it('offers only companies and products inside the selected agency scope', () => {
    const outsideCompany = placementInsideAgencyScope(
      context({ lineItems: [{ ...HEALTH_FLOATER, companyId: 'co-lic', label: 'LIC Jeevan' }] }),
    )
    const outsideProduct = placementInsideAgencyScope(
      context({ lineItems: [{ ...HEALTH_FLOATER, productId: 'pr-motor', label: 'HDFC Ergo motor' }] }),
    )

    expect(placementInsideAgencyScope(context()).ok).toBe(true)
    expect(outsideCompany.ok).toBe(false)
    expect(reasonOf(outsideCompany)).toContain('LIC Jeevan')
    expect(outsideProduct.ok).toBe(false)
  })

  it('asks for the placing agency before line items can be set', () => {
    expect(placementInsideAgencyScope(context({ agencyScope: undefined })).ok).toBe(false)
  })
})

describe('deal consumption', () => {
  it('is consumed by the policy it produced', () => {
    expect(dealMachine.canTransition(DEAL_STATES.lineItemsSet, DEAL_STATES.consumed, context()).ok).toBe(false)
    expect(
      dealMachine.canTransition(
        DEAL_STATES.lineItemsSet,
        DEAL_STATES.consumed,
        context({ consumedByPolicyId: 'pol-1' }),
      ).ok,
    ).toBe(true)
  })
})
