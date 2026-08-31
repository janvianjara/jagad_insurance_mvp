import { useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { formatPercentBp } from '../../domain/workflows'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton, StatCard } from '../../ui/data'
import { Field, Select } from '../../ui/form'
import { Badge } from '../../ui/signal'
import { Accordion } from '../../ui/surface'
import type { AccordionItem } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId } from '../../ui/type'
import { SOURCE_LABELS, commissionDesk, ledgerLines } from '../commission'
import { myLines, myPayouts, periodFromUrl, walletStatement } from './wallet-view'
import styles from './Wallet.module.css'

/**
 * `/wallet` - FR-14.5, plan §11. The sub-agent's own money, and nobody else's.
 *
 * ---------------------------------------------------------------------------
 * Designed for a phone, because a sub-agent is in the field
 * ---------------------------------------------------------------------------
 *
 * This is deliberately NOT a `<WorkQueue>`. A queue is a dense nine-column table
 * for somebody working a list at a desk all day; a wallet is one person's own
 * statement, read one-handed on a 360px screen between appointments. So the
 * surface is three figures and a month of cards, and the detail - which policy,
 * which customer, at what rate - is one tap in. Counts on the surface, reasons
 * inside.
 *
 * ---------------------------------------------------------------------------
 * Isolation
 * ---------------------------------------------------------------------------
 *
 * The read is scoped through the `wallet` grant rather than the `commission`
 * one, because §3's role table gives a sub-agent Leads, Customers and Wallet and
 * no commission grant at all. `visibleTo` then drops every policy outside this
 * person's own book, and `myLines` drops every line on their own policies whose
 * payee is somebody else - so a sub-agent cannot see a sibling's earnings, and
 * cannot see what their own agent makes off their business either.
 *
 * Every amount is a roll-up by addition. `Unpaid` is what has been earned while
 * nothing has been recorded as paid, which is an identity rather than a
 * subtraction; the screen says so rather than implying a balance was computed.
 */
