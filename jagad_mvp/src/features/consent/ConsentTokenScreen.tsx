import { useState } from 'react'
import { useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { SEED_FORM_SCHEMAS, resolveFormSchema } from '../../domain/forms'
import type { FormValues } from '../../domain/forms'
import { SchemaForm } from '../../components/SchemaForm'
import type { MasterOptions, SchemaFormSubmission } from '../../components/SchemaForm'
import { ConfirmGate } from '../../components/guardrails'
import { BrandMark } from '../../ui/BrandMark'
import { EmptyState } from '../../ui/data'
import { DateTime } from '../../ui/type'
import { useCustomerNow } from '../customers/clock'
import { actorFor, customerDesk } from '../customers/data/customer-desk'
import type { ConsentInvite, CustomerDossier } from '../customers/data/customer-desk'
// Imported from the modules themselves rather than from `../kyc`: that barrel
// re-exports `<KycFile>`, which reads the session store, and pulling it in here
// would put the authenticated shell back inside this chunk. See the note below.
import { loadKycChecklist } from '../kyc/checklist-source'
import {
  aadhaarLast4Of,
  checklistFor,
  extractionsFor,
  itemsSuppliedByConsent,
  kycCommandFor,
} from '../kyc/kyc-view'
import styles from './ConsentPage.module.css'

/**
 * `/consent/:token` — plan §11.1's login-free customer surface, §9's second
 * route to a complete KYC, canvas 3.1.
 *
 * **This page carries no session, and that is structural rather than
 * aspirational.** It is registered outside the shell layout, it is reached
 * through a dynamic import so it is a chunk of its own, and it imports no app
 * shell, no session store and no permission evaluator — `consent-isolation.test.ts`
 * walks this module's whole runtime import graph and fails if any of them
 * appear. The customer opens a link from a WhatsApp message on their phone;
 * nothing about that should require an account, and nothing here creates one.
 *
 * The form is the configured KYC schema, resolved through `resolveFormSchema`
 * exactly as a staff screen would resolve it. That matters more than it looks:
 * what the customer is asked is what an admin configured, so the fields on their
 * phone and the fields at the desk cannot drift apart — and the schema asks for
 * four digits of Aadhaar with nowhere to put the other eight.
 *
 * Three states, three pages. A live link shows the form; an expired one gets a
 * page of its own that says what to do rather than an error; a link already used
 * says thank you rather than offering the form again.
 */
export default function ConsentTokenScreen() {
  const { token = '' } = useParams()
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const now = useCustomerNow()

  const [submitted, setSubmitted] = useState<{ kycCompleted: boolean } | null>(null)
  const [expiredOnSubmit, setExpiredOnSubmit] = useState(false)
  const [pending, setPending] = useState<SchemaFormSubmission | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const loaded = useResource(async () => {
    const invite = await desk.consentByToken(token, now)
    if (!invite) return null

    const dossier = await desk.dossier(invite.customerId)
    if (!dossier) return null

    const [source, masterTypes] = await Promise.all([
      loadKycChecklist(repositories, dossier),
      repositories.config.masterTypes(),
    ])

    const optionSets = await Promise.all(
      masterTypes.map(async (type) => {
        const values = await repositories.config.masterValues(type.key)
        return [
          type.id,
          values.filter((value) => value.active).map((value) => ({ value: value.key, label: value.label })),
        ] as const
      }),
    )

    return {
      invite,
      dossier,
      source,
      masterOptions: Object.fromEntries(optionSets) as MasterOptions,
    }
  }, `consent:${token}`)

  const schema = resolveFormSchema(SEED_FORM_SCHEMAS, { objectKey: 'kyc' })

  if (loaded.isLoading && !loaded.data) {
    return (
      <ConsentShell>
        <p className={styles.loading} aria-busy="true">
          Opening your form.
        </p>
      </ConsentShell>
    )
  }

  if (!loaded.data || !schema) {
    return (
      <ConsentShell>
        <EmptyState
          variant="error"
          icon="lock"
          title="This link is not one we recognise"
          explanation="Check the message it arrived in, or ask Jagad Insurance to send you a fresh one. Nothing about your record has changed."
        />
      </ConsentShell>
    )
  }

  const { invite, dossier, source, masterOptions } = loaded.data

  // Order matters: a link that has already been used says thank you, even if the
  // window has since closed. Telling somebody their link expired after they
  // filled it in would be true and useless.
  if (submitted || invite.alreadySubmitted) {
    return (
      <ConsentShell>
        <EmptyState
          variant="done"
          title={`Thank you, ${invite.greetingName}`}
          explanation={
            submitted?.kycCompleted
              ? 'Your details and your consent are recorded, and your file is complete. Your login details are on their way to you on the same number this link arrived on.'
              : 'Your details and your consent are recorded. Jagad Insurance will be in touch if anything else is needed.'
          }
        />
      </ConsentShell>
    )
  }

  if (expiredOnSubmit || invite.expired) {
    return <ConsentExpiredPage invite={invite} />
  }

  const checklist = checklistFor(dossier, source.checklist, source.label)

  async function commit(submission: SchemaFormSubmission) {
    const supplied = itemsSuppliedByConsent(checklist, submission.values as Record<string, unknown>)

    const outcome = await desk.submitConsent(
      token,
      {
        schemaId: submission.schemaId,
        schemaVersion: submission.schemaVersion,
        values: submission.values as Record<string, unknown>,
        supplied,
      },
      {
        now,
        // Built from the file as it stands after the submission has landed, so
        // the guards see the documents the customer just supplied.
        kycCommand: (file: CustomerDossier) =>
          kycCommandFor({
            dossier: file,
            checklist: checklistFor(file, source.checklist, source.label),
            extractions: extractionsFor(file),
            actorId: actorFor(invite.customerId),
            route: 'consent_link',
            now,
          }),
      },
    )

    setPending(null)

    if (!outcome.ok) {
      if (outcome.expired) {
        setExpiredOnSubmit(true)
        return
      }
      setProblem(outcome.reason)
      return
    }

    setProblem(null)
    setSubmitted({ kycCompleted: outcome.kycCompleted })
  }

  return (
    <ConsentShell>
      <div className={styles.intro}>
        <h1 className={styles.title}>Namaste {invite.greetingName}</h1>
        <p className={styles.lead}>
          Jagad Insurance needs a few details to finish your file. This page is only for you, it
          closes on <DateTime value={invite.expiresAt} mode="date" />, and it does not sign you in
          to anything.
        </p>
        <p className={styles.privacy}>
          We ask for the last four digits of your Aadhaar and no more. The full number is never
          stored, shown or sent anywhere.
        </p>
      </div>

      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {pending ? (
        <ConfirmGate
          title="Send these to Jagad Insurance"
          changes={previewOf(pending.values)}
          note="Sending records your consent against your file. Nothing is sent if you go back."
          confirmLabel="Yes, send them"
          cancelLabel="Go back and change something"
          receipt="Sent. Thank you."
          onCancel={() => setPending(null)}
          onConfirm={() => void commit(pending)}
        />
      ) : (
        <SchemaForm
          schema={schema}
          entityId={token}
          masterOptions={masterOptions}
          submitLabel="Review and send"
          initialValues={initialValuesFor(dossier, now)}
          onSubmit={(submission) => setPending(submission)}
        />
      )}
    </ConsentShell>
  )
}

/**
 * The page frame. Mobile first: one column, generous targets, no chrome — there
 * is no navigation to offer somebody who is not signed in.
 */
function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <BrandMark size="md" />
        {children}
        <p className={styles.footer}>
          Jagad Insurance will never ask for a password, a one-time code or your full Aadhaar
          number on this page.
        </p>
      </div>
    </main>
  )
}

