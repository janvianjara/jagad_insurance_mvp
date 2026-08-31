import type { ReactNode } from 'react'
import { BlockRenderer } from '../blocks/BlockRenderer'
import type { Block } from '../blocks/blocks'
import { TURN_KINDS } from './turn-kinds'
import type { TurnKind } from './turn-kinds'
import styles from './Turn.module.css'

/**
 * One entry in the feed, in the prototype's shape.
 *
 * The prototype's turn is `.who` over `.body` and nothing else — no card, no
 * border, no raised surface. What carries a border there is the CONTENT: a rows
 * block, a table, a note. Our first pass had it the other way round, wrapping
 * every turn in a panel and then drawing bordered lists inside it, which is the
 * "congested" the client is looking at: two frames around every fact.
 *
 * The attribution line is the prototype's, verbatim. It has two states —
 * `Assistant`, and `Assistant · noticed just now` for anything raised without
 * being asked — and keeping the second visibly different is the point: a person
 * needs to tell at a glance which lines they asked for and which arrived on
 * their own, and FR-22.8's reason line only means something once they can.
 *
 * The prototype marks the line with a small dot tinted per persona. Persona
 * tinting is exactly what plan §10 discards along with the rest of its styling,
 * so the dot keeps its shape and takes its colour from U7 instead: green where
 * it stands for the product itself, lime — "needs a person" — on a notice, and
 * green again on a queue that is clear, the one genuinely positive state this
 * screen can report.
 *
 * `tag` carries the request kind FR-22.2 asks for. M0 answers only `Ask`.
 */

export type TurnProps = {
  kind: TurnKind
  blocks: readonly Block[]
  tag?: string
  /** Provenance beside the attribution: when these counts were taken. */
  meta?: ReactNode
  /** A dismiss control on a notice; nothing elsewhere. */
  actions?: ReactNode
  /** Rendered instead of the blocks while an answer is still being read. */
  busy?: boolean
  /** A briefing whose whole queue is clear. A result, drawn as one. */
  quiet?: boolean
  /**
   * Rendered under the blocks once they have landed — the answer's provenance
   * (FR-22.11), and nothing else so far.
   *
   * It goes below rather than in the attribution line because it is about what
   * was read, which only becomes a question once the reader has seen what came
   * back. Suppressed while the turn is busy: an answer that has not arrived has
   * read nothing yet, and saying so mid-query would be untrue for a moment.
   */
  footer?: ReactNode
  /** Where a produced document's Open goes. Only an answer ever carries one. */
  onOpenDocument?: (documentId: string) => void
}

function attribution(kind: TurnKind): string {
  if (kind === TURN_KINDS.question) return 'You'
  if (kind === TURN_KINDS.notice) return 'Assistant · noticed just now'
  return 'Assistant'
}

function variantOf(kind: TurnKind, quiet?: boolean): { variant?: 'notice' | 'quiet' } {
  if (kind === TURN_KINDS.notice) return { variant: 'notice' }
  if (kind === TURN_KINDS.briefing && quiet === true) return { variant: 'quiet' }
  return {}
}

/**
 * The prototype's own waiting state: three dots where the sentence will be,
 * rather than a line of text that has to be read and then replaced.
 */
function Typing() {
  return (
    <p className={styles.typing} aria-busy="true">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.typingLabel}>Reading your queue</span>
    </p>
  )
}

export function Turn({
  kind,
  blocks,
  tag,
  meta,
  actions,
  busy,
  quiet,
  footer,
  onOpenDocument,
}: TurnProps) {
  const person = kind === TURN_KINDS.question
  const prominent = kind === TURN_KINDS.briefing

  if (person) {
    return (
      <article className={styles.turn} data-kind={kind}>
        <div className={styles.bubble}>
          <BlockRenderer blocks={blocks} />
        </div>
      </article>
    )
  }

  return (
    <article className={styles.turn} data-kind={kind} data-quiet={quiet ? '' : undefined}>
      <header className={styles.who}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.author}>{attribution(kind)}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        {actions ? <span className={styles.actions}>{actions}</span> : null}
      </header>

      <div className={styles.body}>
        {busy ? (
          <Typing />
        ) : (
          <>
            <BlockRenderer
              blocks={blocks}
              prominent={prominent}
              {...variantOf(kind, quiet)}
              {...(onOpenDocument ? { onOpenDocument } : {})}
            />
            {footer}
          </>
        )}
      </div>
    </article>
  )
}
