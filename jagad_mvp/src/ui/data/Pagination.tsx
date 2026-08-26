import { Glyph } from '../surface/Glyph'
import styles from './Pagination.module.css'

const DEFAULT_PAGE_SIZES = [25, 50, 100]

type PaginationProps = {
  /** Zero-based, so it maps straight onto a `?page=` search param. */
  pageIndex: number
  pageSize: number
  /** Rows in the whole result set, not just this page. */
  totalRows: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  /** What is being counted, for the range readout. */
  noun?: string
}

/**
 * Page controls for a queue.
 *
 * Presentational on purpose: page and page size belong in the URL, so the
 * caller owns them and this component only reports and requests. The range
 * readout ("26-50 of 312") is there because a page number alone never tells
 * anyone where they are in the work.
 */
export function Pagination({
  pageIndex,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  noun = 'records',
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const current = Math.min(Math.max(0, pageIndex), pageCount - 1)
  const first = totalRows === 0 ? 0 : current * pageSize + 1
  const last = Math.min(totalRows, (current + 1) * pageSize)

  return (
    <nav className={styles.root} aria-label="Pagination">
      <p className={styles.range}>
        <span className={styles.numbers}>
          {first}&ndash;{last}
        </span>{' '}
        of <span className={styles.numbers}>{totalRows}</span> {noun}
      </p>

      {onPageSizeChange ? (
        <label className={styles.sizeLabel}>
          <span>Rows</span>
          <select
            className={styles.select}
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className={styles.pager}>
        <button
          type="button"
          className={styles.step}
          disabled={current === 0}
          onClick={() => onPageChange(current - 1)}
        >
          <Glyph kind="left" />
          <span className={styles.srOnly}>Previous page</span>
        </button>
        <span className={styles.position} aria-live="polite">
          Page <span className={styles.numbers}>{current + 1}</span> of{' '}
          <span className={styles.numbers}>{pageCount}</span>
        </span>
        <button
          type="button"
          className={styles.step}
          disabled={current >= pageCount - 1}
          onClick={() => onPageChange(current + 1)}
        >
          <Glyph kind="right" />
          <span className={styles.srOnly}>Next page</span>
        </button>
      </div>
    </nav>
  )
}