export function WalletScreen() {
  const repositories = useRepositories()
  const desk = commissionDesk(repositories)
  const viewer = useSessionStore((state) => state.user)
  const [params, setParams] = useSearchParams()

  const book = useResource(
    // Read under the `wallet` grant, which is the one this account holds.
    async () => (viewer ? desk.book(viewer, 'wallet') : null),
    `wallet:${viewer?.id ?? 'none'}`,
  )

  if (book.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="Your wallet could not be loaded"
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
        <Skeleton width="60%" height="2rem" />
        <Skeleton width="100%" height="10rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  // A wallet belongs to a person in the channel. A staff account with no agent
  // record has no earnings of its own, and saying so is better than an empty
  // statement that looks like a person who earned nothing.
  if (!viewer.agentId) {
    return (
      <div className={styles.screen}>
        <PageHeader title="Wallet" />
        <EmptyState
          variant="empty"
          icon="wallet"
          title="This account has no wallet"
          explanation={`A wallet holds one person's own commission, so it belongs to an agent or sub-agent record in the channel. ${viewer.name} signs in as staff and is not linked to one, so there is nothing here to show. An administrator links a staff account to an agent on the agents screen.`}
        />
      </div>
    )
  }

  const lines = myLines(ledgerLines(book.data), viewer.agentId)
  const statement = walletStatement(lines, myPayouts(book.data.payoutsRecorded, viewer.agentId))

  // The month is read off the address, so a statement can be linked to - the
  // same rule every queue in the product follows (§7).
  const shown = periodFromUrl(statement, params.get('period')) ?? statement.periods[0] ?? null

  function choosePeriod(next: string) {
    const search = new URLSearchParams(params)
    if (next === '') search.delete('period')
    else search.set('period', next)
    setParams(search)
  }

  const items: AccordionItem[] = (shown?.lines ?? []).map((line) => ({
    id: line.id,
    title: line.systemNo || line.policyId,
    meta: (
      <span className={styles.cardMeta}>
        <Badge caps>{line.trigger === null ? 'Booked' : SOURCE_LABELS[line.trigger]}</Badge>
        <Money paise={line.computed?.paise ?? null} symbol={false} emphasis="strong" />
      </span>
    ),
    content: (
      <KeyValueList
        items={[
          {
            key: 'policy',
            label: 'Policy',
            value: <RecordId systemNo={line.systemNo} insurerNo={line.insurerNo} />,
          },
          { key: 'customer', label: 'Customer', value: line.customerName },
          { key: 'placement', label: 'Placement', value: line.placement },
          {
            key: 'rate',
            label: 'Your rate',
            value: line.percentBp === null ? null : `${formatPercentBp(line.percentBp)} of the pay-in`,
          },
          { key: 'dated', label: 'Dated', value: <DateTime value={line.bookedAt} mode="date" /> },
          {
            key: 'amount',
            label: 'Your share',
            value: (
              <output>
                <Money paise={line.computed?.paise ?? null} emphasis="strong" />
              </output>
            ),
          },
        ]}
      />
    ),
  }))

  return (
    <div className={styles.screen}>
      <PageHeader
        title="Wallet"
        meta={<span className={styles.who}>{viewer.name}</span>}
      />

      <section className={styles.tiles} aria-label="Your money">
        <StatCard
          label="Earned to date"
          value={<Money paise={statement.earned.paise} />}
          meta={`${statement.lineCount} ${statement.lineCount === 1 ? 'policy' : 'policies'} across ${statement.periods.length} ${statement.periods.length === 1 ? 'month' : 'months'}`}
          icon="wallet"
        />
        <StatCard
          label={shown ? `Coming for ${shown.label}` : 'Coming'}
          value={<Money paise={shown?.total.paise ?? null} absentText="nothing yet" />}
          meta={
            shown
              ? `${shown.lines.length} ${shown.lines.length === 1 ? 'policy' : 'policies'} in this month`
              : 'no month has anything in it yet'
          }
          icon="clock"
        />
        <StatCard
          label="Unpaid"
          value={<Money paise={statement.unpaid?.paise ?? null} absentText="cannot be stated" />}
          meta={
            statement.recordedPaid === null
              ? 'nothing has been recorded as paid'
              : 'a payout was recorded - ask the office for the balance'
          }
          tone="warn"
          icon="coin"
        />
      </section>

      <p className={styles.note}>
        These are your own lines and only yours. What your agent or the agency earns on the same
        policy is not shown here, and cannot be reached from this account.
        {statement.recordedPaid === null
          ? ' Nothing has been recorded as paid to you, so everything earned is still unpaid - that is the same figure, not a sum worked out from two others.'
          : ' A payout has been recorded against you, so what remains is not stated here: this platform does not net one figure against another.'}
      </p>

      {statement.periods.length === 0 ? (
        <EmptyState
          variant="empty"
          icon="wallet"
          title="Nothing has been earned on your book yet"
          explanation="A line appears here when a policy you sourced is issued and the arrangement carries a share for you. Until then there is nothing to show, which is not the same as zero."
        />
      ) : (
        <section className={styles.statement} aria-label="Statement">
          <div className={styles.statementHead}>
            <h2 className={styles.statementTitle}>Statement</h2>
            <Field label="Month" className={styles.monthField}>
              <Select
                value={shown?.period ?? ''}
                options={statement.periods.map((period) => ({
                  value: period.period,
                  label: period.label,
                }))}
                onChange={(event) => choosePeriod(event.target.value)}
              />
            </Field>
          </div>

          <p className={styles.monthTotal}>
            <span className={styles.monthTotalLabel}>{shown?.label}</span>
            <output>
              <Money paise={shown?.total.paise ?? null} emphasis="strong" />
            </output>
          </p>

          <Accordion items={items} mode="multi" />
        </section>
      )}
    </div>
  )
}

export default WalletScreen
