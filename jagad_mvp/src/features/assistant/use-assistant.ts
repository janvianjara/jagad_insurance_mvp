/**
 * The Assistant's only door to data.
 *
 * `createAssistantRepository(repos, user)` is handed the same repositories the
 * rest of the app uses and the signed-in user, and hands back a facade whose
 * every method returns a projection. This hook is where those two meet, and it
 * is the reason no component below it ever sees an entity: there is nothing else
 * in this feature that can reach the data layer, and the eslint zone makes that
 * a build error rather than a convention (plan §14.1, FR-22.13).
 *
 * It runs as the signed-in user and never as anyone else. There is no parameter
 * for a different user and there must not be one — FR-22.3's "no elevation,
 * ever" is enforced by there being no argument to elevate with.
 */

import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { createAssistantRepository } from '../../data/assistant'
import type { AssistantRepository } from '../../data/assistant'
import { useResource } from '../../lib/useResource'
import type { Resource } from '../../lib/useResource'
import { emptySnapshot, loadQueueSnapshot } from './briefing/snapshot'
import type { QueueSnapshot } from './briefing/snapshot'

export type AssistantSession = {
  /** Null only when the tree was mounted without a hydrated session. */
  readonly repo: AssistantRepository | null
  /** Which briefing template and which chips this account gets. */
  readonly templateKey: string
  readonly userName: string
  /** False when the account holds no Assistant grant — a sub-agent, today. */
  readonly enabled: boolean
}

export function useAssistantSession(): AssistantSession {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)

  if (!user) return { repo: null, templateKey: 'none', userName: '', enabled: false }

  // Rebuilt per render rather than memoised: React Compiler owns memoisation in
  // this codebase, and the facade is a bag of closures over an existing store.
  const repo = createAssistantRepository(repositories, user)

  return {
    repo,
    templateKey: user.templateKey,
    userName: user.name,
    enabled: repo.enabled,
  }
}

/**
 * One read of the queue, reloaded when the account changes.
 *
 * The key is the user id, so switching accounts in the rail footer re-runs the
 * counts as the new person rather than showing the previous one's queue under a
 * new name — which would be a scope leak that looked like a caching bug.
 */
export function useQueueSnapshot(session: AssistantSession): Resource<QueueSnapshot> {
  const { repo } = session

  return useResource(async () => {
    const now = new Date()
    return repo ? loadQueueSnapshot(repo, now) : emptySnapshot(now, false)
  }, repo ? repo.user.id : 'no-session')
}
