import { useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { RollUp } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { DateTime, Money, RecordId } from '../../ui/type'
import { useCustomerNow } from '../customers/clock'
import { DOC_TYPE_LABEL } from '../documents/document-view'
import { portalDesk } from './data/portal-desk'
import type { PortalPolicyCard } from './data/portal-desk'
import { usePortalIdentity } from './portal-session'
import { policyStatusFor } from './portal-view'
import styles from './Portal.module.css'

/** The search parameter that names the open card. See the note on `openId`. */
const OPEN_PARAM = 'policy'

/**
 * `/portal/policies` — the customer's own cover.
 *
 * **Cards, not a table.** A data table is an operator's instrument: it earns its
 * columns when somebody scans forty rows looking for an outlier. A customer has
 * three policies and one question about each of them, and on a 360-pixel screen
 * a table is a horizontal scrollbar with a person's insurance inside it. So each
 * policy is a card, and the card carries what somebody would ring up to ask.
 *
 * **Expanding card rather than a drawer or a nested page.** A drawer over a
 * phone is a full-screen overlay with no room for the list it came from, and a
 * nested route costs a page transition and the reader's place in the list. The
 * detail is short — dates, agent, premium, what is covered — so it opens under
 * the card that was tapped, with the list still above it.
 *
 * The card that is open is named in the URL (`?policy=`), so the state is
 * addressable and survives a refresh — the same rule §7 puts on a queue view,
 * applied to the one bit of view state this screen owns.
 */
export function PortalPoliciesScreen() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const now = useCustomerNow()
  const [params, setParams] = useSearchParams()
  const customerId = identity.customerId ?? ''

  const loaded = useResource(() => desk.policies(customerId), `portal:policies:${customerId}`)
  const openId = params.get(OPEN_PARAM)

  function toggle(policyId: string) {
    const next = new URLSearchParams(params)
    if (openId === policyId) next.delete(OPEN_PARAM)
    else next.set(OPEN_PARAM, policyId)
    setParams(next, { replace: true })
  }

  if (loaded.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="45%" height="1.75rem" />
        <Skeleton height="9rem" />
        <Skeleton height="9rem" />
      </div>
    )
  }

  if (loaded.status === 'error') {
    return (
      <EmptyState
        variant="error"
        title="Your policies could not be loaded"
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
        <h1 className={styles.title}>My policies</h1>
        <p className={styles.lead}>
          Every policy Jagad Insurance holds against your name. Tap one to see when it ends, who
          your agent is and what it covers.
        </p>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="No policies on your file"
          explanation="A policy appears here once Jagad Insurance has entered it against your name and the insurer has issued it. A quotation you are still considering does not appear here."
        />
      ) : (
        <ul className={styles.list}>
          {cards.map((card) => (
            <li key={card.policy.id}>
              <PolicyCard
                card={card}
                now={now}
                open={openId === card.policy.id}
                onToggle={() => toggle(card.policy.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function PolicyCard({
  card,
  now,
  open,
  onToggle,
}: {
  card: PortalPolicyCard
  now: Date
  open: boolean
  onToggle: () => void
}) {
  const { policy } = card
  const status = policyStatusFor(policy, now)
  const panelId = `policy-inside-${policy.id}`

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{card.productName}</h2>
          <p className={styles.cardMeta}>{card.companyName}</p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>

      <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} layout="stacked" />

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Cover period</dt>
          <dd className={styles.factValue}>
            <DateTime value={policy.startDate} mode="date" absentText="not recorded" />
            {' to '}
            <DateTime value={policy.expiryDate} mode="date" absentText="not recorded" />
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Sum insured</dt>
          <dd className={styles.factValue}>
            <Money paise={policy.sumInsured?.paise ?? null} absentText="not recorded" />
          </dd>
        </div>
      </dl>

      <Button
        className={styles.disclosure}
        variant="quiet"
        iconEnd={open ? 'chevron-down' : 'chevron-right'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {open ? 'Hide the details' : 'See the details'}
      </Button>

      {open ? (
        <div className={styles.inside} id={panelId}>
          <section>
            <h3 className={styles.insideTitle}>Who looks after this</h3>
            <p className={styles.factValue}>
              {card.agent === null
                ? 'No agent is named on this policy. Call the Jagad Insurance office and quote the policy number above.'
                : `${card.agent.name} — ${card.agent.mobile}`}
            </p>
          </section>

          <section>
            <h3 className={styles.insideTitle}>What you paid</h3>
            {policy.netPremium !== null && policy.gstAmount !== null ? (
              <RollUp
                components={[
                  { key: 'premium', label: 'Premium', amount: policy.netPremium },
                ]}
                gst={policy.gstAmount}
                netLabel="Premium before tax"
                finalLabel="Total"
                note="These figures are recorded exactly as your insurer issued them. The total is the two lines above added together, and nothing here is worked out by Jagad Insurance."
              />
            ) : (
              <p className={styles.factValue}>
                <Money
                  paise={policy.finalPremium?.paise ?? null}
                  absentText="No premium has been recorded against this policy yet."
                />
              </p>
            )}
          </section>

          <section>
            <h3 className={styles.insideTitle}>What is covered</h3>
            {card.benefits.length === 0 ? (
              <p className={styles.note}>
                The benefit sheet for this product is not on the platform, so nothing can be listed
                here. Your policy document is the authority, and it is under My documents.
              </p>
            ) : (
              <ul className={styles.benefits}>
                {card.benefits.map((benefit) => (
                  <li key={benefit.key} className={styles.benefit}>
                    <span>{benefit.label}</span>
                    <span className={styles.benefitValue}>{benefit.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className={styles.insideTitle}>Papers on this policy</h3>
            {card.documents.length === 0 ? (
              <p className={styles.note}>Nothing has been filed against this policy yet.</p>
            ) : (
              <ul className={styles.benefits}>
                {card.documents.map((document) => (
                  <li key={document.id} className={styles.benefit}>
                    <span>{DOC_TYPE_LABEL[document.docType]}</span>
                    <span className={styles.benefitValue}>
                      {document.isPresent ? 'On file' : 'Still to reach us'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {card.renewal ? (
            <p className={styles.note}>
              A renewal is open on this policy and is due on{' '}
              <DateTime value={card.renewal.dueOn} mode="date" />.
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default PortalPoliciesScreen
