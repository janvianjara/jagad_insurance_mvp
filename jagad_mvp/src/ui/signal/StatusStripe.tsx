import { toneForSeverity } from '../tone'
import type { Severity } from '../tone'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './StatusStripe.module.css'

export type StatusStripeProps = {
  severity: Severity
  /**
   * Names the stripe for assistive tech. Omit when the row already states its
   * status in text — a second announcement of the same fact is noise.
   */
  label?: string
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

/**
 * How much trouble this row is in: hot, warm, cool, good, or waiting on a
 * person. Maps onto the U7 tokens — bad, warn, info, ok and attn respectively.
 */
export function StatusStripe({
  severity,
  label,
  orientation = 'vertical',
  className,
}: StatusStripeProps) {
  return (
    <span
      className={cx(tones.tone, styles.stripe, className)}
      data-tone={toneForSeverity(severity)}
      data-severity={severity}
      data-orientation={orientation}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
