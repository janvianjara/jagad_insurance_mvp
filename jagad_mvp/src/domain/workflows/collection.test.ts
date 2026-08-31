import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import {
  COLLECTION_INSTRUMENTS,
  COLLECTION_MODES,
  COLLECTION_ROUTES,
  COLLECTION_STATES,
  backOfficeVerification,
  bounceRaisesFollowUpTask,
  canIssueReceipt,
  collectionMachine,
  directToCompanyWritesNoAgencyBooks,
  onFieldRequiresBackOfficeVerification,
} from './collection'
import type { CollectionContext } from './collection'

const NOW = new Date('2026-08-26T09:00:00.000Z')

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<CollectionContext> = {}): CollectionContext {
  return {
    now: NOW,
    route: COLLECTION_ROUTES.viaAgency,
    instrument: COLLECTION_INSTRUMENTS.cheque,
    mode: COLLECTION_MODES.onField,
    amount: money(28_450),
    collectedBy: 'u-agent-kiran',
    verification: { userId: 'u-backoffice-priya', isBackOffice: true, verifiedAt: NOW.toISOString() },
    ...overrides,
  }
}

describe('collection routing', () => {
  it('records a reference for a direct-to-company payment and touches no agency books', () => {
    const direct = context({ route: COLLECTION_ROUTES.directToCompany, reference: 'HDFC-RCP-88213' })

    expect(directToCompanyWritesNoAgencyBooks(direct).ok).toBe(true)

    const booked = directToCompanyWritesNoAgencyBooks({ ...direct, agencyBooksTouched: true })
    expect(booked.ok).toBe(false)
    expect(reasonOf(booked)).toContain('never touches the agency books')
  })

  it('issues no receipt slip, and says so in the customer words', () => {
    const verdict = canIssueReceipt()

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('does not issue receipts')
  })

  it('asks for the amount to be typed rather than filling one in', () => {
    const verdict = collectionMachine.canTransition(
      COLLECTION_STATES.pending,
      COLLECTION_STATES.recorded,
      context({ amount: undefined }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('never fills the figure in')
  })
})

describe('on-field collection verification', () => {
  it('requires back-office verification before an on-field collection can close', () => {
    const unverified = context({ verification: undefined })

    expect(onFieldRequiresBackOfficeVerification(unverified).ok).toBe(false)
    expect(collectionMachine.canTransition(COLLECTION_STATES.recorded, COLLECTION_STATES.closed, unverified).ok).toBe(false)
    expect(collectionMachine.canTransition(COLLECTION_STATES.recorded, COLLECTION_STATES.closed, context()).ok).toBe(true)
  })

  it('will not accept a field agent as the verifier', () => {
    const fieldVerified = context({
      verification: { userId: 'u-agent-kiran', isBackOffice: false, verifiedAt: NOW.toISOString() },
    })

    const verdict = backOfficeVerification(fieldVerified)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('back-office')
  })

  it('will not let the collector verify their own collection', () => {
    const selfVerified = context({
      verification: { userId: 'u-agent-kiran', isBackOffice: true, verifiedAt: NOW.toISOString() },
    })

    expect(backOfficeVerification(selfVerified).ok).toBe(false)
  })

  it('lets a back-office collection close without a field verification step', () => {
    const backOffice = context({ mode: COLLECTION_MODES.backOffice, verification: undefined })
    expect(onFieldRequiresBackOfficeVerification(backOffice).ok).toBe(true)
  })
})

describe('cheque bounce', () => {
  it('creates a follow-up task and reopens the collection', () => {
    const { bus, seen } = recordingBus()
    const bounced = context({ bounceReason: 'Insufficient funds', followUpTaskCreated: true })

    const bounce = collectionMachine.transition(
      COLLECTION_STATES.recorded,
      COLLECTION_STATES.bounced,
      bounced,
      { bus },
    )
    expect(bounce.ok).toBe(true)
    /*
     * One event, not three. The edge used to also emit `task.created` and
     * `message.sent` with the COLLECTION as their subject, while writing neither
     * a task nor a message log — so the audit trail claimed a follow-up the FR-15
     * queue never had. The follow-up is now raised by the
     * `collection.bounceFollowUp` recipe through `TaskRepository.create`, which
     * emits a `task.created` carrying the task's own id. The guard above still
     * refuses a bounce that promises no follow-up.
     */
    expect(seen.map((event) => event.name)).toEqual(['cheque.bounced'])

    const reopen = collectionMachine.transition(
      COLLECTION_STATES.bounced,
      COLLECTION_STATES.recorded,
      bounced,
      { bus },
    )
    expect(reopen.ok).toBe(true)
    expect(reopen.ok === true && reopen.state).toBe(COLLECTION_STATES.recorded)
    expect(seen.map((event) => event.name)).toContain('collection.reopened')
  })

  it('refuses to record a bounce that raises no follow-up task', () => {
    const verdict = bounceRaisesFollowUpTask(context({ bounceReason: 'Insufficient funds' }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('follow-up task')
  })

  it('only a cheque can bounce', () => {
    const online = context({
      instrument: COLLECTION_INSTRUMENTS.online,
      bounceReason: 'Insufficient funds',
      followUpTaskCreated: true,
    })

    const verdict = collectionMachine.canTransition(COLLECTION_STATES.recorded, COLLECTION_STATES.bounced, online)
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('cannot bounce')
  })
})
