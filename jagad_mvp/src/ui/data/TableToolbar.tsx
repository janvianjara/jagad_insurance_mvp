import type { ReactNode } from 'react'
import styles from './TableToolbar.module.css'

type TableToolbarProps = {
  /** What this list is. Usually the queue name. */
  title?: string
  /** Live depth of the queue — the number that makes U1 work. */
  count?: number
  /** One line of orientation when the title is not self-explanatory. */
  description?: string
  /** Filters, search, density and column controls. */
  children?: ReactNode
  /** Primary and secondary actions, right-aligned. */
  actions?: ReactNode
}

/**
 * The strip above a table: what you are looking at on the left, how to narrow
 * it in the middle, what to do about it on the right. One layout for all
 * fifteen queue screens so the controls never move between modules.
 */
export function TableToolbar({
  title,
  count,
  description,
  children,
  actions,
}: TableToolbarProps) {
  return (
    <div className={styles.root}>
      {title || description ? (
        <div className={styles.heading}>
          {title ? (
            <h2 className={styles.title}>
              {title}
              {count === undefined ? null : <span className={styles.count}>{count}</span>}
            </h2>
          ) : null}
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
      ) : null}
      {children ? <div className={styles.controls}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}
