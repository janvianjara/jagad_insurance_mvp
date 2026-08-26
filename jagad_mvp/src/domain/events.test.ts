import { describe, expect, it, vi } from 'vitest'
import {
  createEventBus,
  DOMAIN_EVENT_NAMES,
  isDomainEventName,
} from './events'
import type { DomainEvent } from './events'

const FIXED_NOW = () => new Date('2026-08-26T09:30:00.000Z')

describe('event names', () => {
  it('carries the names the FR contracts already use', () => {
    for (const name of [
      'inquiry.created',
      'inquiry.unconfirmed',
      'quotation.won',
      'deal.created',
      'kyc.completed',
      'policy.issued',
      'claim.raised',
      'claim.status_changed',
      'renewal.due',
      'mandate.failed',
      'cheque.bounced',
      'endorsement.approved',
    ]) {
      expect(isDomainEventName(name)).toBe(true)
    }
  })

  it('has no duplicates, so a subscriber cannot fire twice for one transition', () => {
    expect(new Set(DOMAIN_EVENT_NAMES).size).toBe(DOMAIN_EVENT_NAMES.length)
  })

  it('names every event as entity.past_tense', () => {
    for (const name of DOMAIN_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z]+\.[a-z_]+$/)
    }
  })
})

describe('dispatch', () => {
  it('delivers to the named subscriber only', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const issued = vi.fn()
    const lapsed = vi.fn()

    bus.on('policy.issued', issued)
    bus.on('policy.lapsed', lapsed)
    bus.emit('policy.issued', { subject: { entity: 'Policy', id: 'POL-0031' } })

    expect(issued).toHaveBeenCalledTimes(1)
    expect(lapsed).not.toHaveBeenCalled()
    expect(issued.mock.calls[0][0]).toEqual({
      name: 'policy.issued',
      at: '2026-08-26T09:30:00.000Z',
      subject: { entity: 'Policy', id: 'POL-0031' },
    })
  })

  it('stamps the time from an injectable clock, so fixtures stay deterministic', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    expect(bus.emit('inquiry.created').at).toBe('2026-08-26T09:30:00.000Z')
  })

  it('lets a caller supply the time for a backdated record', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    expect(bus.emit('policy.issued', { at: '2025-03-12T00:00:00.000Z' }).at).toBe(
      '2025-03-12T00:00:00.000Z',
    )
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const handler = vi.fn()

    const off = bus.on('task.created', handler)
    bus.emit('task.created')
    off()
    bus.emit('task.created')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('delivers everything to onAny subscribers', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const seen: string[] = []

    bus.onAny((event) => seen.push(event.name))
    bus.emit('kyc.completed')
    bus.emit('credentials.generated')

    expect(seen).toEqual(['kyc.completed', 'credentials.generated'])
  })
})

describe('the audit seam', () => {
  it('gives the audit sink the whole log, which is what the record timeline reads', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const audit: DomainEvent[] = []

    bus.onAudit((event) => audit.push(event))
    bus.emit('inquiry.created', { actorId: 'u-priya', subject: { entity: 'Inquiry', id: 'INQ-1041' } })
    bus.emit('inquiry.escalated', {
      actorId: 'u-priya',
      subject: { entity: 'Inquiry', id: 'INQ-1041' },
      detail: { reason: 'tat_elapsed', level: 2 },
    })

    expect(audit.map((event) => event.name)).toEqual(['inquiry.created', 'inquiry.escalated'])
    expect(audit[1].detail).toEqual({ reason: 'tat_elapsed', level: 2 })
    expect(audit[1].actorId).toBe('u-priya')
  })

  it('runs the audit sink before ordinary subscribers', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const order: string[] = []

    bus.on('policy.issued', () => order.push('subscriber'))
    bus.onAudit(() => order.push('audit'))
    bus.emit('policy.issued')

    expect(order).toEqual(['audit', 'subscriber'])
  })

  it('lets a failed audit write fail the transition rather than leaving it unlogged', () => {
    const bus = createEventBus({ now: FIXED_NOW })
    const subscriber = vi.fn()

    bus.onAudit(() => {
      throw new Error('audit store unavailable')
    })
    bus.on('policy.issued', subscriber)

    expect(() => bus.emit('policy.issued')).toThrow('audit store unavailable')
    expect(subscriber).not.toHaveBeenCalled()
  })
})
