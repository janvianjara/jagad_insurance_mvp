import styles from './Skeleton.module.css'

const SHAPE_CLASS = {
  text: styles.text,
  block: styles.block,
  circle: styles.circle,
} as const

export type SkeletonShape = keyof typeof SHAPE_CLASS

type SkeletonProps = {
  shape?: SkeletonShape
  /** Any CSS length. Percentages let a skeleton row mimic ragged text. */
  width?: string
  height?: string
  className?: string
}

/**
 * A loading placeholder shaped like the thing that is coming.
 *
 * Every list surface in this product has three states, and this is the first
 * one: skeleton while the repository is in flight, `<EmptyState>` when it
 * returns nothing, rows when it returns something. Skeletons are hidden from
 * assistive technology — the surrounding region announces "loading" once,
 * rather than a dozen empty boxes announcing nothing.
 */
export function Skeleton({ shape = 'text', width, height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, SHAPE_CLASS[shape], className].filter(Boolean).join(' ')}
      style={{ width, height }}
    />
  )
}

/** A paragraph's worth of skeleton lines, the last one short like real text. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className={styles.stack} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '60%' : '100%'} />
      ))}
    </span>
  )
}
