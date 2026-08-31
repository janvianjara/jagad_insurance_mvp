/**
 * The collections desk — the seam `/back-office/collections` reads and writes
 * through.
 *
 * `CollectionRepository` (plan §7) already does all the work: `verify` and
 * `markBounced` route through `collectionMachine`, so every guard in §9 —
 * back-office-only verification, the collector barred from verifying their own
 * take, cheques only for a bounce, a follow-up task raised in the same move — is
 * enforced below this file and refuses with the machine's own sentence.
 *
 * So this module supplies exactly two things the repository does not:
 *
 *   `awaitingVerification` — the queue's read, with the state set pinned rather
 *                            than left to the URL. `COLLECTION_VERIFICATION_STATES`
 *                            is the constant the ops board counts with, so the
 *                            tile's number and this list are made of the same
 *                            thing and cannot drift.
 *
 *   `verifierIsBackOffice`  — the one fact the repository asks for and cannot
 *                            know. §9 makes verification a back-office act, and
 *                            whether a signed-in user sits in the back office is
 *                            a permissions question, not a collections one.
 *
 * Nothing here computes an amount, and nothing here decides a transition.
 */

import { can } from '../../../domain/permissions'
import type { User } from '../../../domain/permissions'
import type {
  BounceCollectionCommand,
  CollectionRecord,
  ListQuery,
  MutationResult,
  Page,
  Repositories,
  VerifyCollectionCommand,
} from '../../../data/repo'
import { COLLECTION_VERIFICATION_STATES } from '../../backoffice'

export type CollectionDesk = {
  /** The queue: money taken through the agency that nobody has checked yet. */
  awaitingVerification(query?: ListQuery): Promise<Page<CollectionRecord>>
  verify(id: string, command: VerifyCollectionCommand): Promise<MutationResult<CollectionRecord>>
  markBounced(
    id: string,
    command: BounceCollectionCommand,
  ): Promise<MutationResult<CollectionRecord>>
}

const CACHE = new WeakMap<Repositories, CollectionDesk>()

/** One desk per repository set, so two mounts of the queue share one seam. */
export function collectionDesk(repositories: Repositories): CollectionDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

function buildDesk(repositories: Repositories): CollectionDesk {
  return {
    async awaitingVerification(query) {
      // The state is pinned, not merged with the URL's: a link asking for
      // `verified` would otherwise widen the queue past what its address says it
      // is. Every other filter the URL carries is passed through untouched.
      return repositories.collections.list({
        ...query,
        filters: { ...query?.filters, state: COLLECTION_VERIFICATION_STATES },
      })
    },

    async verify(id, command) {
      return repositories.collections.verify(id, command)
    },

    async markBounced(id, command) {
      return repositories.collections.markBounced(id, command)
    },
  }
}

/**
 * Whether this user may verify a collection at all — §9's "verification of a
 * collection is a back-office act".
 *
 * Read off the permission template rather than off a role string: `can()` is the
 * one evaluator, and a role compared by name here would be a second, quieter
 * definition of who the back office is.
 *
 * The machine checks this again with what it is told, and it also refuses the
 * collector verifying their own take — a fact this function cannot see, because
 * it is about the record rather than about the person.
 */
export function isBackOfficeVerifier(user: User): boolean {
  return can(user, 'edit', 'backOffice')
}
