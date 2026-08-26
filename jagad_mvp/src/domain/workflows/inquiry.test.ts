import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import {
  INQUIRY_STATES,
  confirmedWithinTat,
  escalationCarriesFullAssignmentHistory,
  inquiryLostRequiresReason,
  inquiryMachine,
  reassignmentStaysInCategoryGroup,
  tatDeadline,
  tatElapsed,
  unroutedRaisesAdminAlert,
} from './inquiry'
import type { InquiryContext } from './inquiry'
import { reasonOf } from './machine'

const NOW = new Date('2026-08-26T12:00:00.000Z')
const ASSIGNED_AT = '2026-08-26T09:00:00.000Z'

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<InquiryContext> = {}): InquiryContext {
  return {
    now: NOW,
    assignedAt: ASSIGNED_AT,
    tatMinutes: 60,
    categoryGroupId: 'health',
    routingMatchFound: true,
    nextOwnerId: 'u-2',
    nextOwnerCategoryGroupId: 'health',
    assignmentHistory: [
      { assigneeId: 'u-1', assignedAt: ASSIGNED_AT, releasedAt: '2026-08-26T10:00:00.000Z' },
      { assigneeId: 'u-2', assignedAt: '2026-08-26T10:00:00.000Z' },
    ],
    ...overrides,
  }
}

describe('inquiry routing and TAT', () => {
  it('TAT duration is a parameter, never a constant', () => {
    const shortTat = tatElapsed(context({ tatMinutes: 60 }))
    const longTat = tatElapsed(context({ tatMinutes: 60 * 24 }))

    expect(shortTat.ok).toBe(true)
    expect(longTat.ok).toBe(false)

    expect(tatDeadline(ASSIGNED_AT, 60).toISOString()).toBe('2026-08-26T10:00:00.000Z')
    expect(tatDeadline(ASSIGNED_AT, 30).toISOString()).toBe('2026-08-26T09:30:00.000Z')
  })

  it('refuses to apply a TAT nobody supplied rather than defaulting to a guess', () => {
    const verdict = tatElapsed(context({ tatMinutes: undefined }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('no default')
  })

  it('accepts an inquiry confirmed inside the TAT and refuses one confirmed after it', () => {
    expect(confirmedWithinTat(context({ confirmedAt: '2026-08-26T09:30:00.000Z' })).ok).toBe(true)
    expect(confirmedWithinTat(context({ confirmedAt: '2026-08-26T11:00:00.000Z' })).ok).toBe(false)
  })
})

describe('inquiry reassignment', () => {
  it('reassignment stays inside the same category group', () => {
    const insideGroup = reassignmentStaysInCategoryGroup(context({ nextOwnerCategoryGroupId: 'health' }))
    const acrossGroups = reassignmentStaysInCategoryGroup(context({ nextOwnerCategoryGroupId: 'motor' }))

    expect(insideGroup.ok).toBe(true)
    expect(acrossGroups.ok).toBe(false)
    expect(reasonOf(acrossGroups)).toContain('health')
    expect(reasonOf(acrossGroups)).toContain('motor')
  })

  it('blocks the assigned to reassigned move when the next owner is in another group', () => {
    const verdict = inquiryMachine.canTransition(
      INQUIRY_STATES.assigned,
      INQUIRY_STATES.reassigned,
      context({ nextOwnerCategoryGroupId: 'motor' }),
    )

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.guard).toBe('reassignmentStaysInCategoryGroup')
  })
})

describe('inquiry escalation', () => {
  it('escalation carries the full assignment history, not just the item', () => {
    const full = escalationCarriesFullAssignmentHistory(context())
    const onlyCurrent = escalationCarriesFullAssignmentHistory(
      context({ assignmentHistory: [{ assigneeId: 'u-2', assignedAt: '2026-08-26T10:00:00.000Z' }] }),
    )
    const none = escalationCarriesFullAssignmentHistory(context({ assignmentHistory: [] }))

    expect(full.ok).toBe(true)
    expect(onlyCurrent.ok).toBe(false)
    expect(none.ok).toBe(false)
  })

  it('refuses a history with an entry missing its assignee or timestamp', () => {
    const verdict = escalationCarriesFullAssignmentHistory(
      context({
        assignmentHistory: [
          { assigneeId: 'u-1', assignedAt: ASSIGNED_AT },
          { assigneeId: '', assignedAt: '2026-08-26T10:00:00.000Z' },
        ],
      }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('full trail')
  })

  it('escalates from reassigned once the TAT elapses again', () => {
    const { bus, seen } = recordingBus()
    const outcome = inquiryMachine.transition(
      INQUIRY_STATES.reassigned,
      INQUIRY_STATES.escalated,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['inquiry.escalated'])
  })
})

describe('inquiry unrouted', () => {
  it('unrouted is a visible state with an alert, never a silent drop', () => {
    expect(inquiryMachine.states).toContain(INQUIRY_STATES.unrouted)

    const withAlert = unroutedRaisesAdminAlert(
      context({ routingMatchFound: false, adminAlertRaised: true }),
    )
    const withoutAlert = unroutedRaisesAdminAlert(
      context({ routingMatchFound: false, adminAlertRaised: false }),
    )

    expect(withAlert.ok).toBe(true)
    expect(withoutAlert.ok).toBe(false)
    expect(reasonOf(withoutAlert)).toContain('silent drop')
  })

  it('emits inquiry.unrouted so the admin queue can see it', () => {
    const { bus, seen } = recordingBus()
    const outcome = inquiryMachine.transition(
      INQUIRY_STATES.new,
      INQUIRY_STATES.unrouted,
      context({ routingMatchFound: false, adminAlertRaised: true }),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['inquiry.unrouted'])
  })

  it('lets an admin route an unrouted inquiry by hand, so it is a waiting room and not a bin', () => {
    expect(inquiryMachine.targetsFrom(INQUIRY_STATES.unrouted)).toContain(INQUIRY_STATES.assigned)
  })
})

describe('inquiry outcome', () => {
  it('lost requires a reason', () => {
    const withReason = inquiryLostRequiresReason(context({ lostReason: 'Bought direct from the insurer' }))
    const blank = inquiryLostRequiresReason(context({ lostReason: '   ' }))

    expect(withReason.ok).toBe(true)
    expect(blank.ok).toBe(false)

    const verdict = inquiryMachine.canTransition(INQUIRY_STATES.accepted, INQUIRY_STATES.lost, context())
    expect(verdict.ok).toBe(false)
  })

  it('converts an accepted inquiry, which is where the quotation opens', () => {
    const { bus, seen } = recordingBus()
    const outcome = inquiryMachine.transition(
      INQUIRY_STATES.accepted,
      INQUIRY_STATES.converted,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['inquiry.converted'])
  })
})
