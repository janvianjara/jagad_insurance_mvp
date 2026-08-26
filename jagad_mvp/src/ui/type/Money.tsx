import { cx } from './cx'
import styles from './Money.module.css'

export type MoneyProps = {
  /** Integer paise. `null` means the amount has not been recorded — not zero. */
  paise: number | null | undefined
  currency?: string
  /** Show the currency symbol. Drop it in a column whose header already carries it. */
  symbol?: boolean
  /** Print the paise part. Insurer schedules often want whole rupees. */
  showPaise?: boolean
  emphasis?: 'normal' | 'strong' | 'quiet'
  /** What to show when there is no amount yet. */
  absentText?: string
  className?: string
}

const PAISE_PER_RUPEE = 100

/**
 * Renders an amount. It never computes one — this component formats what was
 * recorded and nothing else (D3).
 *
 * The formatting here deliberately mirrors `formatINR` in `src/domain/money.ts`
 * and MUST be kept in step with it. It cannot simply call that function: the
 * layer rule (plan §6, enforced by `import/no-restricted-paths`) forbids
 * `src/ui` importing from `src/domain`, because these primitives are the layer
 * that survives a re-theme and, if mobile arrives, the layer worth extracting.
 * So the primitive takes plain integer paise rather than the branded `Money`
 * type, and the two implementations agree by contract, not by import. A shared
 * formatter would have to live in a framework-free module that neither layer
 * owns yet; when one exists, both sides should move onto it.
 */
export function Money({
  paise,
  currency = 'INR',
  symbol = true,
  showPaise = true,
  emphasis = 'normal',
  absentText = 'not recorded',
  className,
}: MoneyProps) {
  if (paise === null || paise === undefined) {
    return <span className={cx(styles.absent, className)}>{absentText}</span>
  }

  const wantsPaise = showPaise || paise % PAISE_PER_RUPEE !== 0
  const digits = wantsPaise ? 2 : 0

  // en-IN grouping, so 124850000 paise reads as the lakh figure a Gujarat
  // agency expects: 12,48,500.00 rather than 1,248,500.00.
  const text = new Intl.NumberFormat('en-IN', {
    style: symbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(paise / PAISE_PER_RUPEE)

  return (
    <data
      className={cx(styles.money, className)}
      value={String(paise)}
      data-sign={paise < 0 ? 'negative' : undefined}
      data-emphasis={emphasis === 'normal' ? undefined : emphasis}
    >
      {text}
    </data>
  )
}
