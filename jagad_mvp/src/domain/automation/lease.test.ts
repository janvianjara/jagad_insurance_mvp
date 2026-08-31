import { describe, expect, it } from 'vitest'

import {
  LEASE_RENEWAL_FRACTION,
  acquireLease,
  isHeldBy,
  readLease,
  releaseLease,
  renewalIntervalMs,
} from './lease'
import type { LeaseStorage } from './lease'

/** One slot both simulated tabs read and write, which is what a browser gives them. */
function sharedStorage(): LeaseStorage & { readonly raw: () => string | null } {
  let value: string | null = null
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = null
    },
    raw: () => value,
  }
}

const TTL = 30_000

function tab(storage: LeaseStorage, nodeId: string, now: () => Date) {
  return { storage, nodeId, ttlMs: TTL, now }
}

describe('the clock lease', () => {
  it('lets exactly one of two tabs hold it, which is the whole reason it exists', () => {
    const storage = sharedStorage()
    const now = () => new Date('2026-08-30T10:00:00.000Z')

    const first = acquireLease(tab(storage, 'tab-a', now))
    const second = acquireLease(tab(storage, 'tab-b', now))

    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it('holds it across five tabs opened at once, not just two', () => {
    const storage = sharedStorage()
    const now = () => new Date('2026-08-30T10:00:00.000Z')

    const held = ['a', 'b', 'c', 'd', 'e'].filter((id) =>
      acquireLease(tab(storage, `tab-${id}`, now)),
    )

    expect(held).toEqual(['a'])
  })

  it('lets the holder renew without standing down', () => {
    const storage = sharedStorage()
    let at = new Date('2026-08-30T10:00:00.000Z')
    const now = () => at

    expect(acquireLease(tab(storage, 'tab-a', now))).toBe(true)
    at = new Date('2026-08-30T10:00:10.000Z')
    expect(acquireLease(tab(storage, 'tab-a', now))).toBe(true)
    expect(readLease(storage)?.expiresAt).toBe(at.getTime() + TTL)
  })

  it('re-elects once the lease lapses, so a closed tab does not stop the clock forever', () => {
    const storage = sharedStorage()
    let at = new Date('2026-08-30T10:00:00.000Z')
    const now = () => at

    expect(acquireLease(tab(storage, 'tab-a', now))).toBe(true)

    // tab-a is gone; it releases nothing because a killed process fires nothing.
    at = new Date('2026-08-30T10:00:31.000Z')
    expect(acquireLease(tab(storage, 'tab-b', now))).toBe(true)
    expect(readLease(storage)?.holder).toBe('tab-b')
  })

  it('will not let a second tab break a live lease, however slow it thinks the holder is', () => {
    const storage = sharedStorage()
    let at = new Date('2026-08-30T10:00:00.000Z')
    const now = () => at

    acquireLease(tab(storage, 'tab-a', now))
    at = new Date('2026-08-30T10:00:29.000Z')

    expect(acquireLease(tab(storage, 'tab-b', now))).toBe(false)
    expect(readLease(storage)?.holder).toBe('tab-a')
  })

  it('hands the lease back on release, so the next tab does not wait out the TTL', () => {
    const storage = sharedStorage()
    const now = () => new Date('2026-08-30T10:00:00.000Z')

    acquireLease(tab(storage, 'tab-a', now))
    releaseLease({ storage, nodeId: 'tab-a' })

    expect(readLease(storage)).toBeNull()
    expect(acquireLease(tab(storage, 'tab-b', now))).toBe(true)
  })

  it('will not let one tab release another tab’s lease', () => {
    const storage = sharedStorage()
    const now = () => new Date('2026-08-30T10:00:00.000Z')

    acquireLease(tab(storage, 'tab-a', now))
    releaseLease({ storage, nodeId: 'tab-b' })

    expect(readLease(storage)?.holder).toBe('tab-a')
  })

  it('treats an unreadable lease as absent rather than throwing, so the clock can restart', () => {
    const storage = sharedStorage()
    storage.write('{ this is not json')

    expect(readLease(storage)).toBeNull()
    expect(acquireLease(tab(storage, 'tab-a', () => new Date()))).toBe(true)
  })

  it('treats a lease with the wrong shape as absent', () => {
    const storage = sharedStorage()
    storage.write(JSON.stringify({ holder: 'tab-a', expiresAt: 'soon' }))

    expect(readLease(storage)).toBeNull()
  })

  it('renews well inside the TTL, so a busy main thread cannot lose a live lease', () => {
    expect(renewalIntervalMs(TTL)).toBe(TTL / LEASE_RENEWAL_FRACTION)
    expect(renewalIntervalMs(TTL)).toBeLessThan(TTL)
    // Two missed renewals still fit inside the window.
    expect(renewalIntervalMs(TTL) * 2).toBeLessThan(TTL)
  })

  it('never returns a renewal interval of zero, which would be a busy loop', () => {
    expect(renewalIntervalMs(1)).toBe(1)
    expect(renewalIntervalMs(0)).toBe(1)
  })

  it('reports a lapsed lease as not held, even by its own holder', () => {
    const lease = { holder: 'tab-a', expiresAt: Date.parse('2026-08-30T10:00:00.000Z') }

    expect(isHeldBy(lease, 'tab-a', new Date('2026-08-30T09:59:59.000Z'))).toBe(true)
    expect(isHeldBy(lease, 'tab-a', new Date('2026-08-30T10:00:01.000Z'))).toBe(false)
    expect(isHeldBy(null, 'tab-a', new Date())).toBe(false)
  })
})
