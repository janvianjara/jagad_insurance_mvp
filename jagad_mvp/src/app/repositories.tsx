import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { startAutomation } from '../data/automation'
import { createMockRepositories } from '../data/mock'
import type { MockRepositories } from '../data/mock'
import type { Repositories } from '../data/repo'
import { RepositoriesContext } from './repositories-context'

/**
 * The composition root for data — plan §7, "Repository interfaces returning
 * Promises, with a mock adapter behind them."
 *
 * This is the one file in the app that knows the mock adapter exists. Everything
 * below it takes `Repositories`, an interface, so swapping in an HTTP adapter is
 * a change here and nowhere else. It is also the seam every test uses: a test
 * builds its own store with no latency, wraps the tree in this provider, and
 * gets the same screens the app runs with no fixture import anywhere in sight.
 *
 * ## It is also where the automation engine starts — FR-21
 *
 * The engine needs the event bus, and the bus lives on the mock store, so this
 * is the only place in the app that can reach it. Without this the dispatcher is
 * a tested module nothing calls: recipes would stay unsubscribed in the running
 * product exactly as they were before it was written, and the whole of FR-21
 * would be provable in the suite and absent from the app.
 *
 * It starts only when this provider built the repositories itself — the app
 * path. A test that passes its own set gets no engine, because a screen test
 * asserting what a screen does should not have a worker mutating rows underneath
 * it; a test that wants the engine calls `startAutomation` by name, which is
 * also the only way to drive the clock a tick at a time.
 */
export function RepositoriesProvider({
  repositories,
  children,
}: {
  /** Omit in the app; pass one in tests. */
  repositories?: Repositories
  children: ReactNode
}) {
  // Built once per provider, not per render: the mock store holds the whole
  // in-memory database and rebuilding it would silently discard every mutation.
  const [fallback] = useState<MockRepositories | null>(() =>
    repositories ? null : createMockRepositories(),
  )

  useEffect(() => {
    if (fallback === null) return

    const runtime = startAutomation({
      repositories: fallback,
      store: fallback.store,
      // One id per mount. Two tabs must never collide, and `randomUUID` is the
      // only source of that which needs no server.
      nodeId: crypto.randomUUID(),
      // The wall clock, not the fixture anchor — see `AutomationOptions.now`.
      now: () => new Date(),
      autoStart: true,
      onError: (error) => {
        // A broken recipe is already a refused run in the ledger with the throw
        // in its sentence; this is only so it is visible in the console too.
        console.error('[automation]', error)
      },
    })

    return () => runtime.stop()
  }, [fallback])

  return <RepositoriesContext value={repositories ?? fallback}>{children}</RepositoriesContext>
}
