import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Glyph } from '../surface/Glyph'
import styles from './SortHeader.module.css'

export type SortDirectionOrNone = 'asc' | 'desc' | false

type SortHeaderProps = {
  children: ReactNode
  sorted: SortDirectionOrNone
  /** Receives the click, so a shift-click can add the column to a multi-sort. */
  onToggle: (event: ReactMouseEvent<HTMLButtonElement>) => void
  /** 1-based position when several columns are sorted at once. */
  sortIndex?: number
  align?: 'start' | 'end'
  disabled?: boolean
}

const NEXT_LABEL: Record<'asc' | 'desc' | 'none', string> = {
  none: 'sort ascending',
  asc: 'sort descending',
  desc: 'clear sort',
}

/**
 * The clickable part of a sortable column header.
 *
 * The current direction is stated in words for assistive technology
 * (`aria-sort` on the containing cell, plus a spoken hint here) and drawn as a
 * caret pair for everyone else; the caret alone would leave the sort state
 * invisible to a screen reader.
 */
export function SortHeader({
  children,
  sorted,
  onToggle,
  sortIndex,
  align = 'start',
  disabled,
}: SortHeaderProps) {
  const state = sorted === false ? 'none' : sorted

  return (
    <button
      type="button"
      className={[styles.button, align === 'end' ? styles.end : null].filter(Boolean).join(' ')}
      data-sorted={sorted === false ? undefined : sorted}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className={styles.label}>{children}</span>
      {sortIndex !== undefined && sortIndex > 0 ? (
        <span className={styles.order}>{sortIndex}</span>
      ) : null}
      <Glyph kind="sort" className={styles.caret} />
      <span className={styles.srOnly}>, {NEXT_LABEL[state]}</span>
    </button>
  )
}
