import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { reasonOf } from './machine'
import {
  MANDATE_STATES,
  canPlatformInitiateDebit,
  failureRaisesSameDayFollowUpInsideGrace,
  mandateMachine,
  platformStoresNoBankCredentials,
  twoFailuresInThreeMonths,
} from './mandate'
import type { MandateContext, MandateEvent } from './mandate'

const NOW = new Date('2026-08-26T09:00:00.000Z')

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

const FAILURE: MandateEvent = {
  outcome: 'failure',
  occurredAt: '2026-08-26T04:30:00.000Z',
  reference: 'NACH-DR-99120',
  failureReason: 'Insufficient funds',
}

function context(overrides: Partial<MandateContext> = {}): MandateContext {
  return {
    now: NOW,
    registrationReference: 'NACH-REG-44120',
    latestEvent: FAILURE,
    followUp: { taskId: 'tsk-1', dueOn: '2026-08-26T11:00:00.000Z', notifyAgentId: 'ag-kiran' },
    graceEndsAt: '2026-09-04T00:00:00.000Z',
    agentNotified: true,
    validUntil: '2028-08-26T00:00:00.000Z',
    ...overrides,
  }
}

describe('the platform boundary around mandates', () => {
  it('never initiates a debit', () => {
    const verdict = canPlatformInitiateDebit()

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('never initiates a debit')
  })

  it('never stores bank credentials', () => {
    expect(platformStoresNoBankCredentials(context()).ok).toBe(true)

    const withCredentials = platformStoresNoBankCredentials(context({ bankCredentialsSupplied: true }))
    expect(withCredentials.ok).toBe(false)
    expect(reasonOf(withCredentials)).toContain('never stored here')
  })

  it('refuses an outcome recorded as platform-initiated', () => {
    const verdict = platformStoresNoBankCredentials(context({ debitInitiatedByPlatform: true }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('cannot happen')
  })

  it('records a successful debit and leaves the mandate active', () => {
    const { bus, seen } = recordingBus()
    const success = context({
      latestEvent: { outcome: 'success', occurredAt: NOW.toISOString(), reference: 'NACH-DR-99121' },
    })

    const outcome = mandateMachine.transition(MANDATE_STATES.active, MANDATE_STATES.active, success, { bus })

    expect(outcome.ok).toBe(true)
    expect(outcome.ok === true && outcome.state).toBe(MANDATE_STATES.active)
    expect(seen.map((event) => event.name)).toEqual(['mandate.debit_succeeded'])
  })
})

describe('mandate failure', () => {
  it('raises a same-day follow-up task inside the grace window and notifies the agent', () => {
    expect(failureRaisesSameDayFollowUpInsideGrace(context()).ok).toBe(true)

    const { bus, seen } = recordingBus()
    const outcome = mandateMachine.transition(MANDATE_STATES.active, MANDATE_STATES.debitFailed, context(), { bus })

    expect(outcome.ok).toBe(true)
    // One event. The follow-up is the `mandate.failureFollowUp` recipe's real
    // task now, not two events announcing a row nobody wrote — see the note on
    // the same assertion in `collection.test.ts`.
    expect(seen.map((event) => event.name)).toEqual(['mandate.failed'])
  })

  it('refuses a follow-up scheduled for a later day than the failure', () => {
    const verdict = failureRaisesSameDayFollowUpInsideGrace(
      context({ followUp: { taskId: 'tsk-1', dueOn: '2026-08-29T11:00:00.000Z', notifyAgentId: 'ag-kiran' } }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('same day')
  })

  it('refuses a follow-up that falls after the grace window closes', () => {
    const verdict = failureRaisesSameDayFollowUpInsideGrace(
      context({
        latestEvent: { ...FAILURE, occurredAt: '2026-09-10T04:30:00.000Z' },
        followUp: { taskId: 'tsk-1', dueOn: '2026-09-10T11:00:00.000Z', notifyAgentId: 'ag-kiran' },
      }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('lapsed policy')
  })

  it('refuses a failure that raises no follow-up at all', () => {
    const verdict = failureRaisesSameDayFollowUpInsideGrace(context({ followUp: undefined }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('finds out when the policy lapses')
  })

  it('refuses a failure the agent was not told about', () => {
    expect(failureRaisesSameDayFollowUpInsideGrace(context({ agentNotified: false })).ok).toBe(false)
  })
})

describe('repeat mandate failures', () => {
  it('surfaces two failures inside three months as a pattern', () => {
    const history: readonly MandateEvent[] = [
      { outcome: 'failure', occurredAt: '2026-06-26T04:30:00.000Z', reference: 'a', failureReason: 'Insufficient funds' },
      { outcome: 'success', occurredAt: '2026-07-26T04:30:00.000Z', reference: 'b' },
      FAILURE,
    ]

    expect(twoFailuresInThreeMonths(history, NOW)).toBe(true)
  })

  it('does not call one recent failure a pattern, nor two that are further apart than three months', () => {
    expect(twoFailuresInThreeMonths([FAILURE], NOW)).toBe(false)
    expect(
      twoFailuresInThreeMonths(
        [
          { outcome: 'failure', occurredAt: '2025-11-26T04:30:00.000Z', reference: 'a', failureReason: 'x' },
          FAILURE,
        ],
        NOW,
      ),
    ).toBe(false)
  })
})

describe('mandate end of life', () => {
  it('expires only once its validity has actually passed', () => {
    expect(mandateMachine.canTransition(MANDATE_STATES.active, MANDATE_STATES.expired, context()).ok).toBe(false)
    expect(
      mandateMachine.canTransition(
        MANDATE_STATES.active,
        MANDATE_STATES.expired,
        context({ validUntil: '2026-01-01T00:00:00.000Z' }),
      ).ok,
    ).toBe(true)
  })

  it('cancels only with a reason recorded', () => {
    expect(mandateMachine.canTransition(MANDATE_STATES.active, MANDATE_STATES.cancelled, context()).ok).toBe(false)
    expect(
      mandateMachine.canTransition(
        MANDATE_STATES.active,
        MANDATE_STATES.cancelled,
        context({ cancellationReason: 'Customer switched bank' }),
      ).ok,
    ).toBe(true)
  })
})
