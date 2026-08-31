/**
 * The six depths, read once — plan §5 "Back-office work queue", FR-08.1.
 *
 * Every one of these is a `total` off a page of size one. That is the whole
 * trick and it is worth stating: `Page.total` is the size of the *filtered* set
 * rather than of the page (§7), so a one-row read answers "how deep is this
 * queue" without pulling the queue itself across. Six reads, six numbers, no
 * rows — the home is a signpost, and a signpost that loaded six queues would be
 * slower than the six screens it points at.
 *
 * Each read uses the filter the owning queue already declares, with the state
 * set imported from `queues.ts` — the same constant the tile's link is built
 * from. A count and a link that could disagree is the one defect this screen can
 * actually ship, so they are made of the same thing.
 *
 * Nothing here writes. The back-office home has no mutation on it at all: the
 * work is done on the screen that owns the queue, next to the record it is
 * about.
 */

import type { Repositories } from '../../../data/repo'
import {
  CLAIM_FOLLOW_UP_STATES,
  COLLECTION_VERIFICATION_STATES,
  KYC_OUTSTANDING_STATES,
  OPS_QUEUE_KEYS,
  SUB_AGENT_INTAKE_STATES,
} from '../queues'
import type { OpsQueueKey } from '../queues'

/** One row is all any of these reads needs; the count comes off `total`. */
const DEPTH_PROBE = { page: 1, pageSize: 1 } as const

export type OpsBoard = {
  /** Queue key to how many rows are waiting in it. */
  readonly depths: Readonly<Record<OpsQueueKey, number>>
  /** Everything waiting, across the six. */
  readonly waiting: number
}

export type OpsDesk = {
  board(): Promise<OpsBoard>
}

const CACHE = new WeakMap<Repositories, OpsDesk>()

/** One desk per repository set, so two mounts of the home share one answer shape. */
export function opsDesk(repositories: Repositories): OpsDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

function buildDesk(repositories: Repositories): OpsDesk {
  return {
    async board() {
      const [entry, kyc, drafts, collections, claims, intake] = await Promise.all([
        repositories.deals.awaitingPolicyEntry(DEPTH_PROBE),
        repositories.customers.list({
          ...DEPTH_PROBE,
          filters: { kycState: KYC_OUTSTANDING_STATES },
        }),
        repositories.policies.completionQueue(DEPTH_PROBE),
        repositories.collections.list({
          ...DEPTH_PROBE,
          filters: { state: COLLECTION_VERIFICATION_STATES },
        }),
        repositories.claims.queue({
          ...DEPTH_PROBE,
          filters: { state: CLAIM_FOLLOW_UP_STATES },
        }),
        repositories.inquiries.list({
          ...DEPTH_PROBE,
          filters: { source: ['sub_agent'], status: SUB_AGENT_INTAKE_STATES },
        }),
      ])

      const depths: Readonly<Record<OpsQueueKey, number>> = {
        [OPS_QUEUE_KEYS.entry]: entry.total,
        [OPS_QUEUE_KEYS.kyc]: kyc.total,
        [OPS_QUEUE_KEYS.drafts]: drafts.total,
        [OPS_QUEUE_KEYS.collections]: collections.total,
        [OPS_QUEUE_KEYS.claims]: claims.total,
        [OPS_QUEUE_KEYS.intake]: intake.total,
      }

      return {
        depths,
        waiting: Object.values(depths).reduce((running, depth) => running + depth, 0),
      }
    },
  }
}
