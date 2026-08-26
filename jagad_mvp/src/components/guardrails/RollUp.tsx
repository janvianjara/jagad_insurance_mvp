import type { ReactNode } from 'react'
import { Money as AmountText } from '../../ui/type'
import { addMoney, sumMoney } from '../../domain/money'
import type { Currency, Money } from '../../domain/money'
import styles from './RollUp.module.css'

export type RollUpComponent = {
  key: string
  label: ReactNode
  /** A typed figure. Every component of a roll-up was entered by a person. */
  amount: Money
}

export type RollUpProps = {
  /** The typed parts. Net is their sum and nothing else. */
  components: readonly RollUpComponent[]
  /** The typed GST figure. `null` means it has not been recorded — never zero. */
  gst: Money | null
  currency?: Currency
  netLabel?: ReactNode
  gstLabel?: ReactNode
  finalLabel?: ReactNode
  /** Replaces the standing explanation of what "derived" means here. */
  note?: ReactNode
  className?: string
}

const DERIVED_NOTE = 'Net and Final are derived from the figures above, and cannot be typed.'

/**
 * The only arithmetic the product allows, and the only place it is displayed.
 *
 * Net is the sum of the typed components. Final is Net plus the typed GST. There
 * is no rate, no rounding rule and no third operation, and a missing GST figure
 * leaves Final unrecorded rather than quietly treating it as zero — the platform
 * would otherwise be asserting a total nobody gave it.
 *
 * The derived rows are `<output>` elements and are marked `data-derived`, styled
 * apart from the typed rows above them. A figure that was calculated must never
 * be mistakable for a figure that was entered: only one of the two is evidence.
 */
export function RollUp({
  components,
  gst,
  currency = 'INR',
  netLabel = 'Net',
  gstLabel = 'GST',
  finalLabel = 'Final',
  note = DERIVED_NOTE,
  className,
}: RollUpProps) {
  const net = sumMoney(
    components.map((component) => component.amount),
    currency,
  )
  const final = gst === null ? null : addMoney(net, gst)

  return (
    <div className={[styles.rollUp, className].filter(Boolean).join(' ')}>
      <dl className={styles.rows}>
        {components.map((component) => (
          <div className={styles.row} data-rollup="component" key={component.key}>
            <dt className={styles.label}>{component.label}</dt>
            <dd className={styles.value}>
              <AmountText paise={component.amount.paise} currency={component.amount.currency} />
            </dd>
          </div>
        ))}

        <div className={styles.row} data-rollup="gst">
          <dt className={styles.label}>{gstLabel}</dt>
          <dd className={styles.value}>
            <AmountText paise={gst === null ? null : gst.paise} currency={currency} />
          </dd>
        </div>

        <div className={styles.row} data-rollup="net" data-derived="true">
          <dt className={styles.label}>
            {netLabel}
            <span className={styles.tag}>derived</span>
          </dt>
          <dd className={styles.value}>
            <output className={styles.output}>
              <AmountText paise={net.paise} currency={net.currency} emphasis="quiet" />
            </output>
          </dd>
        </div>

        <div className={styles.row} data-rollup="final" data-derived="true">
          <dt className={styles.label}>
            {finalLabel}
            <span className={styles.tag}>derived</span>
          </dt>
          <dd className={styles.value}>
            <output className={styles.output}>
              <AmountText
                paise={final === null ? null : final.paise}
                currency={currency}
                emphasis="strong"
              />
            </output>
          </dd>
        </div>
      </dl>
      <p className={styles.note}>{note}</p>
    </div>
  )
}
