import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import type { Tone } from '../tone'
import { Skeleton } from './Skeleton'
import styles from './StatCard.module.css'

type StatCardProps = {
  label: string
  /** Already formatted. Nothing in `src/ui` computes or formats money. */
  value: ReactNode
  /** Context the number needs: "of 42", "since Monday", "TAT 4h". */
  meta?: string
  tone?: Tone
  icon?: IconName
  loading?: boolean
  /** Makes the whole tile the way into the queue it counts. */
  onClick?: () => void
}

/**
 * One number from a queue, sized to be read across a room.
 *
 * The value is rendered, never derived: a stat card displays a figure it was
 * handed. It has no arithmetic in it, which is what keeps it usable for money
 * without breaching the record-only rule.
 */
export function StatCard({
  label,
  value,
  meta,
  tone,
  icon,
  loading,
  onClick,
}: StatCardProps) {
  const body = (
    <>
      <span className={styles.head}>
        <span className={styles.label}>{label}</span>
        {icon ? <Icon name={icon} size="md" className={styles.icon} /> : null}
      </span>
      {loading ? (
        <Skeleton width="4ch" height="var(--text-2xl)" />
      ) : (
        <span className={styles.value}>{value}</span>
      )}
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={styles.card} data-tone={tone} onClick={onClick}>
        {body}
      </button>
    )
  }

  return (
    <div className={styles.card} data-tone={tone}>
      {body}
    </div>
  )
}
