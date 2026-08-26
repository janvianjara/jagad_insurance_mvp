import type { ReactNode } from 'react'
import { Icon } from '../../../ui/Icon'
import { BlockRenderer } from '../blocks/BlockRenderer'
import type { Block } from '../blocks/blocks'
import { TURN_KINDS } from './turn-kinds'
import type { TurnKind } from './turn-kinds'
import styles from './Turn.module.css'

/**
 * One entry in the feed, with the prototype's attribution line above it.
 *
 * The prototype has two: `Assistant`, and `Assistant · noticed just now` for
 * anything raised without being asked. Keeping the second visibly different is
 * the point — a person needs to be able to tell at a glance which lines they
 * asked for and which arrived on their own, and FR-22.8's reason line only makes
 * sense once that distinction is visible.
 *
 * `tag` carries the request kind FR-22.2 asks for. M0 answers only `Ask`, so
 * that is the only tag in circulation today.
 */

export type TurnProps = {
  kind: TurnKind
  blocks: readonly Block[]
  tag?: string
  /** A dismiss control on a notice; nothing elsewhere. */
  actions?: ReactNode
  /** Rendered instead of the blocks while an answer is still being read. */
  busy?: boolean
}

function attribution(kind: TurnKind): string {
  if (kind === TURN_KINDS.question) return 'You'
  if (kind === TURN_KINDS.notice) return 'Assistant · noticed just now'
  return 'Assistant'
}

export function Turn({ kind, blocks, tag, actions, busy }: TurnProps) {
  const person = kind === TURN_KINDS.question

  return (
    <article className={styles.turn} data-kind={kind}>
      <header className={styles.who}>
        {person ? null : <Icon name={kind === TURN_KINDS.notice ? 'alert' : 'spark'} size="sm" />}
        <span className={styles.author}>{attribution(kind)}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
        {actions ? <span className={styles.actions}>{actions}</span> : null}
      </header>

      <div className={styles.body}>
        {busy ? (
          <p className={styles.busy} aria-busy="true">
            Reading your queue
          </p>
        ) : (
          <BlockRenderer blocks={blocks} />
        )}
      </div>
    </article>
  )
}
