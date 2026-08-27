import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import type { AskCard } from './ask/ask-cards'
import { REQUEST_KINDS, chipsFor, matchAskCard, unmatchedAnswer } from './ask/ask-cards'
import type { Block } from './blocks/blocks'
import { rowIdsIn, withoutRows } from './blocks/blocks'
import { briefingFor, briefingIsQuiet } from './briefing/briefing'
import { Turn } from './feed/Turn'
import { TURN_KINDS } from './feed/turn-kinds'
import { evaluateNotices } from './notices/notice-rules'
import { useNoticesStore } from './notices/notices-store'
import { useAssistantSession, useQueueSnapshot } from './use-assistant'
import styles from './AssistantConversation.module.css'

/**
 * The conversation — the landing view's whole substance, and the drawer's.
 *
 * The layout is the prototype's, which is three regions and not a page of
 * sections: a scrolling FEED of turns in one centred column, a row of SUGGESTION
 * CHIPS under it, and a COMPOSER under those. The chips and the composer stay
 * put while the feed scrolls, so the way in is always in the same place — that
 * is the rhythm of its feed / `.sug` / `.comp`, and the reason the prototype
 * reads calmly where our first pass read as congested.
 *
 * The order inside the feed is the order of the requirement. The generated
 * briefing (FR-22.1) is first and always present, so nobody meets a blank prompt
 * or a greeting. Anything a threshold raised follows it, labelled "noticed just
 * now" and carrying its reason (FR-22.8). Then whatever the person asked for.
 *
 * Two composition decisions belong to this file rather than to the pure modules
 * below it, because both are about what a person meets in the first seconds.
 *
 *   The briefing does not re-list a record a notice is already raising. Both
 *   read the same queues, so the four rows the briefing prints to illustrate its
 *   counts are routinely the four the notice below is about to print with a
 *   reason attached. Printing them twice makes the screen look padded and pushes
 *   the unasked-for part — the distinctive part — under the fold. The sentence
 *   and its counts are untouched; only the duplicate illustration is dropped.
 *
 *   A typed question is matched against this role's own cards and answered by
 *   running one, or it is answered by saying plainly that the build answers a
 *   fixed set — the prototype's exact contract. What it never does is take a
 *   sentence and reply with something adjacent, which is how a product teaches
 *   people not to trust it.
 */

type AskTurn = {
  readonly id: string
  readonly question: string
  readonly tag: string
  /** Null while the projection query is still running. */
  readonly blocks: readonly Block[] | null
}

export function AssistantConversation({
  contextLabel,
  pinAsk = true,
}: {
  contextLabel?: string
  /**
   * Whether the chips and composer stay put while the feed scrolls past them.
   *
   * True on the full screen, which is the prototype's own layout. False in the
   * Cmd-K drawer: that surface is a few hundred pixels wide and already scrolls
   * inside a panel, and a second pinned region inside it leaves a person with a
   * feed two turns tall. There the way in simply follows the conversation.
   */
  pinAsk?: boolean
}) {
  const session = useAssistantSession()
  const snapshot = useQueueSnapshot(session)
  const dismissed = useNoticesStore((state) => state.dismissed)
  const dismiss = useNoticesStore((state) => state.dismiss)

  const [turns, setTurns] = useState<readonly AskTurn[]>([])
  const [typed, setTyped] = useState('')
  const sequence = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const askHeadingId = useId()
  const composerId = useId()

  /*
   * The prototype's `down()`, which it calls after every turn it appends.
   *
   * Without it a person presses a chip, the answer lands under the pinned chip
   * row, and the screen appears not to have responded. It runs on any change to
   * the turns — a question opening AND its answer settling — and never on the
   * first paint, so the briefing is not scrolled off the top of its own screen.
   * The optional call is for environments with no layout (jsdom): a test asserts
   * the answer, not the scroll position.
   */
  useEffect(() => {
    if (turns.length === 0) return
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const chips = chipsFor(session.templateKey)
  const notices = snapshot.data
    ? evaluateNotices(snapshot.data).filter((notice) => !dismissed.includes(notice.id))
    : []

  const noticed = new Set<string>()
  for (const notice of notices) for (const id of rowIdsIn(notice.blocks)) noticed.add(id)

  const briefing = snapshot.data
    ? withoutRows(briefingFor(session.templateKey, snapshot.data), noticed)
    : []
  const quiet = snapshot.data ? briefingIsQuiet(session.templateKey, snapshot.data) : false

  function open(question: string, tag: string): string {
    sequence.current += 1
    const id = `turn-${sequence.current}`
    setTurns((previous) => [...previous, { id, question, tag, blocks: null }])
    return id
  }

  function settle(id: string, blocks: readonly Block[]) {
    setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, blocks } : turn)))
  }

  async function ask(card: AskCard) {
    const repo = session.repo
    if (!repo) return

    const id = open(card.question, card.kind)
    settle(id, await card.run(repo, new Date()))
  }

  async function send() {
    const question = typed.trim()
    const repo = session.repo
    if (question.length === 0 || !repo) return

    setTyped('')
    const card = matchAskCard(question, chips)
    const id = open(question, card ? card.kind : REQUEST_KINDS.ask)
    settle(id, card ? await card.run(repo, new Date()) : unmatchedAnswer(chips))
  }

  return (
    <div className={styles.conversation} data-pinned={pinAsk ? '' : undefined}>
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
            quiet={quiet}
            blocks={briefing}
            {...(snapshot.data
              ? {
                  meta: (
                    <>
                      counted <DateTime value={snapshot.data.now} mode="time" />
                    </>
                  ),
                }
              : {})}
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

        <div ref={endRef} />
      </div>

      {/*
        The prototype's `.sug` and `.comp`: the way in, always in the same place,
        under a feed that scrolls past it. The chips are the primary route and
        the composer is the escape hatch, which is the order they sit in.
      */}
      <div className={styles.ask}>
        <section aria-labelledby={askHeadingId}>
          <h2 id={askHeadingId} className={styles.askTitle}>
            Ask about your queue
          </h2>

          <div className={styles.chips} role="group" aria-label="Suggested questions">
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
                <span>{card.label}</span>
                {/*
                  The prototype tags a chip with the kind of request it is about
                  to make and hides the tag on a plain read (`.chip.read .mt
                  {display:none}`). M0 answers only Ask, so today nothing shows a
                  tag — the shape is here for the first card that acts.
                */}
                {card.kind === REQUEST_KINDS.ask ? null : (
                  <span className={styles.chipKind}>{card.kind}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label className={styles.composerLabel} htmlFor={composerId}>
            Ask a question
          </label>
          <div className={styles.box}>
            <input
              id={composerId}
              className={styles.input}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Ask about your queue"
              autoComplete="off"
              disabled={!session.enabled}
            />
            <button
              type="submit"
              className={styles.send}
              aria-label="Send"
              disabled={!session.enabled || typed.trim().length === 0}
            >
              <Icon name="upload" size="sm" />
            </button>
          </div>
        </form>

        {/*
          One line, and the last thing on the screen. It used to be three, and a
          third of it explained what a typed question would do — which the
          composer above now demonstrates by doing it. What is left is the part
          no behaviour can show: that nothing here is stored, and that nothing
          here works out an amount (FR-22.5).
        */}
        <p className={styles.askNote}>
          Every suggestion runs a live query over the records this account can see. Nothing here is a
          stored answer, and nothing here works out a premium, a settlement or a refund.
        </p>
      </div>
    </div>
  )
}
