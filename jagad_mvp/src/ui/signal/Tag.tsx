import type { ReactNode } from 'react'
import type { SubtleTone } from '../tone'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './Tag.module.css'

export type TagProps = {
  children: ReactNode
  tone?: SubtleTone
  /** Supply to make the tag removable. Its absence is what makes it read-only. */
  onRemove?: () => void
  /** Accessible name for the remove control, e.g. "Remove filter: unassigned". */
  removeLabel?: string
  className?: string
}

/**
 * A removable label: an applied filter, a keyword on a record, a recipient in a
 * send list. Removing one is a local edit, so it needs no confirmation — an
 * outward mutation would go through `<ConfirmGate>` instead.
 */
export function Tag({ children, tone = 'neutral', onRemove, removeLabel, className }: TagProps) {
  return (
    <span
      className={cx(tones.tone, styles.tag, className)}
      data-tone={tone}
      data-removable={onRemove ? '' : undefined}
    >
      <span className={styles.text}>{children}</span>
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
        >
          {/* The cross is drawn, not fetched: the icon sprite carries no close
              symbol and this step does not own the sprite. */}
          <span className={styles.removeGlyph} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}
