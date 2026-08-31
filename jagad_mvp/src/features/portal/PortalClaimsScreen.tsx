import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { DateTime, Money, RecordId } from '../../ui/type'
import { portalDesk } from './data/portal-desk'
import type { PortalClaimCard } from './data/portal-desk'
import { PORTAL_CLAIM_NEW_PATH, portalHref, usePortalIdentity } from './portal-session'
import { PORTAL_CLAIM_STEPS, claimProgress } from './portal-view'
import styles from './Portal.module.css'

/**
 * `/portal/claims` — where a claim has got to, in the claimant's language.
 *
 * The machine behind these records has thirteen states (§9) and the customer
 * sees four steps. That is not a simplification for its own sake: nine of those
 * states are about who inside the agency holds the file, and telling somebody
 * their claim is "picked up" or "docs collected" hands them vocabulary they then
 * have to translate before they can worry about it properly. Every word on this
 * page comes from `portal-view.ts`, where the translation is stated once and
 * tested.
 *
 * The step a claim is waiting on the customer for is lime, because U7 reserves
 * lime for exactly that. No diagnosis, no health declaration and no document
 * text appears here or anywhere in this feature.
 */
export function PortalClaimsScreen() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const customerId = identity.customerId ?? ''

  const loaded = useResource(() => desk.claims(customerId), `portal:claims:${customerId}`)

  const raiseLink = (
    <Link to={portalHref(PORTAL_CLAIM_NEW_PATH, identity.customerId)}>
      <Button variant="primary" icon="plus">
        Raise a claim
      </Button>
    </Link>
  )

  if (loaded.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="45%" height="1.75rem" />
        <Skeleton height="10rem" />
        <Skeleton height="10rem" />
      </div>
    )
  }

  if (loaded.status === 'error') {
    return (
      <EmptyState
        variant="error"
        title="Your claims could not be loaded"
        explanation={loaded.error?.message ?? 'The request failed before anything was read.'}
        action={
          <Button variant="primary" onClick={() => loaded.reload()}>
            Try again
          </Button>
        }
      />
    )
  }

  const cards = loaded.data ?? []

  return (
    <>
      <div className={styles.screenHead}>
        <h1 className={styles.title}>My claims</h1>
        <p className={styles.lead}>
          Where each of your claims has got to, and what — if anything — is waiting on you.
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="You have no claims"
          explanation="A claim appears here as soon as it is raised, whether you raise it yourself or ring your agent and they raise it for you."
          action={raiseLink}
        />
      ) : (
        <>
          <div className={styles.actions}>{raiseLink}</div>
          <ul className={styles.list}>
            {cards.map((card) => (
              <li key={card.claim.id}>
                <ClaimCard card={card} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ClaimCard({ card }: { card: PortalClaimCard }) {
  const { claim } = card
  const progress = claimProgress(claim.state)
  const settled = claim.settlement.amount

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{progress.label}</h2>
          <p className={styles.cardMeta}>
            {card.productName}, {card.companyName}
          </p>
        </div>
        <StatusPill tone={progress.tone}>
          {progress.waitingOnYou ? 'Needs you' : progress.label}
        </StatusPill>
      </div>

      <RecordId systemNo={claim.systemNo} insurerNo={claim.insurerNo} layout="stacked" />

      <p className={styles.attentionDetail}>{progress.detail}</p>

      {progress.stepIndex >= 0 ? (
        <ol className={styles.spine} aria-label="Progress">
          {PORTAL_CLAIM_STEPS.map((step, index) => (
            <li
              key={step.key}
              className={styles.step}
              data-reached={index <= progress.stepIndex}
              data-current={index === progress.stepIndex}
              data-waiting={index === progress.stepIndex && progress.waitingOnYou}
            >
              <span className={styles.stepDot} aria-hidden="true" />
              {step.label}
              {index === progress.stepIndex ? <span> &mdash; you are here</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {card.told ? (
        <section>
          <h3 className={styles.insideTitle}>What you told us</h3>
          <p className={styles.attentionDetail}>{card.told.description}</p>
          <p className={styles.note}>
            You said this happened on <DateTime value={card.told.incidentOn} mode="date" />. Your
            claims team will call you to take the details the insurer needs.
          </p>
        </section>
      ) : null}

      {card.outstanding.length > 0 ? (
        <section>
          <h3 className={styles.insideTitle}>Still to reach us</h3>
          <ul className={styles.benefits}>
            {card.outstanding.map((item) => (
              <li key={item} className={styles.benefit}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Policy</dt>
          <dd className={styles.factValue}>{card.policySystemNo}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Raised on</dt>
          <dd className={styles.factValue}>
            <DateTime value={claim.raisedAt} mode="date" />
          </dd>
        </div>
        {settled !== null ? (
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Settled amount</dt>
            <dd className={styles.factValue}>
              <Money paise={settled.paise} />
            </dd>
          </div>
        ) : null}
        {claim.settlement.deduction !== null ? (
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Deducted</dt>
            <dd className={styles.factValue}>
              <Money paise={claim.settlement.deduction.paise} />
            </dd>
          </div>
        ) : null}
      </dl>

      {settled !== null ? (
        <p className={styles.note}>
          These figures are exactly as your insurer advised them. Jagad Insurance does not calculate
          a settlement.
        </p>
      ) : null}
    </article>
  )
}

export default PortalClaimsScreen
