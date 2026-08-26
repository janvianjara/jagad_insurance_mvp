import { useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { AskCard } from './ask/ask-cards'
import { chipsFor } from './ask/ask-cards'
import type { Block } from './blocks/blocks'
import { briefingFor } from './briefing/briefing'
import { Turn } from './feed/Turn'
import { TURN_KINDS } from './feed/turn-kinds'
import { evaluateNotices } from './notices/notice-rules'
import { useNoticesStore } from './notices/notices-store'
import { useAssistantSession, useQueueSnapshot } from './use-assistant'
import styles from './AssistantConversation.module.css'

/**
 * The conversation — the landing view's whole substance, and the drawer's.
 *
 * The order on screen is the order of the requirement. The generated briefing
 * (FR-22.1) is first and always present, so nobody meets a blank prompt or a
 * greeting. Anything a threshold raised follows it, labelled "noticed just now"
 * and carrying its reason (FR-22.8). Then whatever the person asked for.
 *
 * Free text is deliberately absent. §14's M0 depth is Ask-only and the input row
 * is P3, so the composer below routes to the chips instead of accepting prose —
 * a text box that swallows a sentence and answers something else teaches people
 * the product is unreliable, which is more expensive than the missing feature.
 */

type AskTurn = {
  readonly id: string
  readonly question: string
  readonly tag: string
  /** Null while the projection query is still running. */
  readonly blocks: readonly Block[] | null
}

export function AssistantConversation({ contextLabel }: { contextLabel?: string }) {
  const session = useAssistantSession()
  const snapshot = useQueueSnapshot(session)
  const dismissed = useNoticesStore((state) => state.dismissed)
  const dismiss = useNoticesStore((state) => state.dismiss)

  const [turns, setTurns] = useState<readonly AskTurn[]>([])
  const sequence = useRef(0)
  const chipsRef = useRef<HTMLDivElement>(null)

  const chips = chipsFor(session.templateKey)
  const notices = snapshot.data
    ? evaluateNotices(snapshot.data).filter((notice) => !dismissed.includes(notice.id))
    : []

  async function ask(card: AskCard) {
    const repo = session.repo
    if (!repo) return

    sequence.current += 1
    const id = `turn-${sequence.current}`
    setTurns((previous) => [
      ...previous,
      { id, question: card.question, tag: card.kind, blocks: null },
    ])

    const blocks = await card.run(repo, new Date())
    setTurns((previous) =>
      previous.map((turn) => (turn.id === id ? { ...turn, blocks } : turn)),
    )
  }

  function focusChips() {
    chipsRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  return (
    <div className={styles.conversation}>
      <div className={styles.feed}>
        {contextLabel ? (
          <p className={styles.context}>
            <Icon name="doc" size="sm" />
            <span className={styles.contextLabel}>Reading with</span>
            <span className={styles.contextValue}>{contextLabel}</span>
          </p>
        ) : null}

        {snapshot.status === 'error' ? (
          <Turn
            kind={TURN_KINDS.briefing}
            blocks={[
              {
                kind: 'para',
                text: 'Your queue could not be read just now, so there is no briefing to show. Nothing has changed in the records.',
              },
              { kind: 'note', text: snapshot.error?.message ?? 'The request failed.' },
            ]}
            actions={
              <Button variant="quiet" size="sm" onClick={snapshot.reload}>
                Try again
              </Button>
            }
          />
        ) : (
          <Turn
            kind={TURN_KINDS.briefing}
            busy={snapshot.status === 'loading'}
            blocks={snapshot.data ? briefingFor(session.templateKey, snapshot.data) : []}
          />
        )}

        {notices.map((notice) => (
          <Turn
            key={notice.id}
            kind={TURN_KINDS.notice}
            blocks={notice.blocks}
            actions={
              <Button
                variant="quiet"
                size="sm"
                icon="close"
                label={`Dismiss: ${notice.headline}`}
                onClick={() => dismiss(notice.id)}
              />
            }
          />
        ))}

        {turns.map((turn) => (
          <div key={turn.id} className={styles.exchange}>
            <Turn kind={TURN_KINDS.question} blocks={[{ kind: 'para', text: turn.question }]} />
            <Turn
              kind={TURN_KINDS.answer}
              tag={turn.tag}
              busy={turn.blocks === null}
              blocks={turn.blocks ?? []}
            />
          </div>
        ))}
      </div>

      <div className={styles.chips} ref={chipsRef} role="group" aria-label="Suggested questions">
        {chips.map((card) => (
          <button
            key={card.id}
            type="button"
            className={styles.chip}
            onClick={() => {
              void ask(card)
            }}
            disabled={!session.enabled}
          >
            {card.label}
          </button>
        ))}
      </div>

      <div className={styles.composer}>
        <button type="button" className={styles.composerButton} onClick={focusChips}>
          <Icon name="search" size="sm" />
          <span>Pick a question</span>
        </button>
        <p className={styles.composerNote}>
          Typed questions arrive in a later phase. Every suggestion above runs as a live query over
          the records this account can see — nothing here is a stored answer.
        </p>
      </div>
    </div>
  )
}
