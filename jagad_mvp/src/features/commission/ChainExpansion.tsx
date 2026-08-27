import { chainReconciles } from '../../domain/commission'
import { formatPercentBp } from '../../domain/workflows'
import { Badge } from '../../ui/signal'
import { Money, RecordId } from '../../ui/type'
import type { CommissionChainRow } from './commission-view'
import styles from './Commission.module.css'

/**
 * One policy's chain, opened out - §9's four levels in the order the money
 * actually moves.
 *
 * The waterfall is read top to bottom: the payer pays in at the agency's rate,
 * the agent's cut comes out of that, the sub-agent's share comes out of the
 * agent's cut, and what is left is the agency's. Each level prints the rate it
 * was worked out at, because a figure without its rate is a number a person has
 * to take on trust.
 *
 * Every amount here was derived by `commissionChain`, and the component says so.
 * That is the same distinction `<RollUp>` draws between a figure somebody typed
 * and a figure the platform worked out: only one of the two is evidence, and
 * they must never look alike.
 *
 * There is no control on this component. Not a disabled one, not a hidden one -
 * none. §9: the ledger is read, never written, from any role including admin.
 */
export function ChainExpansion({ row }: { row: CommissionChainRow }) {
  const { chain } = row
  const carved = chain.subAgentId !== null

  return (
    <div className={styles.expansion}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Policy</dt>
          <dd>
            <RecordId systemNo={row.systemNo} insurerNo={row.insurerNo} />
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Placement</dt>
          <dd>
            {row.companyName} {row.productName}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Channel</dt>
          <dd>
            <Badge caps>{chain.channel === 'broker_channel' ? 'Broker' : 'Own code'}</Badge>{' '}
            {row.agencyName}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Basis</dt>
          <dd>
            <Money paise={chain.basis.paise} /> <span className={styles.hint}>recorded premium</span>
          </dd>
        </div>
      </dl>

      <ol className={styles.waterfall}>
        <li className={styles.level} data-level="payer">
          <span className={styles.levelName}>
            {row.payerName}
            <span className={styles.levelRole}>pays in</span>
          </span>
          <span className={styles.levelRate}>{formatPercentBp(chain.agencyPercentBp)} of basis</span>
          <span className={styles.levelAmount}>
            <Money paise={chain.payIn.paise} emphasis="strong" />
          </span>
        </li>

        {chain.agentId ? (
          <li className={styles.level} data-level="agent">
            <span className={styles.levelName}>
              {row.agentName}
              <span className={styles.levelRole}>agent cut</span>
            </span>
            <span className={styles.levelRate}>
              {formatPercentBp(chain.agentPercentBp)} of pay-in
              {carved ? `, less ${formatPercentBp(chain.subAgentPercentBp)} carved out` : ''}
            </span>
            <span className={styles.levelAmount}>
              <Money paise={chain.agentNet.paise} />
            </span>
          </li>
        ) : (
          <li className={styles.level} data-level="agent">
            <span className={styles.levelName}>
              No agent on this placement
              <span className={styles.levelRole}>direct business</span>
            </span>
            <span className={styles.levelRate}>nothing is carved out</span>
            <span className={styles.levelAmount}>
              <Money paise={0} />
            </span>
          </li>
        )}

        {carved ? (
          <li className={styles.level} data-level="sub-agent">
            <span className={styles.levelName}>
              {row.subAgentName}
              <span className={styles.levelRole}>sub-agent share</span>
            </span>
            <span className={styles.levelRate}>
              {formatPercentBp(chain.subAgentPercentBp)} of pay-in, carved from the agent cut
            </span>
            <span className={styles.levelAmount}>
              <Money paise={chain.subAgentShare.paise} />
            </span>
          </li>
        ) : null}

        <li className={styles.level} data-level="net" data-derived="true">
          <span className={styles.levelName}>
            {row.agencyName}
            <span className={styles.levelRole}>net profit</span>
          </span>
          <span className={styles.levelRate}>what is left of the pay-in</span>
          <span className={styles.levelAmount}>
            <output>
              <Money paise={chain.netProfit.paise} emphasis="strong" />
            </output>
          </span>
        </li>
      </ol>

      <p className={styles.reconcile} data-reconciled={chainReconciles(chain) ? 'true' : 'false'}>
        {chainReconciles(chain)
          ? 'The parts add up to the pay-in exactly. Any sub-paisa remainder is kept by the agency, never by a payee.'
          : 'These parts do not add up to the pay-in. Do not act on this row.'}
      </p>

      <div className={styles.rows}>
        <h4 className={styles.rowsTitle}>Ledger rows</h4>
        <ul className={styles.rowsList}>
          {row.ledgerRows.map((entry) => (
            <li key={entry.id} className={styles.ledgerRow} data-kind={entry.kind}>
              <span className={styles.ledgerNote}>{entry.note}</span>
              <span className={styles.ledgerAmount}>
                <Money paise={entry.amount.paise} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {row.bookedFromStatement ? (
        <p className={styles.statement}>
          Booked from the insurer statement:{' '}
          <Money paise={row.bookedFromStatement.paise} />. Recorded by a person, shown here as it
          was entered and never reconciled against the figures above by this screen.
        </p>
      ) : null}
    </div>
  )
}
