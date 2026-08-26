import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { can } from '../domain/permissions'
import type { Action, Resource } from '../domain/permissions'
import { EmptyState } from '../ui/data'
import { PageHeader } from '../components/AppShell/PageHeader'
import { landingFor } from './navigation'
import { useSessionStore } from './store'
import styles from './RequireAccess.module.css'

/**
 * The route guard — the same `can()` the rail is rendered from (plan §7).
 *
 * A refused route does not redirect. It says what was refused and offers the way
 * back, because a silent bounce to the home screen leaves someone who followed a
 * link from a colleague with no idea whether the record is missing or their
 * account is narrower than they thought.
 */
export function RequireAccess({
  resource,
  action = 'view',
  children,
}: {
  resource: Resource
  action?: Action
  children: ReactNode
}) {
  const user = useSessionStore((state) => state.user)

  // The shell holds its children back until the session is hydrated, so a null
  // user here means the tree was mounted without one. Refuse rather than assume.
  if (!user) return null

  if (!can(user, action, resource)) {
    return (
      <>
        <PageHeader title="Not available to this account" />
        <div className={styles.body}>
          <EmptyState
            variant="error"
            icon="lock"
            title={`${user.name} cannot ${action} ${resource}`}
            explanation={`This account holds the "${user.template.label}" permission template, which does not grant it. An administrator changes that on the users screen; nothing here is hidden by mistake.`}
            action={<Link to={landingFor(user)}>Back to your work</Link>}
          />
        </div>
      </>
    )
  }

  return children
}
