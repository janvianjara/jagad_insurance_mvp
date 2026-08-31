import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PageHeader, useDrawerSlot } from '../../components/AppShell'
import { recordingRepository } from '../../data/assistant'
import type { AssistantSourceKey } from '../../data/assistant'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import type { AskCard } from './ask/ask-cards'
import {
  REQUEST_KINDS,
  chipsFor,
  followUpsFor,
  matchAskCard,
  unmatchedAnswer,
} from './ask/ask-cards'
import { REFUSAL_TAG, refusalAnswer, refusalFor } from './ask/refusals'
import type { Block } from './blocks/blocks'
import { rowIdsIn, withoutRows } from './blocks/blocks'
import { briefingFor, briefingIsQuiet } from './briefing/briefing'
import { AssistantDocumentDrawer } from './documents/AssistantDocumentDrawer'
import type { AssistantDocumentPage } from './documents/document-page'
import { Turn } from './feed/Turn'
import { TURN_KINDS } from './feed/turn-kinds'
import { evaluateNotices } from './notices/notice-rules'
import { useNoticesStore } from './notices/notices-store'
import { ProvenanceNote } from './thread/ProvenanceNote'
import { NEW_CONVERSATION, nextTurnId, useThreadsStore } from './thread/thread-store'
import type { ThreadTurn } from './thread/thread-store'
import { useAssistantSession, useQueueSnapshot } from './use-assistant'
import styles from './AssistantConversation.module.css'

/**
 * The conversation — the landing view's whole substance, and the drawer's.
 *
 * The layout is the prototype's, which is four regions and not a page of
 * sections: a HEADER naming the conversation and who is having it, a scrolling
 * FEED of turns in one centred column, a row of SUGGESTION CHIPS under it, and
 * a COMPOSER under those. The chips and the composer stay put while the feed
 * scrolls, so the way in is always in the same place — that is the rhythm of
 * its `.top` / feed / `.sug` / `.comp`, and the reason the prototype reads
 * calmly where our first pass read as congested.
 *
 * The order inside the feed is the order of the requirement. The generated
 * briefing (FR-22.1) is first and always present, so nobody meets a blank prompt
 * or a greeting. Anything a threshold raised follows it, labelled "noticed just
 * now" and carrying its reason (FR-22.8). Then whatever the person asked for.
 *
 * Four composition decisions belong to this file rather than to the pure modules
 * below it, because each is about behaviour rather than about content.
 *
 *   The briefing does not re-list a record a notice is already raising. Both
 *   read the same queues, so the four rows the briefing prints to illustrate its
 *   counts are routinely the four the notice below is about to print with a
 *   reason attached. Printing them twice makes the screen look padded and pushes
 *   the unasked-for part — the distinctive part — under the fold. The sentence
 *   and its counts are untouched; only the duplicate illustration is dropped.
 *
 *   A notice ARRIVES rather than being there. The prototype waits, then pushes
 *   it into a conversation that has already started, and the delay is the whole
 *   point: something that was on screen when you got there is part of the page,
 *   and something that appears while you are reading is the system telling you
 *   it noticed. Same rows, same reason, entirely different meaning.
 *
 *   An answer proposes what follows it. Pressing "which inquiries have nobody on
 *   them" replaces the chip row with the moves that follow from that answer, not
 *   with the same six chips again. That is the difference between a conversation
 *   and a menu with a text box on it.
 *
 *   A typed question is matched against this role's own cards and answered by
 *   running one, or it is answered by saying plainly that the build answers a
 *   fixed set — the prototype's exact contract. What it never does is take a
 *   sentence and reply with something adjacent, which is how a product teaches
 *   people not to trust it.
 */

/**
 * Where a conversation with no id keeps its turns.
 *
 * Both halves are the same shape — `ThreadTurn` — so the feed below does not
 * know or care which it is reading. A conversation given a `threadId` keeps its
 * turns in the thread store, where a URL can find them again; one without keeps
 * them in local state and ends when the screen does. The second case exists for
 * the tests and for any surface that genuinely wants a scratch conversation,
 * and it is the reason nothing in this file may assume a thread exists.
 */
