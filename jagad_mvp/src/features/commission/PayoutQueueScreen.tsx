import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { can } from '../../domain/permissions'
import { WorkQueue } from '../../components/WorkQueue'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton, StatCard } from '../../ui/data'
import { Money } from '../../ui/type'
import { commissionDesk } from './data/commission-desk'
import { ledgerLines } from './ledger-view'
import { RELEASE_WRITES_NOTHING, payoutRows, payoutSummary } from './payout-view'
import { payoutQueueConfig } from './payout-queue-config'
import styles from './Ledger.module.css'

/**
 * `/commission/payouts` - FR-14.4 and FR-14.7, plan §9. The payout cycle.
 *
 * The third grain of the same money. `/commission` totals the book,
 * `/commission/ledger` lists every line, and this screen groups those lines the
 * way money actually leaves an agency: one payee, one month, one figure.
 *
 * Every amount is a roll-up of typed-and-derived commission lines - addition and
 * nothing else - and `Outstanding` is deliberately not a subtraction. While
 * nothing has been recorded as paid, what is outstanding IS what is due; once
 * anything has, the column says it cannot be stated rather than netting one
 * figure against another (D3).
 *
 * Releasing is an outward mutation and goes through `<BulkActionGate>` and
 * `<ConfirmGate>`. It writes nothing, and says so before, during and after: the
 * commission repository in this build is read-only.
 */
export function PayoutQueueScreen() {
  const repositories = useRepositories()
  const desk = commissionDesk(repositories)
  const viewer = useSessionStore((state) => state.user)

  const book = useResource(
    async () => (viewer ? desk.book(viewer) : null),
    `commission:payouts:${viewer?.id ?? 'none'}`,
  )

  if (book.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The payout cycle could not be loaded"
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
  const rows = payoutRows(lines, book.data.payoutsRecorded)
  const summary = payoutSummary(rows)
  // Releasing money is an approval, not a read. An agent may open this screen to
  // see what they are owed and may not decide that it goes out.
  const mayRelease = can(viewer, 'approve', 'commission')

  return (
    <WorkQueue
      config={payoutQueueConfig({ rows, lines, mayRelease })}
      actions={
        <span className={styles.deeper}>
          <Link to="/commission">Summary</Link>
          <Link to="/commission/ledger">Ledger</Link>
        </span>
      }
    >
      <section className={styles.summary} aria-label="The cycle">
        <StatCard
          label="Due across all periods"
          value={<Money paise={summary.due.paise} />}
          meta={`${summary.partyCount} payees, ${summary.periodCount} periods`}
          icon="coin"
        />
        <StatCard
          label="Recorded as paid"
          value={
            <Money paise={summary.recordedPaid?.paise ?? null} absentText="nothing recorded" />
          }
          meta="no payout has ever been booked in this build"
          tone="warn"
          icon="clock"
        />
        <StatCard
          label="Payout runs"
          value={String(summary.rowCount)}
          meta="one payee, one month, one figure"
          icon="users"
        />
      </section>

      <p className={styles.constraint}>
        <strong>Releasing records nothing.</strong> {RELEASE_WRITES_NOTHING} The release control is
        still gated exactly as a real one would be - the preview says what would change, and Cancel
        writes nothing - so the cycle can be walked end to end without the platform claiming money
        moved. GST is shown for FR-14.7 and is empty on every row, because no record in this build
        carries a GST figure against a commission line.
      </p>
    </WorkQueue>
  )
}

export default PayoutQueueScreen
