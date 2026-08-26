import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './KeyValueList.module.css'

export type KeyValueItem = {
  key: string
  label: ReactNode
  /** Absent values are rendered as absent, never skipped: a missing row hides a fact. */
  value: ReactNode
}

export type KeyValueListProps = {
  items: readonly KeyValueItem[]
  columns?: 1 | 2
  dense?: boolean
  absentText?: string
  className?: string
}

/** The record summary block used at the head of every drawer and detail page. */
export function KeyValueList({
  items,
  columns = 1,
  dense = false,
  absentText = 'not recorded',
  className,
}: KeyValueListProps) {
  return (
    <dl
      className={cx(styles.list, className)}
      data-columns={columns}
      data-dense={dense || undefined}
    >
      {items.map((item) => {
        const empty = item.value === null || item.value === undefined || item.value === ''
        return (
          <div key={item.key} style={{ display: 'contents' }}>
            <dt className={styles.key}>{item.label}</dt>
            <dd className={styles.value}>
              {empty ? <span className={styles.absent}>{absentText}</span> : item.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
