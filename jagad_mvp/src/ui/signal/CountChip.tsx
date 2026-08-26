import type { SubtleTone } from '../tone'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './CountChip.module.css'

export type CountChipProps = {
  count: number
  tone?: SubtleTone
  variant?: 'soft' | 'solid'
  /** Counts above this render as "99+". Rail counts do not need exactness. */
  max?: number
  /**
   * What the number counts, for assistive tech: "unassigned inquiries". The
   * digit alone is meaningless when read out of its visual context.
   */
  label?: string
  className?: string
}

/** The number beside a nav item, a tab or a filter — how many are waiting. */
export function CountChip({
  count,
  tone = 'neutral',
  variant = 'soft',
  max = 99,
  label,
  className,
}: CountChipProps) {
  const capped = count > max
  const text = capped ? `${max}+` : String(count)

  return (
    <span
      className={cx(tones.tone, styles.chip, className)}
      data-tone={tone}
      data-variant={variant}
      data-zero={count === 0 || undefined}
      aria-label={label ? `${count} ${label}` : undefined}
      title={capped ? String(count) : undefined}
    >
      {text}
    </span>
  )
}
