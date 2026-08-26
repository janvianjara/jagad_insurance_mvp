import { Link } from 'react-router'
import { EmptyState } from '../../ui/data'
import type { DrawerTarget } from '../../app/store'
import styles from './AssistantDrawerPlaceholder.module.css'

/**
 * What Cmd/Ctrl-K opens until P-09 fills the panel in.
 *
 * The keyboard route, the drawer and the record context it carries are shell
 * concerns and land here; the briefing, the block renderer and the Ask cards are
 * the Assistant feature's, and it reads its data through the `AssistantView`
 * projection rather than through anything this file can see.
 */
export function AssistantDrawerPlaceholder({ target }: { target: DrawerTarget }) {
  return (
    <div className={styles.body}>
      <EmptyState
        variant="empty"
        icon="spark"
        title="The Assistant panel arrives with step P-09"
        explanation="The shortcut, the panel and the record it carries as context already work. The briefing, the suggestion chips and the Ask cards are built by P-09, over the Assistant projection."
      />
      {target.contextPath ? (
        <dl className={styles.context}>
          <dt className={styles.term}>Context</dt>
          <dd className={styles.value}>{target.contextLabel ?? target.contextPath}</dd>
        </dl>
      ) : null}
      <p className={styles.link}>
        <Link to="/assistant">Open the Assistant as a full screen</Link>
      </p>
    </div>
  )
}