const NO_TURNS: readonly ThreadTurn[] = []
const NO_DOCUMENTS: readonly AssistantDocumentPage[] = []

/**
 * How long the three dots show before an answer lands.
 *
 * The prototype's 420ms, and it is not decoration. A local query returns in
 * single-digit milliseconds, so without it the answer is simply already there
 * and the person cannot tell that pressing the chip did anything. The pause is
 * what makes the reply legible as a reply.
 */
const THINKING_MS = 420

/**
 * How long before a threshold notice pushes itself into the conversation.
 *
 * The prototype waits 6.5 seconds — long enough to have read the briefing, short
 * enough to still be on the screen. Ours is the same, and it is why the notice
 * says "noticed just now" without that being a small lie.
 */
const NOTICE_DELAY_MS = 6500

export function AssistantConversation({
  contextLabel,
  pinAsk = true,
  withHeader = false,
  headerTitle = 'Assistant',
  breadcrumb,
  aside,
  threadId,
  onRestart,
  capabilitiesTo,
  noticeDelayMs = NOTICE_DELAY_MS,
}: {
  contextLabel?: string
  /**
   * Which conversation this is.
   *
   * Given one, the turns live in the thread store under that id, which is what
   * makes `/assistant/:threadId` able to resume it and what makes a
   * conversation started in the Cmd/Ctrl-K drawer the same conversation when it
   * is opened on the full screen. Without one, the turns are local and the
   * conversation cannot be reopened — honest, and the reason no surface a
   * person navigates to leaves it out.
   */
  threadId?: string
  /**
   * What "New conversation" means on this surface.
   *
   * The conversation cannot mint its own id: it does not own which thread it is
   * showing, and a component that reassigned its own identity would leave the
   * URL pointing at the old one. So it clears what it holds and tells the
   * screen, which decides — a fresh id on the landing view, a navigation back
   * to `/assistant` on a resumed thread.
   */
  onRestart?: () => void
  /** The screen's `<h1>`. Every screen in this product names itself in it. */
  headerTitle?: string
  breadcrumb?: ReactNode
  /**
   * A column beside the feed — the session's other conversations.
   *
   * It is passed in rather than rendered here because what belongs beside a
   * conversation is a decision for the screen: the landing view and a resumed
   * thread both want the list, and the drawer, which is three hundred pixels
   * wide, wants nothing of the sort.
   */
  aside?: ReactNode
  /**
   * Whether the chips and composer stay put while the feed scrolls past them.
   *
   * True on the full screen, which is the prototype's own layout. False in the
   * Cmd-K drawer: that surface is a few hundred pixels wide and already scrolls
   * inside a panel, and a second pinned region inside it leaves a person with a
   * feed two turns tall. There the way in simply follows the conversation.
   */
  pinAsk?: boolean
  /**
   * Whether to draw the prototype's `.top` — the conversation's name, who is
   * having it, and the controls that belong to the conversation as a whole.
   *
   * On the full screen, yes: the conversation IS the screen, so its header is
   * the screen's header. In the Cmd-K drawer, no — the drawer already has a
   * title bar and a second one inside it is chrome about chrome.
   */
  withHeader?: boolean
  /**
   * Where "What the Assistant can do" lives, if this surface offers it.
   *
   * The prototype puts it in the sidebar under Help. Ours puts it at the foot of
   * the conversation, next to the line about nothing being stored — which is the
   * moment a person is actually wondering what this thing is allowed to do, and
   * is a better place to answer it than a nav item they will scroll past.
   */
  capabilitiesTo?: string
  /**
   * How long a threshold notice waits before arriving.
   *
   * The landing screen takes the default and should: a person who navigated
   * here is reading their briefing, and a notice that arrives while they read
   * is the system saying it noticed, where the same rows sitting there on
   * arrival would just be more page.
   *
   * The Cmd-K panel passes zero, and that is a product decision rather than a
   * convenience. Somebody who pressed a shortcut summoned the Assistant for a
   * specific reason and is going to be gone in fifteen seconds; making them
   * wait six of those to be told a claim has aged means they never see it.
   */
  noticeDelayMs?: number
}) {
  const session = useAssistantSession()
  const snapshot = useQueueSnapshot(session)
  const dismissed = useNoticesStore((state) => state.dismissed)
  const dismiss = useNoticesStore((state) => state.dismiss)
  const drawerSlot = useDrawerSlot()

  const thread = useThreadsStore((state) => (threadId ? state.threads[threadId] : undefined))
  const openTurn = useThreadsStore((state) => state.openTurn)
  const settleTurn = useThreadsStore((state) => state.settleTurn)
  const addDocuments = useThreadsStore((state) => state.addDocuments)

  const [localTurns, setLocalTurns] = useState<readonly ThreadTurn[]>([])
  const [localDocuments, setLocalDocuments] = useState<readonly AssistantDocumentPage[]>([])
  const [typed, setTyped] = useState('')
  const [openDocument, setOpenDocument] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [waited, setWaited] = useState(false)

  const turns = threadId ? (thread?.turns ?? NO_TURNS) : localTurns
  const documents = threadId ? (thread?.documents ?? NO_DOCUMENTS) : localDocuments

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

  /*
   * The prototype's `arm()`. A notice waits, then arrives.
   *
   * It is armed once the queue has been read — before that there is nothing to
   * raise — and it is disarmed when the person asks something, because pushing
   * an unrelated notice on top of an answer somebody is reading is the exact
   * behaviour that makes people turn notifications off.
   */
  useEffect(() => {
    if (!snapshot.data || waited || turns.length > 0 || noticeDelayMs <= 0) return
    const timer = setTimeout(() => setWaited(true), noticeDelayMs)
    return () => clearTimeout(timer)
  }, [snapshot.data, waited, turns.length, noticeDelayMs])

  /*
   * A zero delay is derived rather than set. Writing `true` into state from the
   * effect body would be a render cascade for a value that is a pure function of
   * two things already in hand, and the React Compiler lint says so.
   */
  const noticesArrived = noticeDelayMs <= 0 || waited

  const chips = chipsFor(session.templateKey)

  /* The chips under the feed: the role's own until an answer proposes better. */
  const lastAnswered = [...turns].reverse().find((turn) => turn.blocks !== null)
  const offered =
    lastAnswered?.cardId != null ? followUpsFor(lastAnswered.cardId, session.templateKey) : chips

  const raised = snapshot.data
    ? evaluateNotices(snapshot.data).filter((notice) => !dismissed.includes(notice.id))
    : []
  const notices = noticesArrived ? raised : []

  /*
   * The briefing is composed against everything a notice WILL raise, not only
   * what has arrived. Otherwise a row appears in the briefing and then again,
   * six seconds later, in the notice below it — which reads as the screen
   * repeating itself rather than as one of them being the reason for the other.
   */
  const noticed = new Set<string>()
  for (const notice of raised) for (const id of rowIdsIn(notice.blocks)) noticed.add(id)

  const briefing = snapshot.data
    ? withoutRows(briefingFor(session.templateKey, snapshot.data), noticed)
    : []
  const quiet = snapshot.data ? briefingIsQuiet(session.templateKey, snapshot.data) : false

  function open(question: string, tag: string, cardId: string | null): string {
    const turn: ThreadTurn = {
      id: nextTurnId(),
      question,
      tag,
      cardId,
      blocks: null,
      sources: [],
      readAt: null,
    }

    if (threadId) openTurn(threadId, turn)
    else setLocalTurns((previous) => [...previous, turn])

    return turn.id
  }

  /**
   * The answer, what it read to answer, and when.
   *
   * `sources` is recorded rather than declared — see `recordingRepository` — so
   * the provenance line under an answer cannot claim a queue the card never
   * opened, and cannot omit one it did.
   */
  function settle(
    id: string,
    blocks: readonly Block[],
    sources: readonly AssistantSourceKey[],
    produced?: readonly AssistantDocumentPage[],
  ) {
    const settled = { blocks, sources, readAt: new Date().toISOString() }

    if (threadId) {
      settleTurn(threadId, id, settled)
      if (produced && produced.length > 0) addDocuments(threadId, produced)
      return
    }

    setLocalTurns((previous) =>
      previous.map((turn) => (turn.id === id ? { ...turn, ...settled } : turn)),
    )

    if (!produced || produced.length === 0) return

    // A document produced twice in one conversation is one document. The id is
    // derived from the record and the moment, so a second run of the same card
    // is a genuinely new sheet and appears as one.
    setLocalDocuments((previous) => {
      const known = new Set(previous.map((document) => document.id))
      const added = produced.filter((document) => !known.has(document.id))
      return added.length === 0 ? previous : [...previous, ...added]
    })
  }

  async function run(card: AskCard) {
    const repo = session.repo
    if (!repo) return

    const id = open(card.question, card.kind, card.id)
    // The card is handed the recorder, not the facade. It returns the same
    // projections; what it adds is a note of which doors were opened.
    const reads = recordingRepository(repo)
    const [result] = await Promise.all([
      card.run(reads.repo, new Date()),
      new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
    ])
    settle(id, result.blocks, reads.sourcesRead(), result.documents)
  }

  async function send() {
    const question = typed.trim()
    const repo = session.repo
    if (question.length === 0 || !repo) return

    setTyped('')

    /*
     * A boundary question is refused before anything is read, and the refusal
     * says which boundary and where it is kept.
     *
     * This is not the enforcement — the enforcement is that the field is not in
     * the allow-list, so a question these patterns miss still reaches a
     * projection that does not carry it. It is the explanation, and the product
     * is much stronger for having one: "I do not know that" and "that is not
     * something I can ever read" are different answers, and only the second one
     * is true here.
     */
    const refusal = refusalFor(question)
    if (refusal) {
      const refusedId = open(question, REFUSAL_TAG, null)
      const [refused] = await Promise.all([
        Promise.resolve(refusalAnswer(refusal)),
        new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
      ])
      // No sources: nothing was read, and the provenance line says exactly that.
      settle(refusedId, refused.blocks, [])
      return
    }

    const card = matchAskCard(question, chips)
    const id = open(question, card ? card.kind : REQUEST_KINDS.ask, card ? card.id : null)
    const reads = recordingRepository(repo)
    const [result] = await Promise.all([
      card ? card.run(reads.repo, new Date()) : Promise.resolve(unmatchedAnswer(chips)),
      new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
    ])
    settle(id, result.blocks, reads.sourcesRead(), result.documents)
  }

  /** The prototype's `fresh()`: back to the opening turn, nothing carried over. */
  function restart() {
    setLocalTurns([])
    setTyped('')
    setLocalDocuments([])
    setOpenDocument(null)
    setDrawerOpen(false)
    setWaited(false)
    // A thread is never emptied. The old conversation keeps its id and its place
    // in the list; the screen decides what "new" means and gives us the next one.
    onRestart?.()
  }

  function showDocument(documentId: string) {
    setOpenDocument(documentId)
    setDrawerOpen(true)
  }

  /*
   * The conversation's name — the prototype's `ctitle`.
   *
   * "New conversation" until something is asked, then the first request, which
   * is how every thread in this product will be named once threads are saved
   * (FR-22.12). It is read off the turns rather than stored, so it cannot drift
   * from them.
   *
   * It goes in the meta line and not in the heading, which is the one place this
   * screen does not take the prototype's layout. The prototype has one screen,
   * so its `.top` title can be the conversation. This product has forty, every
   * one of them names itself in its `<h1>`, and somebody moving between them by
   * heading — with a screen reader, or with the browser's own outline — is
   * relying on that. A landing view that announced itself as "What is open in my
   * book right now?" would be the only screen in the product you could not find
   * by name. So the heading stays the screen and the meta carries the
   * conversation, which is the prototype's own two-line `.top` with the two
   * lines the other way up.
   */
  const title = turns[0]?.question ?? NEW_CONVERSATION

  const drawer = drawerOpen ? (
    <AssistantDocumentDrawer
      documents={documents}
      openId={openDocument}
      onOpen={setOpenDocument}
      onIndex={() => setOpenDocument(null)}
      onClose={() => setDrawerOpen(false)}
    />
  ) : null

  return (
    <>
      {withHeader ? (
        <PageHeader
          title={headerTitle}
          {...(breadcrumb ? { breadcrumb } : {})}
          meta={
            <>
              <span className={styles.threadName}>{title}</span>
              <span>
                {session.userName}
                {session.roleLabel ? ` · ${session.roleLabel}` : null}
              </span>
              {thread ? (
                <span>
                  started <DateTime value={thread.startedAt} mode="time" />
                </span>
              ) : null}
            </>
          }
          actions={
            <>
              {documents.length > 0 ? (
                <Button
                  icon="folder"
                  onClick={() => {
                    setOpenDocument(null)
                    setDrawerOpen(true)
                  }}
                >
                  Documents
                  <span className={styles.count}>{documents.length}</span>
                </Button>
              ) : null}
              <Button icon="plus" onClick={restart} disabled={turns.length === 0}>
                New conversation
              </Button>
            </>
          }
        />
      ) : null}

      <div
        className={styles.conversation}
        data-pinned={pinAsk ? '' : undefined}
        data-aside={aside ? '' : undefined}
      >
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
                footer={<ProvenanceNote sources={turn.sources} readAt={turn.readAt} />}
                onOpenDocument={showDocument}
              />
            </div>
          ))}

          <div ref={endRef} />
        </div>

        {/*
          The session's other conversations, beside the one on screen rather
          than behind a nav item — the rail is destinations, and a conversation
          you were having ten minutes ago is not one.
        */}
        {aside ? <div className={styles.asideColumn}>{aside}</div> : null}

        {/*
          The prototype's `.sug` and `.comp`: the way in, always in the same
          place, under a feed that scrolls past it. The chips are the primary
          route and the composer is the escape hatch, which is the order they
          sit in.
        */}
        <div className={styles.ask}>
          <section aria-labelledby={askHeadingId}>
            <h2 id={askHeadingId} className={styles.askTitle}>
              {lastAnswered ? 'What usually follows' : 'Ask about your queue'}
            </h2>

            <div className={styles.chips} role="group" aria-label="Suggested questions">
              {offered.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={styles.chip}
                  data-kind={card.kind}
                  onClick={() => {
                    void run(card)
                  }}
                  disabled={!session.enabled}
                >
                  <span>{card.label}</span>
                  {/*
                    The prototype tags a chip with the kind of request it is
                    about to make and hides the tag on a plain read (`.chip.read
                    .mt {display:none}`) — so the tag means "this one is not just
                    a look-up" rather than being a label on everything.
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
                placeholder="Ask, or describe what you want done"
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
            One line, and the last thing on the screen. It used to be three, and
            a third of it explained what a typed question would do — which the
            composer above now demonstrates by doing it. What is left is the part
            no behaviour can show: that nothing here is stored, and that nothing
            here works out an amount (FR-22.5).
          */}
          <p className={styles.askNote}>
            Every suggestion runs a live query over the records this account can see. Nothing here is
            a stored answer, and nothing here works out a premium, a settlement or a refund.
            {capabilitiesTo ? (
              <>
                {' '}
                <Link className={styles.askLink} to={capabilitiesTo}>
                  What it will and will not do
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {drawer && drawerSlot ? createPortal(drawer, drawerSlot) : drawer}
    </>
  )
}
