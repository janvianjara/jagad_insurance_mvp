import { DISCARD_REASON_LABELS } from '../../domain/amend'
import type { DiscardMark } from '../../domain/amend'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import styles from './RecordCorrection.module.css'

export type DiscardNoticeProps = {
  readonly mark: DiscardMark
  readonly noun: string
  /** Resolves the staff id to a name. Falls back to the id, which is still an answer. */
  readonly nameOf?: (id: string) => string
  /** Offered only to somebody who may actually restore it. */
  readonly onRestore?: () => void
}

/**
 * A discarded record saying so, on its own detail screen.
 *
 * The defect this whole feature would otherwise introduce is a discarded record
 * that looks exactly like a live one: it has left the queues, so nobody finds it
 * by accident, and anybody who arrives by link or by bookmark reads a record
 * that no longer counts as though it did. So the banner is the first thing on
 * the screen, it carries all four facts — that it is discarded, when, by whom
 * and why — and the way back is on it rather than somewhere else.
 */
export function DiscardNotice({ mark, noun, nameOf, onRestore }: DiscardNoticeProps) {
  const who = nameOf?.(mark.discardedBy) ?? mark.discardedBy

  return (
    <div className={styles.notice} role="status">
      <Icon name="alert" size="md" />
      <div className={styles.noticeBody}>
        <p className={styles.noticeTitle}>{`This ${noun} is discarded`}</p>
        <p className={styles.noticeLine}>
          {`${DISCARD_REASON_LABELS[mark.reason]} — discarded by ${who} on `}
          <DateTime value={mark.discardedAt} mode="datetime" />
          {'. It has left every queue and is still in the book.'}
        </p>
        {mark.note ? <p className={styles.noticeNote}>{mark.note}</p> : null}
      </div>
      {onRestore ? (
        <Button variant="quiet" icon="check" onClick={onRestore}>
          Restore
        </Button>
      ) : null}
    </div>
  )
}
