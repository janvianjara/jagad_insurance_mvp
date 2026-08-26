/**
 * Is this master value in use? — FR-02, and the half of it that matters:
 * **deactivate, never delete, when something already holds the value.**
 *
 * A master value's key is not a label. It is stored on inquiries, customers,
 * policies and quotations, and deleting the row those records point at does not
 * remove the fact — it turns every one of them into a record whose source, city
 * or reason no longer resolves. So deletion asks a question first, and the
 * question is answered by the same repositories the queues read, through the
 * filters those repositories declare.
 *
 * Two kinds of use count, and both are checked:
 *   - records, counted through a declared probe below;
 *   - configuration itself — a cascade child pointing at this value as its
 *     parent, which is how deleting a Make would orphan its Models.
 *
 * A master type with no probe is not assumed unused: `probed` says so, and the
 * screen prints it, because "nobody looked" and "nothing found" are different
 * sentences. Adding a probe is one line here the day a module declares the
 * filter for it.
 */

import type { Repositories } from '../../../data/repo'
import type { ConfigMasterType, ConfigMasterValue } from './config-types'

export type UsagePlace = {
  readonly label: string
  readonly count: number
}

export type MasterUsage = {
  readonly total: number
  readonly places: readonly UsagePlace[]
  /** False when no module declares how to count this master's use. */
  readonly probed: boolean
}

export const NO_USAGE: MasterUsage = { total: 0, places: [], probed: false }

type UsageProbe = {
  readonly label: string
  readonly count: (
    repositories: Repositories,
    value: ConfigMasterValue,
  ) => Promise<number>
}

/**
 * One row asks for the total, not the page: `total` is the size of the filtered
 * set. Records store the key, but the seeded fixtures store some of these as the
 * label, so both spellings are offered to the filter.
 */
const PROBE = { pageSize: 1 } as const

function spellings(value: ConfigMasterValue): readonly string[] {
  return value.key === value.label ? [value.key] : [value.key, value.label]
}

/**
 * Master type key to where its values are held. Keyed by the master's own key,
 * so a type an admin creates simply has no probe until a module declares one.
 */
const USAGE_PROBES: Readonly<Record<string, readonly UsageProbe[]>> = {
  inquiry_source: [
    {
      label: 'inquiries',
      count: async (repositories, value) =>
        (await repositories.inquiries.list({ ...PROBE, filters: { source: spellings(value) } }))
          .total,
    },
    {
      label: 'customers',
      count: async (repositories, value) =>
        (await repositories.customers.list({ ...PROBE, filters: { source: spellings(value) } }))
          .total,
    },
  ],
  city: [
    {
      label: 'customers',
      count: async (repositories, value) =>
        (await repositories.customers.list({ ...PROBE, filters: { city: spellings(value) } }))
          .total,
    },
  ],
}

export function isProbed(masterTypeKey: string): boolean {
  return USAGE_PROBES[masterTypeKey] !== undefined
}

/** Counts the records holding this value, across every place that declares one. */
export async function usageOf(
  repositories: Repositories,
  type: ConfigMasterType,
  value: ConfigMasterValue,
): Promise<MasterUsage> {
  const probes = USAGE_PROBES[type.key]
  if (!probes) return NO_USAGE

  const counts = await Promise.all(probes.map((probe) => probe.count(repositories, value)))
  const places = probes
    .map((probe, index) => ({ label: probe.label, count: counts[index] ?? 0 }))
    .filter((place) => place.count > 0)

  return {
    total: counts.reduce((sum, count) => sum + count, 0),
    places,
    probed: true,
  }
}

export function describeUsage(usage: MasterUsage): string {
  if (!usage.probed) return 'Use is not counted for this master'
  if (usage.total === 0) return 'Not used by any record'
  return usage.places.map((place) => `${place.count} ${place.label}`).join(', ')
}

/* ---------------------------------------------------------------- deletion */

export const DELETION_OFFERS = {
  /** Deletion is refused, and deactivation does the intended job safely. */
  deactivate: 'deactivate',
  /** Deletion is refused and there is nothing to offer instead. */
  none: 'none',
} as const

export type DeletionOffer = (typeof DELETION_OFFERS)[keyof typeof DELETION_OFFERS]

export type DeletionVerdict = {
  readonly allowed: boolean
  /** Said in full, and rendered as written — it is the refusal the person reads. */
  readonly reason: string
  readonly offer: DeletionOffer | null
}

/**
 * The rule, in one place, so the row's button and the confirmation gate cannot
 * disagree about what is allowed.
 */
export function deletionVerdict(input: {
  readonly type: ConfigMasterType
  readonly value: ConfigMasterValue
  readonly usage: MasterUsage
  /** Cascade children whose parent is this value. */
  readonly childCount: number
}): DeletionVerdict {
  const { type, value, usage, childCount } = input

  if (!type.editable) {
    return {
      allowed: false,
      reason: `"${type.label}" is a platform master: the product's own logic reads these values by key, so they are neither deleted nor deactivated here.`,
      offer: DELETION_OFFERS.none,
    }
  }

  if (childCount > 0) {
    return {
      allowed: false,
      reason: `${childCount} value${childCount === 1 ? '' : 's'} cascade${childCount === 1 ? 's' : ''} from "${value.label}". Deleting it would leave them with no parent.`,
      offer: DELETION_OFFERS.deactivate,
    }
  }

  if (usage.total > 0) {
    return {
      allowed: false,
      reason: `"${value.label}" is held by ${describeUsage(usage)}. Deleting it would leave those records pointing at nothing.`,
      offer: DELETION_OFFERS.deactivate,
    }
  }

  if (!usage.probed) {
    return {
      allowed: true,
      reason: `No module counts the use of "${type.label}" yet, so nothing could be checked beyond configuration itself. Deactivating is the safer choice.`,
      offer: DELETION_OFFERS.deactivate,
    }
  }

  return {
    allowed: true,
    reason: `No record holds "${value.label}", so removing it changes nothing that exists.`,
    offer: null,
  }
}
