import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
// The header only, by its own path. Importing it from the AppShell index would
// pull the whole shell — and the Assistant panel it mounts — into a screen that
// needs a title bar. `<WorkQueue>` reaches for it the same way.
import { PageHeader } from '../../components/AppShell/PageHeader'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton, StatCard } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { Panel } from '../../ui/surface'
import { DateTime, Money } from '../../ui/type'
import { useReportNow } from './clock'
import { reportsDesk } from './data/reports-desk'
import { REPORTS } from './report-catalogue'
import styles from './Reports.module.css'

/**
 * `/reports` — plan §5's core dashboard. READ-ONLY, in the strong sense.
 *
 * Every number on this screen and on the five behind it was either counted from
 * rows that exist or added up from amounts somebody typed. Nothing is projected,
 * estimated, annualised or forecast, and the arithmetic is addition and nothing
 * else — see `data/reports-desk.ts`, which is where that rule is actually kept.
 *
 * There is no control here that writes, and no export. An export is a copy of
 * the agency's book leaving the platform; `can(user, 'export', 'reports')` exists
 * and no step has built the surface behind it, so offering a button that did
 * nothing would be worse than not offering one.
 *
 * The headline tiles are the same figures as the reports they link to, read from
 * one `ReportSet`. Two reads would eventually disagree, and a dashboard whose
 * tile and whose report say different numbers is a dashboard nobody trusts
 * again.
 */
export function ReportsScreen() {
  const repositories = useRepositories()
  const desk = reportsDesk(repositories)
  const user = useSessionStore((state) => state.user)
  const now = useReportNow()

  const report = useResource(
    async () => (user ? desk.read(user, now) : null),
    `reports:board:${user?.id ?? 'none'}`,
  )

  if (report.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The reports could not be loaded"
          explanation={report.error.message}
          action={
            <Button variant="primary" size="sm" onClick={report.reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  const data = report.data

  return (
    <div className={styles.screen}>
      <PageHeader
        title="Reports"
        meta={
          data ? (
            <span className={styles.asOf}>
              as at <DateTime value={data.asOf} />
            </span>
          ) : null
        }
      />

      <section className={styles.stats} aria-label="Headline figures">
        <StatCard
          label="Policies on the book"
          value={data ? data.policies.total : ''}
          meta={data ? `${data.policies.premiumRecordedOn} carry a recorded premium` : undefined}
          icon="shield"
          loading={!data}
        />
        <StatCard
          label="Premium recorded"
          value={<Money paise={data ? data.policies.recordedPremium.paise : null} />}
          meta="sum of the final premiums typed in"
          icon="coin"
          loading={!data}
        />
        <StatCard
          label="Claims open"
          value={data ? data.claims.open : ''}
          meta={data ? `${data.claims.closed} closed` : undefined}
          icon="folder"
          loading={!data}
        />
        <StatCard
          label="Expiring inside 30 days"
          value={data ? (data.renewals.find((bucket) => bucket.key === 'd30')?.count ?? 0) : ''}
          meta="on the expiry date recorded"
          tone="attn"
          icon="clock"
          loading={!data}
        />
      </section>

      {/* Not "the five reports": there are ten, and the sentence had been wrong
          since the catalogue doubled. A title that counts is a title that goes
          stale, so this one does not count. */}
      <Panel title="All reports">
        {!data ? (
          <div aria-busy="true">
            <Skeleton width="100%" height="12rem" />
          </div>
        ) : (
          <ul className={styles.catalogue}>
            {REPORTS.map((definition) => (
              <li key={definition.key}>
                <Link className={styles.reportCard} to={`/reports/${definition.key}`}>
                  <span className={styles.reportHead}>
                    <Icon name={definition.icon} size="md" className={styles.reportIcon} />
                    <span className={styles.reportTitle}>{definition.title}</span>
                  </span>
                  <span className={styles.reportSummary}>{definition.summary}</span>
                  {/* `definition.never` is NOT dropped — it is printed by
                      `ReportScreen`, against the numbers it qualifies. Saying it
                      here as well doubled the height of all ten cards to repeat
                      a caveat about a report nobody has opened yet. */}
                  <span className={styles.reportGo}>
                    Open the report
                    <Icon name="chevron-right" size="sm" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export default ReportsScreen
