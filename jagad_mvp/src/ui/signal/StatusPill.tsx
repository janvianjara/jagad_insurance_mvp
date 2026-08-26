import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import type { Tone } from '../tone'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './StatusPill.module.css'

export type StatusPillProps = {
  tone: Tone
  children: ReactNode
  /** Replaces the dot. Use only where the icon says more than the colour does. */
  icon?: IconName
  size?: 'sm' | 'md'
  /** Drop the leading dot — for a pill that already carries an icon or stands alone. */
  dot?: boolean
  className?: string
}

/**
 * The state of one record, in the charter's words and the charter's colour.
 *
 * Always carries a dot or an icon as well as a hue: colour alone is not a
 * status for anyone reading the screen without full colour vision.
 */
export function StatusPill({
  tone,
  children,
  icon,
  size = 'sm',
  dot = true,
  className,
}: StatusPillProps) {
  return (
    <span className={cx(tones.tone, styles.pill, className)} data-tone={tone} data-size={size}>
      {icon ? <Icon name={icon} size="sm" /> : dot ? <span className={styles.dot} /> : null}
      <span className={styles.text}>{children}</span>
    </span>
  )
}
