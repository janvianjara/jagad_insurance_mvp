import { Link } from 'react-router'
import { AssistantConversation } from './AssistantConversation'
import { useThreadsStore } from './thread/thread-store'
import styles from './AssistantPanel.module.css'

/**
 * What Cmd/Ctrl-K opens, anywhere in the product — FR-22.10.
 *
 * "Context binding: opened from a record it carries that record as context;
 * summonable from any screen by keyboard shortcut." The shell owns the shortcut
 * and the panel; this is what goes inside, and the only thing it adds over the
 * full screen is the context the person was looking at when they pressed the
 * key.
 *
 * The context is carried, not fetched. The panel names the record so the person
 * can see what the Assistant is reading with; the Assistant still reaches it
 * through the same projection facade and the same `can()` as everywhere else, so
 * arriving with a record id grants nothing that navigating there would not.
 *
 * The drawer's conversation is a THREAD, with an id, and that is what makes the
 * two Assistant surfaces one product rather than two boxes that look alike.
 * Somebody asks something over a policy screen, decides it deserves a proper
 * look, and follows the link at the foot of the panel: the same conversation
 * opens at `/assistant/:threadId` with the exchange intact. The id lives in the
 * store rather than in this component so that closing the drawer and pressing
 * the shortcut again resumes what was being said instead of starting over.
 */
export function AssistantPanel({
  contextPath,
  contextLabel,
}: {
  contextPath?: string
  contextLabel?: string
}) {
  const threadId = useThreadsStore((state) => state.drawerThreadId)
  const started = useThreadsStore((state) => state.threads[state.drawerThreadId] !== undefined)

  const label = contextLabel ?? contextPath

  return (
    <div className={styles.panel}>
      {/*
        `noticeDelayMs={0}`: on the landing screen a notice arrives while the
        person reads, which is what makes it read as the system noticing. Here
        they pressed a shortcut, they are going to be gone in fifteen seconds,
        and a notice that waits six of those is one they never see.
      */}
      <AssistantConversation
        threadId={threadId}
        pinAsk={false}
        noticeDelayMs={0}
        {...(label === undefined ? {} : { contextLabel: label })}
      />
      <p className={styles.link}>
        {/*
          Two destinations, and the difference between them is the whole point of
          giving a drawer conversation an id: nothing asked yet goes to the
          landing view, and anything asked goes to ITS OWN address, where the
          exchange is already on the screen.
        */}
        {started ? (
          <Link to={`/assistant/${threadId}`}>Open this conversation as a full screen</Link>
        ) : (
          <Link to="/assistant">Open the Assistant as a full screen</Link>
        )}
      </p>
    </div>
  )
}
