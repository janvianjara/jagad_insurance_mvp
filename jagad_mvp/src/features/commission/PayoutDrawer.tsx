import { useState } from 'react'
import { ConfirmGate } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/signal'
import { KeyValueList, Money } from '../../ui/type'
import { LEDGER_LEVEL_LABELS } from './ledger-view'
import type { LedgerLine } from './ledger-view'
import {
  PAYEE_KIND_LABELS,
  PAYOUT_STATE_LABELS,
  PAYOUT_STATE_TONES,
  RELEASE_WRITES_NOTHING,
} from './payout-view'
import type { PayoutRow } from './payout-view'
import styles from './Ledger.module.css'

/**
 * One payee's month, and the only place a single payout is released.
 *
 * The release is an outward mutation, so it goes through `<ConfirmGate>` like
 * every other one in the product: the preview says what would change, Cancel
 * writes nothing, and Confirm is reached from one place only.
 *
 * What is different here, and stated three times over rather than once, is that
 * Confirm writes nothing EITHER. `CommissionRepository` is a read repository -
 * no writer of any kind - so there is no way to book a payout entry, and the
 * screen refuses to pretend otherwise. The person is told before the gate opens
 * (the standing note on the screen), inside the gate (the preview's last row and
 * the gate's note), and after they confirm (the receipt). A refusal a person
 * only discovers after acting is the thing this product is careful never to do.
 *
 * An account without the `approve` grant on commission never reaches the gate at
 * all: the control is disabled and the reason sits beside it, in the same shape
 * the collections drawer refuses a verifier who is not back office.
 */
export function PayoutDrawer({
  row,
  lines,
  mayRelease,
}: {
  row: PayoutRow
  /** The commission lines this figure was rolled up from. */
  lines: readonly LedgerLine[]
  /**
   * Whether this account may release at all - `can(user, 'approve', 'commission')`.
   *
   * Releasing money is an approval, not a read. An agent holds `view` on
   * commission so they can see what they are owed, and that is deliberately not
   * the same grant as deciding that it goes out.
   */
  mayRelease: boolean
}) {
  const [pending, setPending] = useState(false)

  return (
    <div className={styles.drawer}>
      <KeyValueList
        columns={2}
        items={[
          { key: 'party', label: 'Payee', value: row.partyName },
          { key: 'kind', label: 'Kind', value: PAYEE_KIND_LABELS[row.partyKind] },
          { key: 'period', label: 'Period', value: row.periodLabel },
          {
            key: 'state',
            label: 'State',
            value: (
              <StatusPill tone={PAYOUT_STATE_TONES[row.state]}>
                {PAYOUT_STATE_LABELS[row.state]}
              </StatusPill>
            ),
          },
          {
            key: 'due',
            label: 'Due in this period',
            value: (
              <output>
                <Money paise={row.due.paise} emphasis="strong" />
              </output>
            ),
          },
          {
            key: 'paid',
            label: 'Recorded as paid',
            value: (
              <Money paise={row.recordedPaid?.paise ?? null} absentText="nothing recorded" />
            ),
          },
          {
            key: 'outstanding',
            label: 'Outstanding',
            value: (
              <output>
                <Money
                  paise={row.outstanding?.paise ?? null}
                  absentText="cannot be stated"
                  emphasis="strong"
                />
              </output>
            ),
          },
          {
            key: 'gst',
            label: 'GST on this payout',
            value: <Money paise={row.gst?.paise ?? null} absentText="not recorded" />,
          },
        ]}
      />

      <p className={styles.reconcileNote}>
        {row.outstanding === null
          ? 'A payout has been recorded against this party for this period, so what remains cannot be stated here: netting one figure against another is arithmetic this platform does not perform on money it did not record.'
          : 'Nothing has been recorded as paid, so what is outstanding is what is due - an identity, not a subtraction. GST is absent because no record in this build carries a GST figure against a commission line (FR-14.7).'}
      </p>

      <section aria-label="The lines this figure was rolled up from">
        <h4 className={styles.sectionTitle}>
          {lines.length} {lines.length === 1 ? 'line' : 'lines'} in this period
        </h4>
        <ul className={styles.lineList}>
          {lines.map((line) => (
            <li key={line.id} className={styles.lineRow}>
              <span className={styles.lineWho}>
                <span className={styles.linePolicy}>{line.systemNo || line.policyId}</span>
                <span className={styles.lineLevel}>{LEDGER_LEVEL_LABELS[line.level]}</span>
              </span>
              <span className={styles.numeric}>
                <Money paise={line.computed?.paise ?? null} symbol={false} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {pending ? (
        <ConfirmGate
          title={`Release ${row.partyName}'s payout for ${row.periodLabel}`}
          changes={[
            {
              key: 'amount',
              label: 'Amount to release',
              to: <Money paise={row.due.paise} />,
            },
            {
              key: 'state',
              label: 'Payout state',
              from: PAYOUT_STATE_LABELS[row.state],
              to: 'unchanged - nothing can be written',
            },
            {
              key: 'ledger',
              label: 'Commission ledger',
              from: 'no payout entry',
              to: 'no payout entry',
            },
          ]}
          note={RELEASE_WRITES_NOTHING}
          confirmLabel="Release"
          receipt={RELEASE_WRITES_NOTHING}
          onCancel={() => setPending(false)}
          onConfirm={() => {
            // Deliberately empty. There is no writer to call, and calling
            // something else so the button feels productive is how a demo
            // becomes a lie. The receipt above says exactly what happened.
          }}
        />
      ) : (
        <div className={styles.actions}>
          <Button
            variant="primary"
            icon="coin"
            disabled={!mayRelease}
            onClick={() => setPending(true)}
          >
            Release this payout
          </Button>
          <p className={styles.warnNote}>
            {mayRelease
              ? RELEASE_WRITES_NOTHING
              : 'Releasing a payout is an approval, and this account holds only a read on commission. It can see what it is owed and cannot decide that it goes out.'}
          </p>
        </div>
      )}
    </div>
  )
}
