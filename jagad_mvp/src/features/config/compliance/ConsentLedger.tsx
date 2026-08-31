/**
 * Consent, as it stands across the book.
 *
 * The state of every consent link and where each customer's KYC has got to,
 * counted, plus the roster of links that need somebody — a link that expired
 * before it was used, and a KYC that cannot complete until one is sent.
 *
 * Read-only, and that is the design. A consent record moves only through
 * `consentMachine`, from the customer's own screen or the login-free page; a
 * configuration screen that could flip a state would be a configuration screen
 * that can manufacture a consent nobody gave. What an admin configures about
 * consent is the retention class its record falls under, which is the next
 * section.
 *
 * No token is rendered anywhere here. The link is tokenised, expiring,
 * login-free and session-free by design (§11.1, D21); a page that lists tokens
 * hands them out.
 */

import { FormSection } from '../../../ui/form'
import { StatusPill } from '../../../ui/signal'
import { DateTime } from '../../../ui/type'
import { CONSENT_STATES, KYC_CONSENT_STATES } from '../../../domain/workflows'
import type { ConsentState, KycConsentState } from '../../../domain/workflows'
import type { Tone } from '../../../ui/tone'
import { customerName, useComplianceStore } from './compliance-store'
import layout from '../shared/config-layout.module.css'
import styles from './compliance.module.css'

const CONSENT_LABELS: Readonly<Record<ConsentState, string>> = {
  not_sent: 'No link sent',
  link_issued: 'Link out, waiting on the customer',
  submitted: 'Consent given',
  expired: 'Link expired unused',
}

const CONSENT_TONES: Readonly<Record<ConsentState, Tone>> = {
  not_sent: 'idle',
  link_issued: 'warn',
  submitted: 'ok',
  expired: 'attn',
}

const KYC_LABELS: Readonly<Record<KycConsentState, string>> = {
  pending: 'Nothing on file yet',
  partial: 'Half done',
  complete: 'Complete',
}

const KYC_TONES: Readonly<Record<KycConsentState, Tone>> = {
  pending: 'idle',
  partial: 'attn',
  complete: 'ok',
}

/** A state somebody has to act on, rather than one that is simply waiting. */
const NEEDS_A_PERSON: readonly ConsentState[] = [CONSENT_STATES.expired, CONSENT_STATES.notSent]

export function ConsentLedger() {
  const customers = useComplianceStore((state) => state.customers)
  const consents = useComplianceStore((state) => state.consents)

  const consentCounts = Object.values(CONSENT_STATES).map((state) => ({
    state,
    count: customers.filter((customer) => customer.consentState === state).length,
  }))

  const kycCounts = Object.values(KYC_CONSENT_STATES).map((state) => ({
    state,
    count: customers.filter((customer) => customer.kycState === state).length,
  }))

  // A link out or spent is a record with a story; the roster is what is left
  // over — the ones nobody has followed up.
  const waiting = consents.filter(
    (record) =>
      record.state === CONSENT_STATES.expired || record.state === CONSENT_STATES.linkIssued,
  )

  return (
    <div className={styles.panels}>
      <FormSection
        title="Consent across the book"
        description="Where every customer's consent link has got to. The link itself is tokenised, expiring and login-free, and its token is never shown on a staff screen."
      >
        <ul className={styles.states} aria-label="Consent states">
          {consentCounts.map(({ state, count }) => (
            <li
              className={styles.state}
              key={state}
              data-consent-state={state}
              data-attention={count > 0 && NEEDS_A_PERSON.includes(state) ? '' : undefined}
            >
              <StatusPill tone={CONSENT_TONES[state]} size="sm">
                {CONSENT_LABELS[state]}
              </StatusPill>
              <span className={layout.mono}>{`${count} customers`}</span>
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection
        title="KYC"
        description="Consent is one of the two routes a half-finished KYC completes by; the other is a member of staff. Both land on the same state."
      >
        <ul className={styles.states} aria-label="KYC states">
          {kycCounts.map(({ state, count }) => (
            <li className={styles.state} key={state} data-kyc-state={state}>
              <StatusPill tone={KYC_TONES[state]} size="sm">
                {KYC_LABELS[state]}
              </StatusPill>
              <span className={layout.mono}>{`${count} customers`}</span>
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection
        title="Links nobody has come back on"
        description="Every link that is out or that ran out. Sending a new one is done from the customer's own screen, where the machine that issues it lives."
      >
        {waiting.length === 0 ? (
          <p className={styles.hint}>No link is outstanding. Nothing is waiting on a customer.</p>
        ) : (
          <ul className={styles.states} aria-label="Outstanding consent links">
            {waiting.map((record) => (
              <li
                className={styles.state}
                key={record.id}
                data-consent-record={record.id}
                data-attention={record.state === CONSENT_STATES.expired ? '' : undefined}
              >
                <span>{customerName(customers, record.customerId)}</span>
                <span className={layout.mono}>
                  {record.state === CONSENT_STATES.expired ? 'Expired ' : 'Expires '}
                  <DateTime value={record.expiresAt} mode="datetime" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </div>
  )
}
