import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './FormRow.module.css'

export type FormRowProps = {
  children: ReactNode
  /** Fields across the row. Collapses to one column on narrow surfaces. */
  columns?: 1 | 2 | 3 | 4
  className?: string
}

/** Puts a handful of fields on one line without either of them owning a width. */
export function FormRow({ children, columns = 2, className }: FormRowProps) {
  return (
    <div className={cx(styles.row, className)} data-columns={columns}>
      {children}
    </div>
  )
}
