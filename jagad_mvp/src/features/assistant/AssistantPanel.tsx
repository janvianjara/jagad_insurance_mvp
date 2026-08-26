import { Link } from 'react-router'
import { AssistantConversation } from './AssistantConversation'
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
 */
export function AssistantPanel({
  contextPath,
  contextLabel,
}: {
  contextPath?: string
  contextLabel?: string
}) {
  const label = contextLabel ?? contextPath

  return (
    <div className={styles.panel}>
      <AssistantConversation {...(label === undefined ? {} : { contextLabel: label })} />
      <p className={styles.link}>
        <Link to="/assistant">Open the Assistant as a full screen</Link>
      </p>
    </div>
  )
}
