/**
 * Boot — plan §7, "Zustand slice, hydrated once at boot."
 *
 * The staff list comes from the config repository like every other read, so the
 * shell has no fixture import and no hard-coded persona. Resolving a staff
 * record into a `User` (template looked up, scopes attached) happens once here;
 * from then on `can()` is evaluating a resolved object rather than chasing a key
 * through a table on every nav item.
 *
 * There is no login in M0. Sign-in is the rail footer's account switcher, which
 * is honest about what this build is and keeps the whole permission story
 * demonstrable in one click.
 */

import { useEffect } from 'react'
import { useResource } from '../lib/useResource'
import { useRepositories } from './repositories-context'
import { resolveAccount, useSessionStore } from './store'

export type BootState = {
  readonly ready: boolean
  readonly error: Error | null
}

export function useSessionBoot(): BootState {
  const repositories = useRepositories()
  const ready = useSessionStore((state) => state.ready)
  const hydrate = useSessionStore((state) => state.hydrate)

  const accounts = useResource(async () => {
    const staff = await repositories.config.users()
    return staff.filter((person) => person.active).map(resolveAccount)
  }, 'session:accounts')

  const loaded = accounts.data

  useEffect(() => {
    if (!loaded || ready) return
    hydrate(loaded)
  }, [loaded, ready, hydrate])

  return { ready, error: accounts.error }
}
