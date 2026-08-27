import { useState } from 'react'
import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { KYC_CONSENT_STATES, kycMachine } from '../../domain/workflows'
import type { KycContext } from '../../domain/workflows'
import { useResource } from '../../lib/useResource'
import { ChecklistPanel } from '../../components/ChecklistPanel'
import { ConsentBadge } from '../../components/ConsentBadge'
import { MaskedField } from '../../components/MaskedField'
import { ConfirmGate, OcrField, OcrFormProvider, OcrSubmit } from '../../components/guardrails'
import type { ConfirmChange, OcrFieldState } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { DateTime, KeyValueList } from '../../ui/type'
import { customerDesk } from '../customers/data/customer-desk'
import { useCustomerNow } from '../customers/clock'
import { KYC_LABEL, KYC_TONE } from '../customers/customer-view'
import { loadKycChecklist } from './checklist-source'
import {
  checklistFor,
  extractionsFor,
  kycCommandFor,
  unconfirmedExtractions,
} from './kyc-view'
import styles from './KycFile.module.css'

export type KycFileProps = {
  customerId: string
}

/**
 * The KYC file — plan §5 "KYC queue + detail", §9's KYC and consent machine,
 * canvas 3.1 and 3.2.
 *
 * Everything on this screen is one of the four §9 bullets made operable:
 *
 *   - the checklist comes from the product's `DocChecklist`, and the completeness
 *     gate below it is the machine's own guards. A blocked Complete shows the
 *     sentence the transition would have refused with, never "action failed";
 *   - every extracted value renders through `<OcrField>`, and the form holding
 *     them cannot submit while one is unconfirmed. Editing withdraws confirmation
 *     and the original read is kept;
 *   - Aadhaar renders through `<MaskedField>`, which slices to four digits by
 *     construction. There is no control on this screen that reveals more, and no
 *     value in this component that holds more;
 *   - completing fires the credentials recipe. There is no button for it: the
 *     credentials event is on the same machine edge as the completion, so a
 *     completion that skipped it would have to be a completion that never
 *     happened.
 */
