import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import type { SubtleTone } from '../tone'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './Badge.module.css'

export type BadgeProps = {
  children: ReactNode
  tone?: SubtleTone
  variant?: 'soft' | 'solid' | 'outline'
  icon?: IconName
  /** Mono small-caps, for classifications: RETAIL, MOTOR, RENEWAL. */
  caps?: boolean
  className?: string
}

/**
 * A short classification attached to a record — channel, product line, version,
 * retention class.
 *
 * Distinct from `<StatusPill>` on purpose: a pill is the record's state in the
 * workflow, a badge is a fact about it that does not change with the workflow.
 */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'soft',
  icon,
  caps = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(tones.tone, styles.badge, className)}
      data-tone={tone}
      data-variant={variant}
      data-caps={caps || undefined}
    >
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </span>
  )
}
