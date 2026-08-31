import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Icon } from '../../ui/Icon'
import { DateTime, RecordId } from '../../ui/type'
import { useCustomerNow } from '../customers/clock'
import { portalDesk } from './data/portal-desk'
import { portalHref, usePortalIdentity } from './portal-session'
import styles from './Portal.module.css'

/**
 * `/portal` — the one screen that answers "am I covered, and does anything need
 * me?"
 *
 * The IA rule the whole portal is built on is visible here: counts on the
 * surface, reasons one tap in. This page carries four numbers, the next date
 * that matters, and the things waiting on the customer — and every one of those
 * things links to the screen that can actually resolve it. There is no policy
 * table, no claim history and no document list, because none of them answers the
 * question this screen exists to answer.
 *
 * The lime card at the top is the one thing being asked of the customer. U7
 * reserves lime for "needs a person", so it appears here and nowhere else on the
 * page: if a screen paints three things lime, none of them is the next thing.
 *
 * Nothing here computes money. The figures shown are dates and counts of records
 * that exist; a premium or a settlement is read on the record it belongs to,
 * through `<Money>`, exactly as it was typed.
 */
export function PortalOverviewScreen() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const now = useCustomerNow()
  const customerId = identity.customerId ?? ''

  const cover = useResource(
    () => desk.cover(customerId, now),
    `portal:cover:${customerId}:${now.toISOString().slice(0, 10)}`,
  )

  if (cover.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="55%" height="1.75rem" />
        <Skeleton height="7rem" />
        <Skeleton height="10rem" />
      </div>
    )
  }

  if (cover.status === 'error') {
    return (
      <EmptyState
        variant="error"
        title="Your cover could not be loaded"
        explanation={cover.error?.message ?? 'The request failed before anything was read.'}
        action={
          <Button variant="primary" onClick={() => cover.reload()}>
            Try again
          </Button>
        }
      />
    )
  }

  const view = cover.data
  if (view === null) {
    return (
      <EmptyState
        title="No customer answers to that address"
        explanation="This portal opens against one customer on the books. Choose again from the front page."
        action={
          <Button variant="primary" onClick={() => identity.forget()}>
            Choose whose portal to open
          </Button>
        }
      />
    )
  }

  const first = view.attention[0] ?? null
  const firstName = view.customer.fullName.split(' ')[0] ?? view.customer.fullName

  return (
    <>
      <div className={styles.screenHead}>
        <h1 className={styles.title}>Hello, {firstName}</h1>
        <p className={styles.lead}>
          {view.policiesHeld === 0
            ? 'Nothing is on your file yet.'
            : `Everything Jagad Insurance holds for you, as at ${dayText(now)}.`}
        </p>
      </div>

      {view.policiesHeld === 0 ? (
        <EmptyState
          title="No policies on your file yet"
          explanation="A policy appears here once Jagad Insurance has issued it against your name. If you have just bought one, it arrives after the insurer sends the document through."
        />
      ) : (
        <section className={styles.glance} aria-label="Your cover at a glance">
          <div className={styles.stat} data-tone={view.liveCover > 0 ? 'ok' : undefined}>
            <span className={styles.statValue}>{view.liveCover}</span>
            <span className={styles.statLabel}>
              {view.liveCover === 1 ? 'policy in force' : 'policies in force'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{view.policiesHeld}</span>
            <span className={styles.statLabel}>
              {view.policiesHeld === 1 ? 'policy on file' : 'policies on file'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{view.openClaims}</span>
            <span className={styles.statLabel}>
              {view.openClaims === 1 ? 'claim open' : 'claims open'}
            </span>
          </div>
          <div
            className={styles.stat}
            data-tone={
              view.attention.length > 0 ? 'attn' : view.policiesHeld > 0 ? 'ok' : undefined
            }
          >
            <span className={styles.statValue}>{view.attention.length}</span>
            <span className={styles.statLabel}>
              {view.attention.length === 1 ? 'thing needs you' : 'things need you'}
            </span>
          </div>
        </section>
      )}

      {first ? (
        <section className={`${styles.card} ${styles.nextUp}`} aria-label="The next thing to do">
          <p className={styles.nextUpKicker}>Next thing to do</p>
          <h2 className={styles.cardTitle}>{first.title}</h2>
          <p className={styles.attentionDetail}>{first.detail}</p>
          {first.path && first.actionLabel ? (
            <Link
              className={styles.disclosure}
              to={portalHref(first.path, identity.customerId)}
            >
              <Button variant="primary" iconEnd="chevron-right">
                {first.actionLabel}
              </Button>
            </Link>
          ) : null}
        </section>
      ) : view.policiesHeld > 0 ? (
        <p className={styles.allClear}>
          <Icon name="check" size="sm" />
          Nothing is waiting on you right now.
        </p>
      ) : null}

      {view.nextRenewal ? (
        <section className={styles.card} aria-label="What renews next">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Renews next</h2>
            <RecordId
              systemNo={view.nextRenewal.systemNo}
              insurerNo={view.nextRenewal.insurerNo}
            />
          </div>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>Cover</dt>
              <dd className={styles.factValue}>
                {view.nextRenewal.productName}, {view.nextRenewal.companyName}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>Ends on</dt>
              <dd className={styles.factValue}>
                <DateTime value={view.nextRenewal.expiryDate} mode="date" />
              </dd>
            </div>
            <div className={styles.fact}>
              <dt className={styles.factLabel}>That is</dt>
              <dd className={styles.factValue}>
                {view.nextRenewal.daysAway < 0
                  ? `${Math.abs(view.nextRenewal.daysAway)} days ago`
                  : view.nextRenewal.daysAway === 0
                    ? 'today'
                    : `in ${view.nextRenewal.daysAway} days`}
              </dd>
            </div>
          </dl>
          <p className={styles.note}>
            {view.nextRenewal.agencyIsOnIt
              ? 'Jagad Insurance has this renewal open and will be in touch before the end date.'
              : 'No renewal has been opened against this policy yet. Your agent can start one.'}
          </p>
          <Link
            className={styles.disclosure}
            to={portalHref('/portal/policies', identity.customerId)}
          >
            <Button variant="quiet" iconEnd="chevron-right">
              See this policy
            </Button>
          </Link>
        </section>
      ) : null}

      {view.attention.length > 1 ? (
        <section className={styles.card} aria-label="Everything waiting on you">
          <h2 className={styles.cardTitle}>Also waiting on you</h2>
          <ul className={styles.attentionList}>
            {view.attention.slice(1).map((item) => (
              <li key={item.key} className={styles.attentionItem}>
                <span className={styles.attentionTitle}>{item.title}</span>
                <span className={styles.attentionDetail}>{item.detail}</span>
                {item.path && item.actionLabel ? (
                  <Link to={portalHref(item.path, identity.customerId)}>{item.actionLabel}</Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

/** The day, in the words the rest of the portal uses. */
function dayText(now: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(now)
}

export default PortalOverviewScreen
