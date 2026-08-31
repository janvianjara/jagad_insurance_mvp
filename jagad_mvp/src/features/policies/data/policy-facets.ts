/**
 * The two facets of a policy that live one tab in from its file: its version
 * history and its premium schedule.
 *
 * A desk rather than a repository method, for the reason `collection-desk.ts`
 * gives: everything here is a composition of reads that already exist —
 * `endorsements.forPolicy`, `schedules.forPolicy`, `schedules.instalments`,
 * `schedules.mandate`, `schedules.mandateEvents` — and none of it is a rule.
 * Nothing in this file writes, decides or derives; the only thing it adds is the
 * order the reads go out in, which is two rounds rather than five.
 *
 * It is loaded with the policy rather than when a tab is opened. The three tabs
 * are facets of ONE record, so reading the record means reading its facets: a
 * person moving between overview, versions and schedule is moving inside data
 * already in hand, and landing cold on the schedule loads it on the first paint
 * instead of after a correction.
 */

import type {
  Endorsement,
  InstalmentDue,
  Mandate,
  MandateEvent,
  PremiumSchedule,
  Repositories,
} from '../../../data/repo'

/** The premium schedule as a whole: the plan, its rows, and the mandate behind it. */
export type SchedulePacket = {
  /** Null where the policy is paid in one go, which is not a fault. */
  readonly schedule: PremiumSchedule | null
  /** Every instalment on the schedule, in sequence. Empty when there is no schedule. */
  readonly instalments: readonly InstalmentDue[]
  /** Null where no mandate was ever registered — a real state, and a different one from failed. */
  readonly mandate: Mandate | null
  /** What the bank reported, newest last. The platform records these; it never causes them. */
  readonly mandateEvents: readonly MandateEvent[]
}

export type PolicyFacets = {
  /** Every endorsement raised against this policy, whatever state it is in. */
  readonly endorsements: readonly Endorsement[]
  readonly schedule: SchedulePacket
}

export async function loadPolicyFacets(
  repositories: Repositories,
  policyId: string,
): Promise<PolicyFacets> {
  const [endorsements, schedule, mandate] = await Promise.all([
    repositories.endorsements.forPolicy(policyId),
    repositories.schedules.forPolicy(policyId),
    repositories.schedules.mandate(policyId),
  ])

  const [instalments, mandateEvents] = await Promise.all([
    schedule === null
      ? Promise.resolve<readonly InstalmentDue[]>([])
      : repositories.schedules.instalments(schedule.id),
    mandate === null
      ? Promise.resolve<readonly MandateEvent[]>([])
      : repositories.schedules.mandateEvents(mandate.id),
  ])

  return { endorsements, schedule: { schedule, instalments, mandate, mandateEvents } }
}
