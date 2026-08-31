import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Icon } from '../../ui/Icon'
import { Skeleton } from '../../ui/data'
import { Badge } from '../../ui/signal'
import { DateTime } from '../../ui/type'
import type { Mandate, MandateEvent } from '../../data/repo'
import { useRenewalNow } from './clock'
import { renewalDesk } from './data/renewal-desk'
import { loadPoolSource } from './pool-source'
import { instalmentQueueConfig } from './queue-config'
import { readLeadDays } from './lead-days'
import { CONTINUITY_AT_RISK } from './renewal-view'
import styles from './RenewalPool.module.css'

const DAY_MS = 86_400_000
/** §9's pattern window: two failures inside three months is worth surfacing. */
const PATTERN_WINDOW_DAYS = 90
const PATTERN_THRESHOLD = 2

/**
 * Instalments due — plan §4 `/renewals/instalments`, D-A, prototype `r_instal`
 * and `r_mandate`.
 *
 * Everything on this screen is a policy that is IN FORCE. That is the point of
 * its being a screen: §9 says an instalment due date is not a renewal date, and
 * a queue that mixed the two without saying so would have a renewals member
 * ringing customers to renew policies with six months left to run.
 *
 * The grace window on each row comes from its own schedule's `graceDays`, set by
 * the mode — monthly commonly 15 days against 30 on annual, motor commonly zero.
 * Nothing here holds a grace constant, and nothing here divides an annual
 * premium: the amount on a row is the figure the insurer's schedule was typed
 * with.
 */
export function InstalmentScreen() {
  const repositories = useRepositories()
  const user = useSessionStore((state) => state.user)
  const now = useRenewalNow()
  const desk = renewalDesk(repositories)

  const context = useResource(async () => {
    const [source, users, recipes] = await Promise.all([
      loadPoolSource(repositories, desk),
      repositories.config.users(),
      repositories.config.recipes(),
    ])

    const policyIds = [...new Set(source.instalments.map((row) => row.policyId))]
    const mandates = (
      await Promise.all(policyIds.map((policyId) => repositories.schedules.mandate(policyId)))
    ).filter((mandate): mandate is Mandate => mandate !== null)

    const failures = await Promise.all(
      mandates.map(async (mandate) => ({
        mandate,
        events: (await repositories.schedules.mandateEvents(mandate.id)).filter(
          (event) => event.outcome === 'failure',
        ),
      })),
    )

    return { source, users, leadDays: readLeadDays(recipes), failures }
  }, 'renewals:instalments')

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="2rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  const { source, users, leadDays, failures } = context.data

  const config = instalmentQueueConfig({
    desk,
    rows: source.rows,
    users,
    now,
    actorId: user.id,
    leadDays,
    canWork: can(user, 'edit', 'renewals'),
  })

  const failed = failures.filter((entry) => entry.events.length > 0)

  return (
    <WorkQueue config={config}>
      <div className={styles.primer} role="note">
        <Icon name="alert" size="md" />
        <div>
          <p className={styles.primerTitle}>Every policy on this list is in force</p>
          <p className={styles.primerNote}>
            An instalment falling due is not a renewal. These terms are still running, so nothing
            here is expiring — the grace window on each row comes from that schedule&apos;s own mode,
            not from a house rule. {CONTINUITY_AT_RISK}
          </p>
        </div>
      </div>

      {failed.length > 0 ? (
        <div className={styles.primer} role="note">
          <Icon name="alert" size="md" />
          <div>
            <p className={styles.primerTitle}>
              {failed.length === 1 ? '1 mandate has failed' : `${failed.length} mandates have failed`}
            </p>
            <ul className={styles.mandates} aria-label="Failed mandates">
              {failed.map((entry) => (
                <li key={entry.mandate.id} className={styles.mandate}>
                  <span className={styles.mandateRef}>{entry.mandate.reference}</span>
                  <span>{entry.mandate.bankName}</span>
                  <DateTime value={lastFailure(entry.events)} mode="date" />
                  {isPattern(entry.events, now) ? (
                    <Badge tone="bad" caps>
                      Pattern — tell the agent
                    </Badge>
                  ) : null}
                  <Link to={`/policies/${entry.mandate.policyId}`}>Open the policy</Link>
                </li>
              ))}
            </ul>
            <p className={styles.continuity}>
              The platform records what the bank reported. It never presents a debit and holds no
              bank credential, so the next step is a person and a phone call.
            </p>
          </div>
        </div>
      ) : null}
    </WorkQueue>
  )
}

export default InstalmentScreen

function lastFailure(events: readonly MandateEvent[]): string {
  return events.reduce(
    (latest, event) => (event.occurredAt > latest ? event.occurredAt : latest),
    events[0]?.occurredAt ?? '',
  )
}

/** §9: "Two failures inside three months is a pattern worth surfacing to the agent." */
function isPattern(events: readonly MandateEvent[], now: Date): boolean {
  const since = new Date(now.getTime() - PATTERN_WINDOW_DAYS * DAY_MS).toISOString()
  return events.filter((event) => event.occurredAt >= since).length >= PATTERN_THRESHOLD
}
