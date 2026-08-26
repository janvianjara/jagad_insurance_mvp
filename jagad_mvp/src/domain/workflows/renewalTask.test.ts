import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import {
  RENEWAL_STATES,
  backdatingIsFullyLogged,
  reminderCarriesYearWiseAmountsAndOffers,
  renewalLeadHasElapsed,
  renewalProducesNewTermVersionAndCommission,
  renewalTaskDueOn,
  renewalTaskMachine,
} from './renewalTask'
import type { RenewalContext } from './renewalTask'

const NOW = new Date('2026-08-26T09:00:00.000Z')

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<RenewalContext> = {}): RenewalContext {
  return {
    now: NOW,
    expiryDate: '2026-09-20T00:00:00.000Z',
    leadDays: 45,
    assigneeId: 'u-agent-kiran',
    selfAssigned: true,
    reminder: {
      yearWiseAmounts: [
        { year: 2024, amount: money(24_100) },
        { year: 2025, amount: money(26_800) },
        { year: 2026, amount: money(28_450) },
      ],
      offers: ['Two-year term at last year rate'],
      enrichedFromNoticeRowId: 'row-118',
    },
    renewedTerm: {
      startDate: '2026-09-21T00:00:00.000Z',
      endDate: '2027-09-20T00:00:00.000Z',
      documentVersion: 2,
      commissionRecalculated: true,
    },
    lapseReason: 'Customer moved to a group cover',
    ...overrides,
  }
}

describe('renewal scheduling', () => {
  it('takes the lead time from configuration rather than a constant', () => {
    expect(renewalTaskDueOn('2026-09-20T00:00:00.000Z', 45).toISOString().slice(0, 10)).toBe('2026-08-06')
    expect(renewalTaskDueOn('2026-09-20T00:00:00.000Z', 15).toISOString().slice(0, 10)).toBe('2026-09-05')

    expect(renewalLeadHasElapsed(context({ leadDays: 45 })).ok).toBe(true)
    expect(renewalLeadHasElapsed(context({ leadDays: 15 })).ok).toBe(false)
    expect(renewalLeadHasElapsed(context({ leadDays: undefined })).ok).toBe(false)
  })

  it('is taken out of the pool by the person who will work it', () => {
    expect(renewalTaskMachine.canTransition(RENEWAL_STATES.inPool, RENEWAL_STATES.assigned, context()).ok).toBe(true)
    expect(
      renewalTaskMachine.canTransition(
        RENEWAL_STATES.inPool,
        RENEWAL_STATES.assigned,
        context({ selfAssigned: false }),
      ).ok,
    ).toBe(false)
  })
})

describe('renewal reminders', () => {
  it('carries year-wise amounts and offers, enriched by the matched notice', () => {
    expect(reminderCarriesYearWiseAmountsAndOffers(context()).ok).toBe(true)

    const noAmounts = reminderCarriesYearWiseAmountsAndOffers(
      context({ reminder: { yearWiseAmounts: [], offers: ['Two-year term'] } }),
    )
    const noOffers = reminderCarriesYearWiseAmountsAndOffers(
      context({ reminder: { yearWiseAmounts: [{ year: 2026, amount: money(28_450) }], offers: [] } }),
    )

    expect(noAmounts.ok).toBe(false)
    expect(reasonOf(noAmounts)).toContain('year-wise amounts')
    expect(noOffers.ok).toBe(false)
  })

  it('can be sent again without leaving the reminded state', () => {
    const { bus, seen } = recordingBus()
    const outcome = renewalTaskMachine.transition(
      RENEWAL_STATES.reminded,
      RENEWAL_STATES.reminded,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['renewal.reminded', 'message.sent'])
  })
})

describe('renewal completion', () => {
  it('produces a new term, a new document version and a commission recalculation', () => {
    expect(renewalProducesNewTermVersionAndCommission(context()).ok).toBe(true)

    const overwritesPdf = renewalProducesNewTermVersionAndCommission(
      context({
        renewedTerm: {
          startDate: '2026-09-21T00:00:00.000Z',
          endDate: '2027-09-20T00:00:00.000Z',
          documentVersion: 1,
          commissionRecalculated: true,
        },
      }),
    )
    const noCommission = renewalProducesNewTermVersionAndCommission(
      context({
        renewedTerm: {
          startDate: '2026-09-21T00:00:00.000Z',
          endDate: '2027-09-20T00:00:00.000Z',
          documentVersion: 2,
          commissionRecalculated: false,
        },
      }),
    )

    expect(overwritesPdf.ok).toBe(false)
    expect(noCommission.ok).toBe(false)
  })

  it('emits the renewal, the new policy version and the commission booking together', () => {
    const { bus, seen } = recordingBus()
    const outcome = renewalTaskMachine.transition(
      RENEWAL_STATES.reminded,
      RENEWAL_STATES.renewed,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual([
      'renewal.completed',
      'policy.versioned',
      'commission.booked',
    ])
  })
})

describe('renewal backdating', () => {
  it('permits backdating but logs actor, timestamp, original date and reason', () => {
    const fullyLogged = context({
      backdating: {
        actorId: 'u-admin-falguni',
        loggedAt: NOW.toISOString(),
        originalDate: '2026-09-21T00:00:00.000Z',
        newDate: '2026-09-15T00:00:00.000Z',
        reason: 'Insurer issued with the earlier start date',
      },
    })

    expect(backdatingIsFullyLogged(fullyLogged).ok).toBe(true)
    expect(renewalTaskMachine.canTransition(RENEWAL_STATES.reminded, RENEWAL_STATES.renewed, fullyLogged).ok).toBe(true)
  })

  it('refuses a backdate whose log is incomplete, and names what is missing', () => {
    const noReason = backdatingIsFullyLogged(
      context({
        backdating: {
          actorId: 'u-admin-falguni',
          loggedAt: NOW.toISOString(),
          originalDate: '2026-09-21T00:00:00.000Z',
          newDate: '2026-09-15T00:00:00.000Z',
        },
      }),
    )
    const nothingButADate = backdatingIsFullyLogged(
      context({ backdating: { newDate: '2026-09-15T00:00:00.000Z' } }),
    )

    expect(noReason.ok).toBe(false)
    expect(reasonOf(noReason)).toContain('the reason')
    expect(nothingButADate.ok).toBe(false)
    expect(reasonOf(nothingButADate)).toContain('the actor')
  })

  it('passes cleanly when nobody backdated anything', () => {
    expect(backdatingIsFullyLogged(context({ backdating: undefined })).ok).toBe(true)
  })
})

describe('renewal lapse', () => {
  it('needs a reason to lapse and then moves onto the win-back list', () => {
    expect(
      renewalTaskMachine.canTransition(RENEWAL_STATES.reminded, RENEWAL_STATES.lapsed, context({ lapseReason: '' })).ok,
    ).toBe(false)
    expect(renewalTaskMachine.canTransition(RENEWAL_STATES.reminded, RENEWAL_STATES.lapsed, context()).ok).toBe(true)
    expect(renewalTaskMachine.canTransition(RENEWAL_STATES.lapsed, RENEWAL_STATES.winBackList, context()).ok).toBe(true)
  })
})
