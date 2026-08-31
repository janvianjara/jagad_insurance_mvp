/**
 * "Are we exposed?" — the one question somebody opens a compliance register to
 * ask, answered before anything else on the page.
 *
 * Six obligations, one line each, in the product's own colours: lime where a
 * person is needed, amber where a window is running, red where one has run out,
 * green where there is genuinely nothing outstanding. The number on each line is
 * the count of things that need somebody, never the count of rows that exist —
 * "412 audit entries" is not an answer to "are we exposed", and "3 rights
 * requests waiting, oldest 34 days" is.
 *
 * Every figure is derived from the same functions the sections themselves render
 * from, so a tile cannot say all-clear over a section that is red. No React and
 * no repository.
 */

import { POLICY_ENTRY_PATHS, retentionWindowElapsed } from '../../../domain/workflows'
import type { KycState } from '../../../domain/workflows'
import type { Customer, Policy, RetentionClass } from '../../../data/repo'
import type { Tone } from '../../../ui/tone'
import type { BreachRecord } from './breach-runbook'
import { breachesAtRisk, openBreaches } from './breach-runbook'
import type { MinorMember } from './parental-consent'
import { minorsNeedingConsent } from './parental-consent'
import type { ProcessorRow } from './processor-registry'
import { processorsWithGaps } from './processor-registry'
import type { DataPrincipalRequest } from './rights-requests'
import { outstandingRequests, overdueRequests } from './rights-requests'

export type StandingItem = {
  readonly id: string
  readonly label: string
  /** The figure, already a string. Nothing here formats money or dates. */
  readonly headline: string
  /** What the figure means, and how long it has been that way. */
  readonly meta: string
  readonly tone: Tone
  /** The section this opens, as the `tab` parameter names it. */
  readonly section: string | null
}

export type StandingInput = {
  readonly requests: readonly DataPrincipalRequest[]
  readonly breaches: readonly BreachRecord[]
  readonly customers: readonly Customer[]
  readonly minors: readonly MinorMember[]
  readonly policies: readonly Policy[]
  readonly retentionClasses: readonly RetentionClass[]
  readonly processors: readonly ProcessorRow[]
  readonly auditEntries: number
  readonly now: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS))
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/**
 * Closed policies whose retention window has already elapsed but which are not
 * locked yet. The guard that decides it is the policy machine's own, so this
 * count and the lock the machine would allow are the same judgement.
 */
export function policiesDueToLock(
  policies: readonly Policy[],
  customers: readonly Customer[],
  retentionClasses: readonly RetentionClass[],
  now: Date,
): readonly Policy[] {
  const byClass = Object.fromEntries(retentionClasses.map((entry) => [entry.key, entry.years]))
  const kycByCustomer = new Map(customers.map((customer) => [customer.id, customer.kycState]))

  return policies.filter((policy) => {
    if (policy.status !== 'closed') return false
    if (policy.expiryDate === null) return false
    return retentionWindowElapsed({
      now,
      entryPath: POLICY_ENTRY_PATHS.direct,
      kycState: (kycByCustomer.get(policy.customerId) ?? 'pending') as KycState,
      retentionClass: policy.retentionClass,
      retentionYearsByClass: byClass,
      closedAt: policy.expiryDate,
    }).ok
  })
}

/** Consent links nobody has followed up: expired, or never sent at all. */
export function consentNeedingAPerson(customers: readonly Customer[]): readonly Customer[] {
  return customers.filter(
    (customer) => customer.consentState === 'expired' || customer.consentState === 'not_sent',
  )
}

export function complianceStanding(input: StandingInput): readonly StandingItem[] {
  const outstanding = outstandingRequests(input.requests)
  const overdue = overdueRequests(input.requests, input.now)
  const oldest = outstanding.toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0]

  const open = openBreaches(input.breaches)
  const atRisk = breachesAtRisk(input.breaches, input.now)

  const waitingConsent = consentNeedingAPerson(input.customers)
  const minorsWaiting = minorsNeedingConsent(input.minors)

  const dueToLock = policiesDueToLock(
    input.policies,
    input.customers,
    input.retentionClasses,
    input.now,
  )
  const classesWithNoPeriod = input.retentionClasses.filter((entry) => entry.years <= 0)

  const gapped = processorsWithGaps(input.processors)

  return [
    {
      id: 'rights',
      label: 'Rights requests',
      headline: String(outstanding.length),
      meta:
        outstanding.length === 0
          ? 'Nothing from a data principal is waiting on a decision.'
          : `${plural(outstanding.length, 'request', 'requests')} awaiting a decision, the oldest received ${daysSince(oldest?.receivedAt ?? input.now.toISOString(), input.now)} days ago. ${overdue.length} past the response window.`,
      tone: overdue.length > 0 ? 'bad' : outstanding.length > 0 ? 'attn' : 'ok',
      section: 'rights',
    },
    {
      id: 'breach',
      label: 'Breaches',
      headline: String(open.length),
      meta:
        input.breaches.length === 0
          ? 'No breach has been recorded. The runbook is ready and nothing is running against it.'
          : `${plural(open.length, 'incident', 'incidents')} with the runbook unfinished. ${atRisk.length} with a notification window already run out.`,
      tone: atRisk.length > 0 ? 'bad' : open.length > 0 ? 'warn' : 'ok',
      section: 'breach',
    },
    {
      id: 'consent',
      label: 'Consent',
      headline: String(waitingConsent.length + minorsWaiting.length),
      meta: `${waitingConsent.length} ${plural(waitingConsent.length, 'customer whose consent link', 'customers whose consent links')} nobody has followed up, and ${minorsWaiting.length} ${plural(minorsWaiting.length, 'minor', 'minors')} with no guardian consent on file.`,
      tone: waitingConsent.length + minorsWaiting.length > 0 ? 'attn' : 'ok',
      section: 'consent',
    },
    {
      id: 'retention',
      label: 'Retention',
      headline: String(dueToLock.length),
      meta:
        classesWithNoPeriod.length > 0
          ? `${dueToLock.length} closed ${plural(dueToLock.length, 'policy is', 'policies are')} past the window their class configures. ${classesWithNoPeriod.length} ${plural(classesWithNoPeriod.length, 'class has', 'classes have')} no period configured at all, so nothing in them will ever lock.`
          : `${dueToLock.length} closed ${plural(dueToLock.length, 'policy is', 'policies are')} past the window their class configures and can be locked. Locking is not deletion: the record stays readable and nothing can change it.`,
      tone: classesWithNoPeriod.length > 0 ? 'warn' : dueToLock.length > 0 ? 'attn' : 'ok',
      section: 'retention',
    },
    {
      id: 'processors',
      label: 'Processors',
      headline: String(gapped.length),
      meta: `${input.processors.length} ${plural(input.processors.length, 'processor', 'processors')} handle personal data for this agency. ${gapped.length} ${plural(gapped.length, 'has something', 'have something')} an auditor would ask about.`,
      tone: gapped.length > 0 ? 'attn' : 'ok',
      section: 'processors',
    },
    {
      id: 'audit',
      label: 'Audit trail',
      headline: String(input.auditEntries),
      meta:
        'Every entry points at a record the platform holds. Nothing is ever removed from the trail, and no entry carries a document’s contents or a consent token.',
      tone: 'idle',
      section: null,
    },
  ]
}
