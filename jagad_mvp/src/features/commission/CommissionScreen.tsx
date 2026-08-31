import { Link, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { Button } from '../../ui/Button'
import { EmptyState, Pagination, Skeleton, StatCard } from '../../ui/data'
import { Badge } from '../../ui/signal'
import { Accordion, Panel } from '../../ui/surface'
import type { AccordionItem } from '../../ui/surface'
import { Money } from '../../ui/type'
import { ChainExpansion } from './ChainExpansion'
import { commissionDesk } from './data/commission-desk'
import { CHANNEL_EXPLANATIONS, CHANNEL_LABELS, bookReconciles } from './commission-view'
import styles from './Commission.module.css'

/**
 * `/commission` - plan §4, §9's commission chain. READ-ONLY.
 *
 * The screen has no control that writes, and that is the design rather than an
 * omission this step happens to have made. §9's last line on commission is "the
 * Assistant reads this ledger and never writes to it, from any role including
 * admin", and a ledger the staff UI can adjust is a ledger the Assistant will
 * eventually be asked to adjust. So there is no `<ConfirmGate>` here, because
 * there is nothing outward to gate: the only interactive elements are the
 * accordion disclosures that open a chain, and the retry on the error state.
 *
 * Every amount is derived by `commissionChain` and every one of them is marked
 * as derived. Booking a figure from an insurer's statement is a different act
 * with a different screen, and where such a figure exists it is shown beside the
 * computed one without either being subtracted from the other.
 *
 * The page number lives in the URL (§7 - a list view is reconstructible from its
 * address), and the totals above the list are always the WHOLE book rather than
 * the page: a commission total that changed when somebody turned the page would
 * be worse than no total at all. The list is ordered by pay-in, largest first,
 * because that is the order an owner scans a commission book in.
 *
 * "The whole book" means the whole book THIS ACCOUNT MAY READ. The desk is handed
 * the signed-in user and applies §11's row scope before it computes anything, so
 * an agent's totals here are their own book and their sub-agents' - never the
 * agency's. That is the first screen in the build where row-level scope is
 * applied at all, and it is applied on the read rather than on the render.
 *
 * This screen is the summary: what the book earned, and how. The line-by-line
 * evidence behind it is `/commission/ledger`; the payout cycle is
 * `/commission/payouts`. Neither is a filtered copy of this one.
 */
/** One screenful. The whole book is totalled above it, whatever the page shows. */
const PAGE_SIZE = 25

export function CommissionScreen() {
  const repositories = useRepositories()
  const desk = commissionDesk(repositories)
  const viewer = useSessionStore((state) => state.user)
  const [params, setParams] = useSearchParams()

  // The key carries the viewer, so switching account re-reads the book rather
  // than showing the previous person's rows under a new name.
  const book = useResource(
    async () => (viewer ? desk.book(viewer) : null),
    `commission:book:${viewer?.id ?? 'none'}`,
  )

  if (book.error) {
    return (
      <div className={styles.screen}>
        <EmptyState
          variant="error"
          title="The commission book could not be loaded"
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
        <Skeleton width="100%" height="8rem" />
        <Skeleton width="100%" height="20rem" />
      </div>
    )
  }

  const { rows, refusals, channels, totals } = book.data
  const reconciled = bookReconciles(rows)

  const ordered = [...rows].sort((a, b) => b.chain.payIn.paise - a.chain.payIn.paise)
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const requested = Number(params.get('page') ?? '1')
  const pageIndex = Math.min(Math.max(0, (Number.isFinite(requested) ? requested : 1) - 1), pageCount - 1)
  const pageRows = ordered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)

  function goToPage(next: number) {
    const search = new URLSearchParams(params)
    if (next <= 0) search.delete('page')
    else search.set('page', String(next + 1))
    setParams(search)
  }

  const items: AccordionItem[] = pageRows.map((row) => ({
    id: row.policyId,
    title: `${row.systemNo} - ${row.customerName}`,
    meta: (
      <span className={styles.rowMeta}>
        <Badge caps>{CHANNEL_LABELS[row.chain.channel]}</Badge>
        <span className={styles.rowFigure}>
          <span className={styles.rowFigureLabel}>pay-in</span>
          <Money paise={row.chain.payIn.paise} symbol={false} showPaise />
        </span>
        <span className={styles.rowFigure}>
          <span className={styles.rowFigureLabel}>net</span>
          <Money paise={row.chain.netProfit.paise} symbol={false} showPaise emphasis="strong" />
        </span>
      </span>
    ),
    content: <ChainExpansion row={row} />,
  }))

  return (
    <div className={styles.screen}>
      <PageHeader
        title="Commission"
        meta={
          <Badge tone={reconciled ? 'ok' : 'bad'} icon={reconciled ? 'check' : 'alert'}>
            {reconciled ? 'Every chain reconciles to the paisa' : 'A chain does not reconcile'}
          </Badge>
        }
        actions={
          <span className={styles.deeper}>
            <Link to="/commission/ledger">Ledger</Link>
            <Link to="/commission/payouts">Payouts</Link>
          </span>
        }
      />

      <section className={styles.stats} aria-label="The whole book">
        <StatCard
          label="Pay-in"
          value={<Money paise={totals ? totals.payIn.paise : null} />}
          meta={totals ? `${totals.policyCount} issued policies` : 'no issued policies yet'}
          icon="coin"
        />
        <StatCard
          label="Agent shares"
          value={<Money paise={totals ? totals.agentShare.paise : null} />}
          meta="kept by agents, after any carve-out"
          icon="users"
        />
        <StatCard
          label="Sub-agent shares"
          value={<Money paise={totals ? totals.subAgentShare.paise : null} />}
          meta="carved from the agent cut"
          icon="users"
        />
        <StatCard
          label="Net profit"
          value={<Money paise={totals ? totals.netProfit.paise : null} />}
          meta="what the agency keeps"
          tone="ok"
          icon="chart"
        />
      </section>

      <Panel
        title="Booked totals by channel"
        description="Where the money came in: on the agency's own appointments, or through a broking code."
      >
        <div className={styles.tableWrap}>
          <table className={styles.channels} aria-label="Booked totals by channel">
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col" className={styles.numeric}>
                  Policies
                </th>
                <th scope="col" className={styles.numeric}>
                  Pay-in
                </th>
                <th scope="col" className={styles.numeric}>
                  Agent
                </th>
                <th scope="col" className={styles.numeric}>
                  Sub-agent
                </th>
                <th scope="col" className={styles.numeric}>
                  Net profit
                </th>
              </tr>
            </thead>
            <tbody>
              {channels.map((total) => (
                <tr key={total.channel}>
                  <th scope="row">
                    <span className={styles.channelName}>{CHANNEL_LABELS[total.channel]}</span>
                    <span className={styles.channelNote}>
                      {CHANNEL_EXPLANATIONS[total.channel]}
                    </span>
                  </th>
                  <td className={styles.numeric}>{total.policyCount}</td>
                  <td className={styles.numeric}>
                    <Money paise={total.payIn.paise} symbol={false} />
                  </td>
                  <td className={styles.numeric}>
                    <Money paise={total.agentShare.paise} symbol={false} />
                  </td>
                  <td className={styles.numeric}>
                    <Money paise={total.subAgentShare.paise} symbol={false} />
                  </td>
                  <td className={styles.numeric}>
                    <Money paise={total.netProfit.paise} symbol={false} emphasis="strong" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Every figure on this screen is derived from the percentages held in configuration, and is
          marked as derived. None of them was typed, and none can be. The book is the one{' '}
          {viewer.name} may read: the {viewer.template.label} template decides which rows are in it,
          row by row, before anything is totalled.
        </p>
      </Panel>

      <Panel
        title="Chain by policy"
        description="Open a policy to see the four levels and the rate each one was worked out at. Largest pay-in first; the totals above cover the whole book, not this page."
      >
        {items.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No issued policy carries a commission chain yet"
            explanation="A chain appears here when a policy is issued on an agency that has an active appointment, with a percentage set against the company and the policy."
          />
        ) : (
          <>
            <Accordion items={items} mode="multi" />
            <div className={styles.pager}>
              <Pagination
                pageIndex={pageIndex}
                pageSize={PAGE_SIZE}
                totalRows={ordered.length}
                onPageChange={goToPage}
                noun="policies"
              />
            </div>
          </>
        )}
      </Panel>

      {refusals.length > 0 ? (
        <Panel
          title="Not chained"
          description="Issued policies the chain could not be worked out for, and what would fix each one."
        >
          <ul className={styles.refusals}>
            {refusals.map((refusal) => (
              <li key={refusal.policyId} className={styles.refusal}>
                <span className={styles.refusalId}>{refusal.systemNo}</span>
                <span className={styles.refusalReason}>{refusal.reason}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}

export default CommissionScreen