function ConsentExpiredPage({ invite }: { invite: ConsentInvite }) {
  return (
    <ConsentShell>
      <EmptyState
        variant="empty"
        icon="clock"
        title="This link has expired"
        explanation={`Links close after a few days so they cannot be reused. Reply to the message it came in and Jagad Insurance will send you a fresh one — nothing you have already given is lost.`}
      />
      <p className={styles.expiredAt}>
        It closed on <DateTime value={invite.expiresAt} mode="datetime" />.
      </p>
    </ConsentShell>
  )
}

/* --------------------------------------------------------------- small parts */

/**
 * What the customer already told the agency, offered back for confirmation.
 *
 * Prefilling is not the same as assuming: every one of these is editable and
 * every required one still has to be present for the form to submit. The channel
 * is fixed because this page IS the channel.
 */
function initialValuesFor(dossier: CustomerDossier, now: Date): FormValues {
  const { customer } = dossier
  // Sliced on the way in, not trusted: the field is four characters wide, but a
  // prefilled value never passes through `maxLength`, so the width alone would
  // not be a guarantee. `aadhaarLast4Of` is the one place that decision is made.
  const last4 = aadhaarLast4Of(customer.aadhaarLast4)
  return {
    ...(customer.dateOfBirth === null ? {} : { dateOfBirth: customer.dateOfBirth }),
    ...(customer.addressLine === null ? {} : { addressLine: customer.addressLine }),
    ...(customer.pincode === null ? {} : { pincode: customer.pincode }),
    ...(customer.panNumber === null ? {} : { panNumber: customer.panNumber }),
    ...(last4 === null ? {} : { aadhaarLast4: last4 }),
    consentChannel: 'consent-link',
    consentRecordedOn: now.toISOString().slice(0, 10),
  }
}

/**
 * The gate's preview.
 *
 * Says what is about to be sent without printing it back: the customer typed it
 * a moment ago, and a page that repeats an identifier in full is a page that has
 * that identifier in its DOM. The Aadhaar line says how many digits, not which.
 */
function previewOf(values: FormValues) {
  const filled = (key: string) => {
    const value = values[key]
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'string' ? value.trim() !== '' : Boolean(value)
  }

  return [
    { key: 'consent', label: 'Your consent', to: 'Given, and recorded against your file' },
    {
      key: 'identity',
      label: 'Aadhaar',
      to: filled('aadhaarLast4') ? 'Last four digits only' : 'Not given',
    },
    { key: 'pan', label: 'PAN', to: filled('panNumber') ? 'Recorded' : 'Not given' },
    { key: 'address', label: 'Address', to: filled('addressLine') ? 'Recorded' : 'Not given' },
    {
      key: 'proofs',
      label: 'Documents',
      to: [
        filled('identityProofFile') ? 'identity proof' : null,
        filled('addressProofFile') ? 'address proof' : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' and ') || 'None attached',
    },
  ]
}
