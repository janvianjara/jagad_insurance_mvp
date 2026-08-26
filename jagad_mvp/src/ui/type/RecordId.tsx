import { cx } from './cx'
import styles from './RecordId.module.css'

export type RecordIdProps = {
  /** Always present: generated at creation. `INQ-1041`, `POL-DRAFT-0219`. */
  systemNo: string
  /** Present once the insurer has issued theirs. */
  insurerNo?: string | null
  /** Drop the insurer half entirely — for entities that never carry one. */
  showInsurer?: boolean
  layout?: 'inline' | 'stacked'
  /** Wording for the pending state, e.g. "policy no. awaited". */
  awaitedText?: string
  className?: string
}

/**
 * Dual numbering, plan §8.
 *
 * Every numbered entity carries two numbers: `systemNo`, generated here and
 * always present, and `insurerNo`, which arrives from the insurer and often has
 * not arrived yet. Rendering them through one component is what keeps the
 * distinction visible everywhere — an ops user must never have to guess which
 * of two numbers on a screen is the one the insurer will recognise.
 *
 * The absent insurer number is drawn rather than omitted. A blank gap reads as
 * "nothing to see"; "awaited" reads as "this record is still open with the
 * insurer", which is what it actually means and what the queue is filtered on.
 */
export function RecordId({
  systemNo,
  insurerNo,
  showInsurer = true,
  layout = 'inline',
  awaitedText = 'insurer no. awaited',
  className,
}: RecordIdProps) {
  const hasInsurer = typeof insurerNo === 'string' && insurerNo.trim() !== ''

  return (
    <span className={cx(styles.record, className)} data-layout={layout}>
      <span className={styles.part}>
        <span className={styles.caption}>sys</span>
        <span className={styles.system}>{systemNo}</span>
      </span>
      {showInsurer ? (
        <>
          {layout === 'inline' ? (
            <span className={styles.divider} aria-hidden="true">
              ·
            </span>
          ) : null}
          {hasInsurer ? (
            <span className={styles.part}>
              <span className={styles.caption}>insurer</span>
              <span className={styles.insurer}>{insurerNo}</span>
            </span>
          ) : (
            <span className={styles.awaited}>{awaitedText}</span>
          )}
        </>
      ) : null}
    </span>
  )
}
