import { maskValue } from './mask'
import type { MaskKind } from './mask'
import { cx } from './cx'
import styles from './MaskedValue.module.css'

export type MaskedValueProps = {
  /** The full identifier. Only its masked form ever reaches the DOM. */
  value: string | null | undefined
  kind?: MaskKind
  /** Trailing characters left readable. Clamped at four; four is the ceiling. */
  visible?: number
  /** Micro-caption, e.g. "Aadhaar". */
  caption?: string
  absentText?: string
  className?: string
}

/**
 * Renders an identifier the staff UI is only allowed to see the tail of —
 * Aadhaar above all, and bank accounts, PAN and phone numbers by the same rule.
 *
 * There is NO prop that reveals the full value, and there never will be. Not a
 * `reveal`, not a `title`, not a `data-` attribute, not a copy button: the
 * component receives the full string and drops everything but the last four
 * characters before it builds a single node. A masked value is also barred from
 * Assistant context entirely (constitution), which is why nothing here writes
 * the original anywhere a projection could pick it up.
 */
export function MaskedValue({
  value,
  kind = 'generic',
  visible,
  caption,
  absentText = 'not on record',
  className,
}: MaskedValueProps) {
  if (value === null || value === undefined || value.trim() === '') {
    return <span className={cx(styles.absent, className)}>{absentText}</span>
  }

  const masked = maskValue(value, kind, visible)

  return (
    <span className={cx(styles.masked, className)}>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
      <span>{masked}</span>
    </span>
  )
}
