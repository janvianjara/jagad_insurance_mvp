import { Link, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
// The header only, by its own path. Importing it from the AppShell index would
// pull the whole shell — and the Assistant panel it mounts — into a screen that
// needs a title bar. `<WorkQueue>` reaches for it the same way.
import { PageHeader } from '../../components/AppShell/PageHeader'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Panel } from '../../ui/surface'
import { DateTime } from '../../ui/type'
import { useReportNow } from './clock'
import { reportsDesk } from './data/reports-desk'
import { ReportBody } from './ReportBody'
import { REPORTS, reportDefinition } from './report-catalogue'
import styles from './Reports.module.css'

/**
 * `/reports/:key` — one report.
 *
 * The key is validated against the catalogue rather than trusted, so an address
 * naming a report that does not exist gets a page that says which ones do. That
 * matters more here than on most screens: a report URL is the kind of thing
 * people paste into a message, and a mistyped one landing on a blank dashboard
 * teaches nobody anything.
 *
 * The heading carries the report's own two sentences — what it reads, and what
 * it refuses to work out — because that is the promise the screen is making, and
 * a promise kept only in a source comment is a promise the next person deletes.
 *
 * Read-only, like the index. Nothing here writes and nothing here computes; the
 * whole `ReportSet` is read once by the desk and this screen renders one part of
 * it.
 */
export function ReportScreen() {
  const repositories = useRepositories()
  const desk = reportsDesk(repositories)
  const user = useSessionStore((state) => state.user)
  const now = useReportNow()
  const { key } = useParams()

  const definition = reportDefinition(key)

  const report = useResource(
    async () => (user && definition ? desk.read(user, now) : null),
    `reports:one:${definition?.key ?? 'none'}:${user?.id ?? 'none'}`,
  )

  if (!definition) {
    return (
      <div className={styles.screen}>
        <PageHeader title="No such report" breadcrumb={<Link to="/reports">Reports</Link>} />
        <EmptyState
          variant="error"
          title={`There is no report called “${key ?? ''}”`}
          explanation={`The reports are ${REPORTS.map((entry) => entry.title).join(', ')}. Open the index to pick one.`}
          action={
            <Link className={styles.backLink} to="/reports">
              Back to reports
            </Link>
          }
        />
      </div>
    )
  }

  if (report.error) {
    return (
      <div className={styles.screen}>
        <PageHeader title={definition.title} breadcrumb={<Link to="/reports">Reports</Link>} />
        <EmptyState
          variant="error"
          title="This report could not be loaded"
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

  return (
    <div className={styles.screen}>
      <PageHeader
        title={definition.title}
        breadcrumb={<Link to="/reports">Reports</Link>}
        meta={
          report.data ? (
            <span className={styles.asOf}>
              as at <DateTime value={report.data.asOf} />
            </span>
          ) : null
        }
      />

      <div className={styles.promise}>
        <p className={styles.promiseReads}>
          <span className={styles.promiseTag}>Reads</span>
          {definition.reads}
        </p>
        <p className={styles.promiseNever}>
          <span className={styles.promiseTag}>Never</span>
          {definition.never}
        </p>
      </div>

      <Panel title={definition.title} description={definition.summary} level={2}>
        {report.data ? (
          <ReportBody reportKey={definition.key} data={report.data} />
        ) : (
          <div aria-busy="true">
            <Skeleton width="100%" height="14rem" />
          </div>
        )}
      </Panel>
    </div>
  )
}

export default ReportScreen
