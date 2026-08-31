import { Link } from 'react-router'
import { Icon } from '../../../ui/Icon'
import { DateTime } from '../../../ui/type'
import { threadTitle, useThreadsStore } from './thread-store'
import styles from './RecentThreads.module.css'

/**
 * The conversations this session has had — FR-22.12, on the landing screen.
 *
 * It is deliberately NOT a rail item. The rail is destinations, it is already
 * long, and "the conversation I was having ten minutes ago" is not a
 * destination — it is a thing that belongs beside the conversation you are
 * having now, the way a mail client puts the thread list beside the thread. So
 * it lives here, on `/assistant` and on a resumed thread, as a column of links
 * to `/assistant/:threadId`. The URL is what makes a conversation resumable and
 * this list is what makes the URL discoverable.
 *
 * Every entry is a link to an address, which is the point: the same href works
 * from the Cmd/Ctrl-K drawer, from the browser's own history and from a message
 * to a colleague — though what is behind it is this session's memory and no
 * more, which is what the closing line says rather than implies.
 *
 * A thread enters this list by being asked a question, never by a screen being
 * opened. Otherwise the list fills with blanks and the three things somebody
 * actually asked this morning are the hardest to find in it.
 */
export function RecentThreads({ currentThreadId }: { currentThreadId?: string }) {
  const threads = useThreadsStore((state) => state.threads)
  const order = useThreadsStore((state) => state.order)

  const listed = order.map((id) => threads[id]).filter((thread) => thread !== undefined)

  return (
    <section className={styles.recent} aria-labelledby="assistant-recent">
      <h2 id="assistant-recent" className={styles.heading}>
        Conversations
      </h2>

      {listed.length === 0 ? (
        <p className={styles.empty}>
          Nothing asked yet. Ask a question and this conversation is listed here, with a link that
          reopens it.
        </p>
      ) : (
        <ul className={styles.list}>
          {listed.map((thread) => {
            const current = thread.id === currentThreadId
            const answered = thread.turns.filter((turn) => turn.blocks !== null).length

            return (
              <li key={thread.id}>
                <Link
                  className={styles.item}
                  to={`/assistant/${thread.id}`}
                  data-current={current ? '' : undefined}
                  {...(current ? { 'aria-current': 'page' as const } : {})}
                >
                  <span className={styles.title}>{threadTitle(thread)}</span>
                  <span className={styles.meta}>
                    <DateTime value={thread.startedAt} mode="time" />
                    <span className={styles.dot} aria-hidden="true" />
                    {answered === 1 ? '1 answer' : `${answered} answers`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/*
        One line, and it is the honest one. There is no backend in this build, so
        a thread lives as long as the tab does. Saying it here is cheaper than
        letting somebody discover it after a reload and conclude the product lost
        their work.
      */}
      <p className={styles.note}>
        <Icon name="clock" size="sm" />
        <span>
          Conversations are held for this browser session only. Nothing here is written to a
          record, and a reload starts a fresh one.
        </span>
      </p>
    </section>
  )
}
