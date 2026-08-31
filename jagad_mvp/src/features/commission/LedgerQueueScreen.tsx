import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton, StatCard } from '../../ui/data'
import { Money } from '../../ui/type'
import { commissionDesk } from './data/commission-desk'
import { ledgerLines, ledgerSummary } from './ledger-view'
import { ledgerQueueConfig } from './ledger-queue-config'
import styles from './Ledger.module.css'

/**
 * `/commission/ledger` - FR-14.3, plan §9. The line-by-line evidence.
 *
 * ---------------------------------------------------------------------------
 * Why this is not `/commission` with different filters
 * ---------------------------------------------------------------------------
 *
 * `/commission` answers "what did the book earn": one row per policy, four
 * totals, the chain folded up. This screen is the grain below that - one row per
 * PARTY per LEVEL - which is the grain an accountant reconciles at and the grain
 * a payout is made at. The same money, cut the other way, and neither view is a
 * filtered copy of the other.
 *
 * ---------------------------------------------------------------------------
 * The honest constraint, on screen
 * ---------------------------------------------------------------------------
 *
 * `CommissionRepository` has no write API, so no line here was ever booked:
 * every computed figure is recomputed from the percentages in configuration on
 * each read. Three rows in the fixture set WERE recorded off insurer statements
 * by a person. The two are shown as distinguishable things - two amount columns
 * and a reconciliation state - and where they disagree the screen says so rather
 * than picking one. The strip above the table is that summary, and it is the
 * first thing an accountant reads.
 *
 * §11's row scope is applied on the read, in the desk, before a single figure is
 * computed - so the summary above the table is a summary of the book this
 * account may read, and never of the agency's.
 */
export function LedgerQueueScreen() {
  const repositories = useRepositories()
  const desk = commissionDesk(repositories)
  const viewer = useSessionStore((state) => state.user)

  const book = useResource(
    async () => (viewer ? desk.book(viewer) : null),
    `commission:ledger:${viewer?.id ?? 'none'}`,
  )

  if (book.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The commission ledger could not be loaded"
          explanation={book.error.message}
          action={
            <Button variant="primary" size="sm" onClick={book.reload}>
              Try again
            </Button>
          }
        />
      </div>
    )
  }

  if (!viewer || !book.data) {
    return (
      <div className={styles.screen} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="6rem" />
        <Skeleton width="100%" height="24rem" />
      </div>
    )
  }

  const lines = ledgerLines(book.data)
  const summary = ledgerSummary(lines)

  return (
    <WorkQueue
      config={ledgerQueueConfig({ lines, chains: book.data.rows })}
      actions={
        <span className={styles.deeper}>
          <Link to="/commission">Summary</Link>
          <Link to="/commission/payouts">Payouts</Link>
        </span>
      }
    >
      <section className={styles.summary} aria-label="Computed against booked">
        <StatCard
          label="Computed pay-in"
          value={<Money paise={summary.computedPayIn.paise} />}
          meta={`${summary.lineCount} lines, recomputed on every read`}
          icon="coin"
        />
        <StatCard
          label="Booked from statements"
          value={<Money paise={summary.bookedTotal.paise} />}
          meta={`${summary.agreeing + summary.differing} lines carry a statement figure`}
          icon="book"
        />
        <StatCard
          label="Disagreeing"
          value={String(summary.differing + summary.unaccounted)}
          meta={
            summary.differing + summary.unaccounted === 0
              ? 'every statement figure matches its computation'
              : `${summary.differing} differ, ${summary.unaccounted} have no computation`
          }
          tone={summary.differing + summary.unaccounted === 0 ? 'ok' : 'bad'}
          icon="alert"
        />
        <StatCard
          label="Awaiting a statement"
          value={String(summary.notBooked)}
          meta="computed, and nothing booked against them"
          tone="warn"
          icon="clock"
        />
      </section>

      <p className={styles.constraint}>
        Nothing on this screen was booked by this platform. The commission repository is read-only,
        so every <strong>computed</strong> figure is worked out from the percentages held in
        configuration each time the page is opened, and every <strong>booked</strong> figure was
        recorded by a person from an insurer statement. Where the two disagree the ledger says so
        and prints both; it never subtracts one from the other, because the difference is a
        conversation with the insurer rather than a figure this screen may assert.
      </p>
    </WorkQueue>
  )
}

export default LedgerQueueScreen
