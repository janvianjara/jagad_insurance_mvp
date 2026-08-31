import { formatPercentBp } from '../../domain/workflows'
import { StatusPill } from '../../ui/signal'
import { DateTime, KeyValueList, Money, RecordId } from '../../ui/type'
import { ChainExpansion } from './ChainExpansion'
import type { CommissionChainRow } from './commission-view'
import {
  LEDGER_LEVELS,
  LEDGER_LEVEL_LABELS,
  LEDGER_ORIGIN_LABELS,
  RECONCILIATIONS,
  RECONCILIATION_EXPLANATIONS,
  RECONCILIATION_LABELS,
  RECONCILIATION_TONES,
  SOURCE_LABELS,
  periodLabel,
  varianceDirection,
} from './ledger-view'
import type { LedgerLine } from './ledger-view'
import styles from './Ledger.module.css'

/**
 * One commission line, opened out.
 *
 * The drawer answers the two questions the row could not fit: where the figure
 * came from, and how it stands against the insurer's statement. Then it shows
 * the whole chain the line was carved out of, because a share is meaningless
 * without the pay-in above it.
 *
 * There is no control here. Not a disabled one, not a hidden one - none. §9's
 * last word on commission is that the ledger is read and never written, from any
 * role including admin, and the cheapest way to keep that promise is for there
 * to be nothing on the surface that could write.
 */
export function LedgerLineDrawer({
  line,
  chain,
}: {
  line: LedgerLine
  chain: CommissionChainRow | null
}) {
  const direction = varianceDirection(line)

  return (
    <div className={styles.drawer}>
      <KeyValueList
        columns={2}
        items={[
          {
            key: 'policy',
            label: 'Policy',
            value:
              line.systemNo === '' ? (
                line.policyId
              ) : (
                <RecordId systemNo={line.systemNo} insurerNo={line.insurerNo} />
              ),
          },
          { key: 'placement', label: 'Placement', value: line.placement },
          { key: 'party', label: 'Paid to', value: line.partyName },
          { key: 'level', label: 'Level', value: LEDGER_LEVEL_LABELS[line.level] },
          {
            key: 'source',
            label: 'Source',
            value: line.trigger === null ? null : SOURCE_LABELS[line.trigger],
          },
          { key: 'period', label: 'Period', value: periodLabel(line.period) },
          {
            key: 'rate',
            label: 'Rate applied',
            value: line.percentBp === null ? null : formatPercentBp(line.percentBp),
          },
          {
            key: 'dated',
            label: 'Dated',
            value: <DateTime value={line.bookedAt} mode="date" />,
          },
          { key: 'origin', label: 'Origin', value: LEDGER_ORIGIN_LABELS[line.origin] },
        ]}
      />

      <section className={styles.reconcile} aria-label="Reconciliation">
        <div className={styles.reconcileHead}>
          <h4 className={styles.sectionTitle}>Reconciliation</h4>
          <StatusPill tone={RECONCILIATION_TONES[line.reconciliation]}>
            {RECONCILIATION_LABELS[line.reconciliation]}
          </StatusPill>
        </div>

        <dl className={styles.sideBySide}>
          <div className={styles.side}>
            <dt>Computed by the chain</dt>
            <dd>
              <output>
                <Money paise={line.computed?.paise ?? null} absentText="no computation" />
              </output>
            </dd>
          </div>
          <div className={styles.side}>
            <dt>Booked from the statement</dt>
            <dd>
              <Money
                paise={line.booked?.paise ?? null}
                absentText={
                  line.level === LEDGER_LEVELS.agency ? 'not booked' : 'not applicable'
                }
              />
            </dd>
          </div>
        </dl>

        <p className={styles.reconcileNote}>
          {RECONCILIATION_EXPLANATIONS[line.reconciliation]}
        </p>

        {direction ? (
          <p className={styles.variance} data-differs="true">
            {direction} The platform names the disagreement and does not measure it: subtracting
            one from the other would assert a figure nobody recorded.
          </p>
        ) : null}

        {line.reconciliation === RECONCILIATIONS.notBooked ? (
          <p className={styles.reconcileNote}>
            Booking a statement figure is a write, and this build has none: the commission
            repository is read-only, so every computed line stays computed.
          </p>
        ) : null}
      </section>

      <section aria-label="The chain this line came from">
        <h4 className={styles.sectionTitle}>The chain this line came from</h4>
        {chain ? (
          <ChainExpansion row={chain} />
        ) : (
          <p className={styles.reconcileNote}>
            No chain in this book accounts for this figure, so there is no waterfall to show. The
            note recorded with it reads: {line.note}
          </p>
        )}
      </section>
    </div>
  )
}
