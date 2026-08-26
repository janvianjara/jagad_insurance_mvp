import type { ReactNode } from 'react'
import styles from './SelectionBar.module.css'

type SelectionBarProps = {
  count: number
  /** Total rows currently listed, so "3 of 128" reads honestly. */
  total?: number
  onClear: () => void
  /** Bulk actions. Every outward one is expected to sit behind a ConfirmGate. */
  children?: ReactNode
  /** Singular / plural noun for the selected rows, e.g. "inquiry". */
  noun?: string
}

function pluralise(count: number, noun: string) {
  return count === 1 ? noun : `${noun}s`
}

/**
 * The bar that appears once rows are ticked: what is selected, how to drop the
 * selection, and what can be done to it in bulk.
 *
 * It renders nothing at zero, and announces politely rather than assertively —
 * ticking a checkbox should not interrupt what a screen reader is saying.
 */
export function SelectionBar({
  count,
  total,
  onClear,
  children,
  noun = 'record',
}: SelectionBarProps) {
  if (count <= 0) return null

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.count}>
        <strong className={styles.number}>{count}</strong>
        <span>
          {pluralise(count, noun)} selected
          {total === undefined ? null : <span className={styles.total}> of {total}</span>}
        </span>
      </span>
      <button type="button" className={styles.clear} onClick={onClear}>
        Clear selection
      </button>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  )
}
