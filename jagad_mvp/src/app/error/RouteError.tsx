import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import styles from './RouteError.module.css'

/**
 * What a screen shows when it throws.
 *
 * Plan section 6 lists "error + suspense boundaries" as part of `src/app`, and
 * they were never built - so until now ANY render error anywhere blanked the
 * whole product. A white screen tells the person nothing, tells the developer
 * nothing, and looks identical whether the cause is a missing record or a typo.
 *
 * The rail stays mounted because this renders inside the shell's outlet, so a
 * screen that fails does not cost the person their navigation.
 */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const isResponse = isRouteErrorResponse(error)
  const title = isResponse ? `${error.status} ${error.statusText}` : 'This screen stopped'
  const message = isResponse
    ? String(error.data ?? '')
    : error instanceof Error
      ? error.message
      : String(error)
  const stack = !isResponse && error instanceof Error ? error.stack : undefined

  return (
    <div className={styles.panel} role="alert">
      <Icon name="alert" size="xl" className={styles.mark} />
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>
        Something on this screen failed while it was rendering. Nothing was saved and no record was
        changed. The rest of the application is still working, so you can go back or try again.
      </p>

      {message ? (
        <div className={styles.detail}>
          <span className={styles.detailLabel}>What went wrong</span>
          <p className={styles.message}>{message}</p>
          {/* The stack is for whoever is building this, and it is the whole reason
              a blank screen was worse than useless. Dev only. */}
          {import.meta.env.DEV && stack ? <pre className={styles.stack}>{stack}</pre> : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button onClick={() => navigate(-1)}>Go back</Button>
        <Button variant="quiet" onClick={() => window.location.reload()}>
          Reload this screen
        </Button>
      </div>
    </div>
  )
}

export default RouteError
