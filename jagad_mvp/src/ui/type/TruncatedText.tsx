import { cx } from './cx'
import styles from './TruncatedText.module.css'

export type TruncatedTextProps = {
  text: string
  /** Lines kept before the text is clamped. One line uses an ellipsis instead. */
  lines?: number
  /**
   * Expose the full text on hover. Off for anything sensitive: a title
   * attribute is still text in the DOM, and health, diagnosis and document text
   * are not permitted to sit there.
   */
  showTitle?: boolean
  className?: string
}

/**
 * Long free text in a cell that has a fixed height: remarks, addresses,
 * rejection reasons.
 */
export function TruncatedText({
  text,
  lines = 1,
  showTitle = true,
  className,
}: TruncatedTextProps) {
  if (lines <= 1) {
    return (
      <span className={cx(styles.single, className)} title={showTitle ? text : undefined}>
        {text}
      </span>
    )
  }

  return (
    <span
      className={cx(styles.truncated, className)}
      style={{ WebkitLineClamp: lines }}
      title={showTitle ? text : undefined}
    >
      {text}
    </span>
  )
}
