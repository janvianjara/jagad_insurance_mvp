import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { PortalGrievance } from './PortalGrievance'
import { PortalIdentityPicker } from './PortalIdentityPicker'
import { PORTAL_NAV, portalHref, usePortalIdentity } from './portal-session'
import styles from './Portal.module.css'

/**
 * The customer portal's shell — plan §11.1 and decision D-I.
 *
 * This is a shell of its own, not the staff shell with items hidden, and the
 * difference is structural rather than cosmetic. It imports no
 * `components/AppShell`, no `app/store`, no permission evaluator; it is reached
 * through a dynamic import so it is a chunk of its own; and
 * `portal-isolation.test.ts` walks this module's whole runtime import graph and
 * fails if any of them ever appear. A customer surface that could reach the
 * session store would eventually read it.
 *
 * What replaces the rail is four links and a footer. That is the whole
 * navigation, and it is deliberately as short as it is: a customer has four
 * questions — am I covered, what do I hold, where are my papers, what is
 * happening with my claim — and every screen behind those links answers exactly
 * one of them.
 *
 * Mobile first. The header is sticky because on a phone it is the only way back;
 * the nav scrolls horizontally rather than wrapping, because a nav that changes
 * height when the page changes moves the content under a person's thumb.
 */
export function PortalShell() {
  const repositories = useRepositories()
  const identity = usePortalIdentity()
  const customerId = identity.customerId

  const who = useResource(
    async () => (customerId === null ? null : repositories.customers.get(customerId)),
    `portal:who:${customerId ?? 'none'}`,
  )

  if (customerId === null) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <PortalIdentityPicker />
        </main>
        <PortalFooter customerId={null} onSwitch={null} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerTop}>
            <p className={styles.wordmark}>Jagad Insurance</p>
            <div className={styles.who}>
              <span className={styles.whoName}>
                {who.status === 'loading' ? 'Opening your portal' : (who.data?.fullName ?? 'Unknown')}
              </span>
              <button type="button" className={styles.switch} onClick={() => identity.forget()}>
                Not you?
              </button>
            </div>
          </div>
          <p className={styles.demoNote}>
            Preview: this identity was chosen, not signed in to. You are seeing only this
            customer&rsquo;s records.
          </p>
        </div>

        <nav className={styles.nav} aria-label="Your portal">
          {PORTAL_NAV.map((item) => (
            <NavLink
              key={item.path}
              className={styles.navLink}
              to={portalHref(item.path, customerId)}
              end={item.path === '/portal'}
            >
              <Icon name={item.icon} size="sm" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        {who.status === 'error' ? (
          <EmptyState
            variant="error"
            title="Your portal could not be opened"
            explanation={who.error?.message ?? 'The request failed before anything was read.'}
            action={
              <Button variant="primary" onClick={() => who.reload()}>
                Try again
              </Button>
            }
          />
        ) : who.status === 'ready' && who.data === null ? (
          <EmptyState
            title="No customer answers to that address"
            explanation="The identity in this link is not a customer on the books. Choose again to open a portal."
            action={
              <Button variant="primary" onClick={() => identity.forget()}>
                Choose whose portal to open
              </Button>
            }
          />
        ) : (
          <Suspense
            fallback={
              <div className={styles.loading} aria-busy="true">
                <Skeleton width="60%" height="1.5rem" />
                <Skeleton height="8rem" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        )}
      </main>

      <PortalFooter customerId={customerId} onSwitch={() => identity.forget()} />
    </div>
  )
}

/**
 * The footer carries the two things §12 asks a customer-facing surface to make
 * reachable: a grievance channel, and a plain statement of what is held about
 * them and what will never be asked for on this page.
 */
function PortalFooter({
  customerId,
  onSwitch,
}: {
  customerId: string | null
  onSwitch: (() => void) | null
}) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <h2 className={styles.footerTitle}>Something wrong, or a question about your data?</h2>
        <p className={styles.footerText}>
          You can raise a grievance here and you will be given a reference to quote. Under the
          Digital Personal Data Protection Act you may also ask what personal data Jagad Insurance
          holds about you, ask for it to be corrected, and withdraw a consent you gave.
        </p>
        <div className={styles.footerActions}>
          <PortalGrievance customerId={customerId} />
          {onSwitch ? (
            <Button variant="quiet" icon="users" onClick={onSwitch}>
              Open a different portal
            </Button>
          ) : null}
        </div>
        <p className={styles.note}>
          Jagad Insurance will never ask for a password, a one-time code or your full Aadhaar number
          on this page. Identity numbers are shown here as the last four digits only.
        </p>
      </div>
    </footer>
  )
}

export default PortalShell
