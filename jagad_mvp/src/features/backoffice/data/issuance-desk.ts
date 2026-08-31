/**
 * The issuance desk — the seam `/back-office/issuance` reads and writes through.
 *
 * `PolicyRepository` already carries every §9 move this screen makes:
 * `createProposal`, `sendProposal` and `issue` all route through
 * `policyMachine`, so KYC-complete and a typed non-empty Final Premium are
 * enforced below this file and refuse with the machine's own sentence. The
 * policies feature already wraps them in `policyDesk`, and this desk delegates
 * to that rather than reaching past it — two decorators over one repository
 * would give the queue and the policy file different answers about what has been
 * attached and confirmed.
 *
 * So there are exactly three things here that no repository supplies:
 *
 *   **The span.** `awaitingIssuance` pins the status set to `ISSUANCE_STATES`,
 *   intersecting rather than replacing whatever the URL asked for. A link can
 *   narrow this queue to one stage; it cannot widen it past its own address into
 *   drafts or closed files.
 *
 *   **"Insurer number awaited" as a filter.** `Policy.insurerNo` is not a filter
 *   `PolicyRepository` declares, and it is the single most important question on
 *   this desk. So it is applied here, after the repository's own read — the same
 *   move `documentVault` makes for retention class, and for the same reason: a
 *   feature-level narrowing belongs to the feature, not smuggled into the
 *   transport.
 *
 *   **The entry beside the contract.** A row wants to say how long the record has
 *   been in the desk, and the only timestamp that exists for that is
 *   `PolicyEntryDraft.savedAt`. Drafts are read for the rows on the page and for
 *   no others — bounded by the page size, in one `Promise.all` — because the set
 *   of policies in this span is the agency's whole book and a wide draft read
 *   would be a request per policy for rows nobody is looking at.
 *
 * Nothing here computes an amount, and nothing here decides a transition.
 */

import type {
  ListQuery,
  MutationResult,
  Page,
  Policy,
  PolicyEntryDraft,
  Repositories,
} from '../../../data/repo'
import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
// The policies module's own desk, by its own path. Importing it from the
// feature index would pull four screens into a data module that needs one seam.
import { policyDesk } from '../../policies/data/policy-desk'
import type { PolicyDesk } from '../../policies/data/policy-desk'
import { ISSUANCE_STATES, insurerNumberStateOf } from '../issuance-view'

/** Big enough to hold the whole in-memory set; the insurer-number pass needs every row. */
const SCAN_SIZE = 10_000

/**
 * The filter key the repository does not declare, applied on this desk instead.
 *
 * Named `insurer` rather than `insurerNo` because it is a question about a state
 * — awaited or received — not a search for a particular number. It is checked
 * against `RESERVED_QUEUE_PARAMS` by `<WorkQueue>` at mount, so a collision with
 * a URL parameter fails loudly rather than silently shadowing one.
 */
export const INSURER_NUMBER_FILTER = 'insurer'

/** The status filter key, which the repository does declare. */
export const STAGE_FILTER = 'status'

/**
 * One row: the contract, and the entry that was typed to create it.
 *
 * The draft is nullable and often null — a policy loaded from the agency's
 * previous book has no entry, because nobody typed one. The row says "not
 * recorded" for those rather than borrowing a date from somewhere else.
 */
export type IssuanceRow = {
  readonly policy: Policy
  readonly draft: PolicyEntryDraft | null
}

export type IssuanceDesk = {
  /** The queue: policies with the insurer, or issued and not yet with the customer. */
  awaitingIssuance(query?: ListQuery): Promise<Page<IssuanceRow>>
  /** The policies desk, for the panels that already know how to issue. */
  readonly policies: PolicyDesk
  /**
   * Sends a raised proposal to the insurer. Outward and notifying, so every
   * caller puts it behind a gate; the machine owns whether it may happen at all.
   */
  sendProposal(policyId: string, actorId: string, now?: Date): Promise<MutationResult<Policy>>
}

const CACHE = new WeakMap<Repositories, IssuanceDesk>()

/** One desk per repository set, so two mounts of the queue share one seam. */
export function issuanceDesk(repositories: Repositories): IssuanceDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

/**
 * The stages this read will ask the repository for.
 *
 * An empty or absent request is the whole span. A request is intersected with
 * it, so `?status=sent` narrows to one stage and `?status=closed` narrows to
 * nothing the queue owns — in which case the span is used, because a URL that
 * names only states this desk does not hold is a malformed link rather than an
 * instruction to show an empty list.
 */
export function stagesFor(asked: readonly string[] | undefined): readonly string[] {
  if (!asked || asked.length === 0) return ISSUANCE_STATES
  const narrowed = asked.filter((state) => (ISSUANCE_STATES as readonly string[]).includes(state))
  return narrowed.length === 0 ? ISSUANCE_STATES : narrowed
}

/** Splits the insurer-number question out of the query the repository will see. */
function splitInsurerFilter(query: ListQuery): {
  readonly wanted: readonly string[]
  readonly rest: ListQuery
} {
  const filters = { ...(query.filters ?? {}) }
  const wanted = filters[INSURER_NUMBER_FILTER] ?? []
  delete filters[INSURER_NUMBER_FILTER]
  return { wanted, rest: { ...query, filters } }
}

function buildDesk(repositories: Repositories): IssuanceDesk {
  const policies = policyDesk(repositories)

  return {
    policies,

    async awaitingIssuance(query = {}) {
      const { wanted, rest } = splitInsurerFilter(query)

      // Wide, because the insurer-number pass has to see every row before the
      // page is cut — the same shape `documentVault.list` takes. Search, sort
      // and every other filter are the repository's own work and are passed
      // through untouched.
      const wide = await repositories.policies.list({
        ...rest,
        filters: { ...rest.filters, [STAGE_FILTER]: stagesFor(rest.filters?.[STAGE_FILTER]) },
        page: 1,
        pageSize: SCAN_SIZE,
      })

      const matched = wide.rows.filter(
        (policy) => wanted.length === 0 || wanted.includes(insurerNumberStateOf(policy)),
      )

      const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
      const pageCount = Math.ceil(matched.length / pageSize)
      const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
      const start = (page - 1) * pageSize
      const visible = matched.slice(start, start + pageSize)

      // Bounded by the page, in parallel. A draft is the only timestamp the book
      // holds for "in the desk since", and reading one per visible row is the
      // price of saying so honestly.
      const drafts = await Promise.all(
        visible.map((policy) => repositories.policies.draft(policy.id)),
      )

      return {
        rows: visible.map((policy, index) => ({ policy, draft: drafts[index] ?? null })),
        total: matched.length,
        page,
        pageSize,
        pageCount,
      }
    },

    async sendProposal(policyId, actorId, now) {
      return policies.sendProposal(policyId, actorId, now)
    },
  }
}
