/**
 * One clock owner — plan §7, FR-21.
 *
 * `ticks.ts` is re-entrant, so asking it twice costs nothing. Acting on the
 * answer twice costs a customer two messages. This MVP runs in a browser and a
 * user keeps four tabs open, so without an election every open tab is a
 * scheduler: four ticks, four ladders, four reminders a second apart, and an
 * audit trail that makes it look deliberate.
 *
 * The honest form of "distributed" for a single-tenant browser-hosted product is
 * a lease. One tab holds a short-lived lock in shared storage, renews it while it
 * lives, and does the emitting; the others read the lock, see it is held and
 * stay silent. If the holder's tab closes, the lease lapses and the next tab to
 * look takes it. There is no coordinator to run and nothing to install.
 *
 * ## Why the TTL is short and the renewal is frequent
 *
 * A tab that is closed cannot release anything — `pagehide` is a courtesy, not a
 * guarantee, and a killed process fires nothing at all. So the lease has to
 * expire on its own, and how long the clock stays stopped after a crash is
 * exactly the TTL. Renewing at a fraction of it is what keeps a live holder from
 * losing a lease it is still using because one renewal was late.
 *
 * ## Everything here is pure
 *
 * Storage and the clock are injected. There is no `localStorage` in this file
 * and no `Date.now()`, which is what lets a test run two simulated tabs against
 * one shared map and assert that exactly one of them ticks — the assertion the
 * whole mechanism exists for.
 */

/** The shared slot the lease lives in. `localStorage` in the app; a Map in tests. */
export type LeaseStorage = {
  read(): string | null
  write(value: string): void
  clear(): void
}

export type Lease = {
  readonly holder: string
  /** Epoch milliseconds. Past means lapsed, and lapsed means anybody may take it. */
  readonly expiresAt: number
}

export type LeaseOptions = {
  readonly storage: LeaseStorage
  /** This tab's identity. Two tabs must never generate the same one. */
  readonly nodeId: string
  readonly ttlMs: number
  readonly now: () => Date
}

/**
 * Renew at a third of the TTL: two renewals may be lost to a busy main thread
 * before a live holder is treated as dead.
 */
export const LEASE_RENEWAL_FRACTION = 3

export function renewalIntervalMs(ttlMs: number): number {
  return Math.max(1, Math.floor(ttlMs / LEASE_RENEWAL_FRACTION))
}

/**
 * Reads the lease, or null when there is none and when what is there cannot be
 * read. An unparseable lease is treated as absent rather than thrown on: the
 * failure mode of throwing is a clock that never starts again until somebody
 * clears their browser storage.
 */
export function readLease(storage: LeaseStorage): Lease | null {
  const raw = storage.read()
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const { holder, expiresAt } = parsed as { holder?: unknown; expiresAt?: unknown }
  if (typeof holder !== 'string' || holder === '') return null
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null

  return { holder, expiresAt }
}

export function isHeldBy(lease: Lease | null, nodeId: string, at: Date): boolean {
  return lease !== null && lease.holder === nodeId && lease.expiresAt > at.getTime()
}

/**
 * Take the lease, or renew one already held.
 *
 * Returns whether this node holds it afterwards, which is the only question the
 * caller has. A node that holds it emits; a node that does not stays quiet and
 * asks again at the next renewal.
 *
 * Note what is deliberately absent: any attempt to break a live lease. A node
 * that thinks the holder is slow does not get to take over, because two nodes
 * each convinced the other is slow is precisely the double-send this prevents.
 */
export function acquireLease(options: LeaseOptions): boolean {
  const { storage, nodeId, ttlMs, now } = options
  const at = now()
  const lease = readLease(storage)

  const heldBySomebodyElse =
    lease !== null && lease.holder !== nodeId && lease.expiresAt > at.getTime()
  if (heldBySomebodyElse) return false

  const next: Lease = { holder: nodeId, expiresAt: at.getTime() + ttlMs }
  storage.write(JSON.stringify(next))

  /*
   * Read back before believing it. Two tabs can write in the same millisecond and
   * the last write wins; whoever reads their own id back is the holder, and the
   * other one finds a stranger's and stands down. This is what makes the election
   * safe without a compare-and-set primitive the platform does not offer.
   */
  return isHeldBy(readLease(storage), nodeId, at)
}

/** Give it up on the way out, so the next tab does not wait out the TTL. */
export function releaseLease(options: Pick<LeaseOptions, 'storage' | 'nodeId'>): void {
  const lease = readLease(options.storage)
  if (lease !== null && lease.holder !== options.nodeId) return
  options.storage.clear()
}