export function KycFile({ customerId }: KycFileProps) {
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const toaster = useToaster()
  const now = useCustomerNow()
  const user = useSessionStore((state) => state.user)

  /** Bumped after every write, so the file re-reads rather than holding a stale copy. */
  const [revision, setRevision] = useState(0)
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState<Readonly<Record<string, OcrFieldState>>>({})
  const [issuedToken, setIssuedToken] = useState<string | null>(null)

  const file = useResource(async () => {
    const dossier = await desk.dossier(customerId)
    if (!dossier) return null
    const [source, users] = await Promise.all([
      loadKycChecklist(repositories, dossier),
      repositories.config.users(),
    ])
    return { dossier, source, users }
  }, `kyc:${customerId}:${revision}`)

  if (!user || (file.isLoading && !file.data)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="40%" height="1.5rem" />
        <Skeleton width="100%" height="12rem" />
      </div>
    )
  }

  if (!file.data) {
    return <p className={styles.missing}>No customer answers to {customerId}.</p>
  }

  const { dossier, source } = file.data
  const { customer, consent } = dossier
  const mayAct = can(user, 'edit', 'backOffice') || can(user, 'edit', 'customers')

  const checklist = checklistFor(dossier, source.checklist, source.label)
  const extractions = extractionsFor(dossier)
  const pending = unconfirmedExtractions(extractions)
  const confirmed = extractions.filter((extraction) => extraction.confirmed)

  const command = kycCommandFor({
    dossier,
    checklist,
    extractions,
    actorId: user.id,
    route: 'staff',
    now,
  })

  // The machine, asked before anything is written — so the screen never offers a
  // move it is about to refuse, and the refusal it shows is the machine's own.
  const context: KycContext = {
    now,
    route: command.route,
    requiredDocuments: command.requiredDocuments,
    presentDocuments: command.presentDocuments,
    extractedFields: command.extractedFields,
    ...(command.aadhaarLast4 === undefined ? {} : { aadhaarLast4: command.aadhaarLast4 }),
  }
  const verdict = kycMachine.canTransition(
    customer.kycState,
    KYC_CONSENT_STATES.complete,
    context,
  )

  function markReceived(item: string) {
    if (!user) return
    desk.recordReceipt(customerId, {
      item,
      recordedAt: now.toISOString(),
      actorId: user.id,
      viaConsentLink: false,
    })
    setRevision((value) => value + 1)
    toaster.notify({ title: `${item} recorded as received`, tone: 'ok' })
  }

  function saveReviews() {
    if (!user) return
    for (const state of Object.values(reviewDraft)) {
      desk.recordReview(customerId, {
        name: state.name,
        value: state.value,
        extracted: state.extracted,
        confirmed: state.confirmed,
        reviewedAt: now.toISOString(),
        actorId: user.id,
      })
    }
    setReviewDraft({})
    setRevision((value) => value + 1)
    toaster.notify({
      title: 'Extracted values confirmed',
      detail: 'The original read is kept against each one.',
      tone: 'ok',
    })
  }

  async function sendConsentLink() {
    if (!user) return
    const outcome = await desk.issueConsentLink(customerId, { actorId: user.id, now })
    setArmed(null)
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was sent', detail: outcome.reason, tone: 'bad' })
      return
    }
    setRefusal(null)
    setIssuedToken(outcome.record.token)
    setRevision((value) => value + 1)
    toaster.notify({
      title: 'Consent link sent',
      detail: `Login-free and expiring. It carries no session, so opening it signs nobody in.`,
      tone: 'ok',
    })
  }

  async function complete() {
    const outcome = await desk.completeKyc(customerId, command)
    setArmed(null)
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      toaster.notify({ title: 'KYC was not completed', detail: outcome.reason, tone: 'bad' })
      return
    }
    setRefusal(null)
    setRevision((value) => value + 1)
    // The recipe fired inside the transition; this is the receipt for it.
    toaster.notify({ title: 'KYC complete', detail: outcome.note, tone: 'ok' })
  }

  const completionChanges: readonly ConfirmChange[] = [
    {
      key: 'state',
      label: 'KYC',
      from: KYC_LABEL[customer.kycState],
      to: KYC_LABEL.complete,
    },
    { key: 'credentials', label: 'Portal credentials', to: 'Generated and sent automatically' },
    { key: 'message', label: 'Customer message', to: 'Username sent on the configured channel' },
  ]

  const linkToken = issuedToken ?? consent?.token ?? null

  return (
    <div className={styles.file} data-kyc-file={customerId}>
      <Panel
        title="Where this stands"
        description="The state, the consent link and the four digits of Aadhaar this platform is allowed to hold."
      >
        <div className={styles.standing}>
          <StatusPill tone={KYC_TONE[customer.kycState]}>{KYC_LABEL[customer.kycState]}</StatusPill>
          <ConsentBadge
            state={customer.consentState}
            now={now}
            expiresAt={consent?.expiresAt ?? null}
            submittedAt={consent?.submittedAt ?? null}
            showNote
          />
        </div>

        <div className={styles.identity}>
          <MaskedField
            label="Aadhaar"
            last4={customer.aadhaarLast4}
            note="The last four digits are the whole record. The full number is never stored, shown or exported."
          />
          <MaskedField label="PAN" value={customer.panNumber} kind="pan" />
          <MaskedField
            label="Bank account"
            value={customer.bankAccountNumber}
            kind="account"
            absentText="none on file"
          />
        </div>
      </Panel>

      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}

      <Panel
        title="Documents required"
        description="From the product's checklist in configuration. Presence only — this list never holds a word of what a document says."
      >
        <ChecklistPanel
          items={checklist.items}
          source={checklist.source}
          renderAction={(item) =>
            item.state === 'outstanding' && mayAct ? (
              <Button size="sm" variant="quiet" onClick={() => markReceived(item.label)}>
                Record received
              </Button>
            ) : null
          }
        />
      </Panel>

      {pending.length > 0 ? (
        <Panel
          title="Extracted values — confirm each one"
          description="Read off the documents by the extractor. Nothing here is on the record until a person says so, and the form cannot be saved while one is outstanding."
        >
          <OcrFormProvider onSubmit={saveReviews}>
            {pending.map((extraction) => (
              <OcrField
                key={extraction.name}
                name={extraction.name}
                label={extraction.label}
                extraction={extraction.extraction}
                disabled={!mayAct}
                hint={
                  extraction.name === 'aadhaarLast4'
                    ? 'Masked at extraction. Four digits is everything the extractor passed on, and everything this platform will hold.'
                    : `Read from ${extraction.documentLabel}.`
                }
                onChange={(state) =>
                  setReviewDraft((draft) => ({ ...draft, [state.name]: state }))
                }
              />
            ))}
            <OcrSubmit disabled={!mayAct}>Save the confirmed values</OcrSubmit>
          </OcrFormProvider>
        </Panel>
      ) : null}

      {confirmed.length > 0 ? (
        <Panel title="Confirmed values" level={3}>
          <KeyValueList
            items={confirmed.map((extraction) => ({
              key: extraction.name,
              label: extraction.label,
              value:
                extraction.name === 'aadhaarLast4' ? (
                  <MaskedField label="On record" last4={extraction.value} />
                ) : (
                  extraction.value
                ),
            }))}
            columns={2}
          />
        </Panel>
      ) : null}

      <Panel
        title="Consent link"
        description="A login-free, expiring web page the customer opens on their phone. It carries no session and grants no portal access."
        actions={
          mayAct ? (
            <Button
              variant="quiet"
              icon="msg"
              onClick={() => {
                setRefusal(null)
                setArmed('consent')
              }}
            >
              {customer.consentState === 'not_sent' ? 'Send the consent link' : 'Send a fresh link'}
            </Button>
          ) : null
        }
      >
        {linkToken ? (
          <p className={styles.link}>
            <Link to={`/consent/${linkToken}`}>Open the customer's page</Link>
            <span className={styles.token}>{linkToken}</span>
            {consent ? (
              <span className={styles.expiry}>
                Expires <DateTime value={consent.expiresAt} mode="datetime" />
              </span>
            ) : null}
          </p>
        ) : (
          <p className={styles.none}>
            No link has been sent. KYC can still be completed at the desk, but the customer's own
            declaration only arrives through the link.
          </p>
        )}

        {armed === 'consent' ? (
          <ConfirmGate
            title="Send the consent link"
            changes={[
              {
                key: 'link',
                label: 'Consent link',
                from: customer.consentState === 'not_sent' ? 'None sent' : 'A link is already out',
                to: `A fresh expiring link on ${consent?.channel ?? 'whatsapp'}`,
              },
              { key: 'to', label: 'Sent to', to: `${customer.fullName} · ${customer.mobile}` },
            ]}
            note="Sending replaces any link already out: the old token stops working. The page asks the customer for their own details and consent, and signs nobody in."
            confirmLabel="Send it"
            receipt="Sent. The customer has it on their phone."
            onCancel={() => setArmed(null)}
            onConfirm={() => void sendConsentLink()}
          />
        ) : null}
      </Panel>

      <Panel
        title="Complete KYC"
        description="Completion is a machine transition. It fires the credentials recipe on the same edge, so there is nothing here to press twice."
      >
        {customer.kycState === 'complete' ? (
          <p className={styles.done}>
            <Icon name="check" size="sm" />
            KYC is complete. Portal credentials were issued automatically when it completed.
          </p>
        ) : (
          <>
            <Button
              variant="primary"
              icon="check"
              disabled={!mayAct || !verdict.ok}
              aria-describedby={verdict.ok ? undefined : 'kyc-blocked'}
              onClick={() => {
                setRefusal(null)
                setArmed('complete')
              }}
            >
              Complete KYC
            </Button>
            {verdict.ok ? null : (
              <p className={styles.blocked} id="kyc-blocked">
                {verdict.reason}
              </p>
            )}

            {armed === 'complete' ? (
              <ConfirmGate
                title="Complete this KYC"
                changes={completionChanges}
                note="The customer is messaged with their username as part of this move. There is no separate step, and no way to complete without it."
                confirmLabel="Complete and issue credentials"
                receipt="Complete. The credentials recipe has run."
                onCancel={() => setArmed(null)}
                onConfirm={() => void complete()}
              />
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}
