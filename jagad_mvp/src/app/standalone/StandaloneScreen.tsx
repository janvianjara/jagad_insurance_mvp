import { useParams } from 'react-router'
import { BrandMark } from '../../ui/BrandMark'
import { EmptyState } from '../../ui/data'
import styles from './StandaloneScreen.module.css'

/**
 * Every screen that renders OUTSIDE the authenticated shell.
 *
 * Plan §11.1 is explicit about two of them: `/consent/:token` and
 * `/upload/:token` are tokenised, expiring and login-free, and they "must not
 * import the app shell, the permission store, or anything assuming a user".
 * This module obeys that literally — it reaches for `src/ui` and the route
 * params and nothing else, so the whole authenticated bundle stays on the other
 * side of a dynamic import. Login and the customer portal (a separate shell per
 * D-I) share it for the same reason.
 *
 * If a later step makes one of these screens real, it replaces this component
 * and inherits the same constraint, which is why the constraint is written here
 * rather than in a comment on the router.
 */
export type StandaloneScreenProps = {
  title: string
  explanation: string
  /** Named when the screen is reached by an expiring token, so it can be shown. */
  tokenParam?: string
}

export default function StandaloneScreen({ title, explanation, tokenParam }: StandaloneScreenProps) {
  const params = useParams()
  const token = tokenParam ? params[tokenParam] : undefined

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <BrandMark size="md" />
        <EmptyState variant="empty" icon="lock" title={title} explanation={explanation} />
        {token ? (
          <p className={styles.token}>
            <span className={styles.tokenLabel}>Link</span>
            <span className={styles.tokenValue}>{token}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
