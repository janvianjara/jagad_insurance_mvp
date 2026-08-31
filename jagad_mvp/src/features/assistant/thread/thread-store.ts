/**
 * Conversations, and the identity that lets one be resumed — FR-22.12.
 *
 * A conversation without an id is a conversation you can only have once. The
 * Assistant appears in two places — the landing screen at `/assistant` and the
 * drawer Cmd/Ctrl-K opens over any record — and until a thread had an id those
 * two were unrelated boxes that happened to look alike. An id makes them one
 * thing, and the URL is what carries it: `/assistant/:threadId` is the same
 * conversation the drawer started, opened wide.
 *
 * Three decisions worth stating, because each is a place where being honest
 * costs something:
 *
 *   A thread lives for the session and no longer. There is no backend in this
 *   build, so there is nothing to write a thread to, and a store that quietly
 *   lost history a person believed was saved would be worse than one that never
 *   claimed to save it. The screens say so in one line; this file is why they
 *   have to.
 *
 *   A thread is created by its first question, not by opening a screen.
 *   Otherwise every visit to `/assistant` deposits an empty conversation in the
 *   list, and the list a person actually wants — the three things they asked
 *   this morning — is buried under a dozen blanks. `openTurn` is what brings a
 *   thread into existence.
 *
 *   The title is derived, never typed. It is the first question, verbatim,
 *   which is the only naming a person will not have to be taught and the only
 *   one that cannot go stale.
 *
 * A feature slice rather than a session slice: plan §7 keeps working state out
 * of the session store. Nothing here is a record, so nothing here goes through
 * a confirmation gate — asking a question changes no business fact, and the one
 * thing in this feature that would (an Act) is gated where it is performed.
 */

import { create } from 'zustand'
import type { AssistantSourceKey } from '../../../data/assistant'
import type { Block } from '../blocks/blocks'
import type { AssistantDocumentPage } from '../documents/document-page'

/* ---------------------------------------------------------------- the model */

export type ThreadTurn = {
  readonly id: string
  /** What the person asked, in their words or the chip's. */
  readonly question: string
  /** The request kind FR-22.2 tags a response with, or `Refused`. */
  readonly tag: string
  /** Which card produced it, so an answer can propose what follows. */
  readonly cardId: string | null
  /** Null while the projection query is still running. */
  readonly blocks: readonly Block[] | null
  /**
   * The projections this answer read, recorded as it read them (FR-22.11).
   *
   * Empty is a meaningful value, not a missing one: a refusal and an unmatched
   * question read nothing at all, and saying so is the point.
   */
  readonly sources: readonly AssistantSourceKey[]
  /** When the read happened, so the answer can be dated. Null until it lands. */
  readonly readAt: string | null
}

export type Thread = {
  readonly id: string
  readonly startedAt: string
  readonly turns: readonly ThreadTurn[]
  /** Anything a Produce card generated in this conversation (FR-22.9). */
  readonly documents: readonly AssistantDocumentPage[]
}

export const NEW_CONVERSATION = 'New conversation'

/** A thread's name: the first thing asked in it, verbatim. */
export function threadTitle(thread: Thread | undefined): string {
  return thread?.turns[0]?.question ?? NEW_CONVERSATION
}

/* ------------------------------------------------------------------- ids */

let threadSequence = 0
let turnSequence = 0

/**
 * A thread id that is safe in a URL and readable in one.
 *
 * The time is in it so the ids sort the way the conversations happened, and the
 * counter is in it because two conversations can start inside one millisecond.
 * There is nothing about the person or the records in it: a thread id ends up
 * in a browser history and in a pasted link, and neither is a place for
 * anything that identifies a customer.
 */
export function newThreadId(): string {
  threadSequence += 1
  return `t${Date.now().toString(36)}${threadSequence.toString(36)}`
}

export function nextTurnId(): string {
  turnSequence += 1
  return `turn-${turnSequence}`
}

/* ----------------------------------------------------------------- the store */

export type SettledTurn = {
  readonly blocks: readonly Block[]
  readonly sources: readonly AssistantSourceKey[]
  readonly readAt: string
}

export type ThreadsState = {
  readonly threads: Readonly<Record<string, Thread>>
  /** Most recent first. The order the landing screen lists them in. */
  readonly order: readonly string[]
  /**
   * The conversation the Cmd/Ctrl-K drawer is having.
   *
   * It lives here rather than in the drawer so that closing the drawer and
   * pressing the shortcut again resumes what was being said, and so that the
   * panel can offer a link to the same conversation on the full screen.
   */
  readonly drawerThreadId: string

  /** Appends a question, creating the thread if this is the first one. */
  openTurn(threadId: string, turn: ThreadTurn): void
  /** Fills in the answer, what it read, and when. */
  settleTurn(threadId: string, turnId: string, settled: SettledTurn): void
  addDocuments(threadId: string, documents: readonly AssistantDocumentPage[]): void
  /** Starts the drawer's conversation over, leaving the old one in the list. */
  newDrawerThread(): string
  /** Tests only: back to an empty session. */
  forget(): void
}

export const useThreadsStore = create<ThreadsState>((set) => ({
  threads: {},
  order: [],
  drawerThreadId: newThreadId(),

  openTurn(threadId, turn) {
    set((state) => {
      const existing = state.threads[threadId]
      const thread: Thread = existing
        ? { ...existing, turns: [...existing.turns, turn] }
        : {
            id: threadId,
            startedAt: new Date().toISOString(),
            turns: [turn],
            documents: [],
          }

      return {
        threads: { ...state.threads, [threadId]: thread },
        order: existing ? state.order : [threadId, ...state.order],
      }
    })
  },

  settleTurn(threadId, turnId, settled) {
    set((state) => {
      const thread = state.threads[threadId]
      if (!thread) return state

      return {
        threads: {
          ...state.threads,
          [threadId]: {
            ...thread,
            turns: thread.turns.map((turn) =>
              turn.id === turnId ? { ...turn, ...settled } : turn,
            ),
          },
        },
      }
    })
  },

  addDocuments(threadId, documents) {
    if (documents.length === 0) return

    set((state) => {
      const thread = state.threads[threadId]
      if (!thread) return state

      // A document produced twice in one conversation is one document. The id is
      // derived from the record and the moment, so a second run of the same card
      // is a genuinely new sheet and appears as one.
      const known = new Set(thread.documents.map((document) => document.id))
      const added = documents.filter((document) => !known.has(document.id))
      if (added.length === 0) return state

      return {
        threads: {
          ...state.threads,
          [threadId]: { ...thread, documents: [...thread.documents, ...added] },
        },
      }
    })
  },

  newDrawerThread() {
    const id = newThreadId()
    set({ drawerThreadId: id })
    return id
  },

  forget() {
    set({ threads: {}, order: [], drawerThreadId: newThreadId() })
  },
}))
