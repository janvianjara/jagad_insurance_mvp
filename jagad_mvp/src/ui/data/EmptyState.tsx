import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import styles from './EmptyState.module.css'

const VARIANT_ICON = {
  empty: 'inbox',
  filtered: 'grid',
  error: 'alert',
  done: 'check',
} as const

export type EmptyStateVariant = keyof typeof VARIANT_ICON

type EmptyStateProps = {
  /** What is missing, stated plainly. Not "No data". */
  title: string
  /**
   * Why it is missing and what would change it. This is the whole point of the
   * component (UX charter U13): an empty queue that explains itself teaches the
   * product, an empty queue that says "no results" teaches nothing.
   */
  explanation: string
  /** The one thing to do next. */
  action?: ReactNode
  /** A second, quieter route out — usually "clear filters". */
  secondaryAction?: ReactNode
  variant?: EmptyStateVariant
  icon?: IconName
}

/**
 * The teaching empty state. Every list, queue and search result uses it, so a
 * person who lands on an empty screen learns why it is empty and what fills it.
 */
export function EmptyState({
  title,
  explanation,
  action,
  secondaryAction,
  variant = 'empty',
  icon,
}: EmptyStateProps) {
  return (
    <div className={styles.root} data-variant={variant}>
      <span className={styles.iconWrap}>
        <Icon name={icon ?? VARIANT_ICON[variant]} size="lg" />
      </span>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.explanation}>{explanation}</p>
      {action || secondaryAction ? (
        <div className={styles.actions}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
