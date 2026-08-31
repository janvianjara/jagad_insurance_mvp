import { useState } from 'react'
import { Link } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { CLAIM_TYPES } from '../../domain/workflows'
import type { ClaimType } from '../../domain/workflows'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { DatePicker, Field, FileDrop, RadioGroup, Select, Textarea } from '../../ui/form'
import { RecordId } from '../../ui/type'
import { useCustomerNow } from '../customers/clock'
import { CLAIM_UPLOAD_DOC_TYPES } from '../upload'
import type { DocumentType } from '../../data/repo'
import { portalDesk } from './data/portal-desk'
import { portalHref, usePortalIdentity } from './portal-session'
import styles from './Portal.module.css'

/** What each accepted document is called on a customer's phone. */
const DOC_PROMPT: Readonly<Record<string, string>> = {
  discharge_summary: 'Hospital discharge summary',
  claim_form: 'Claim form',
}

/**
 * `/portal/claims/new` — user story 4.1, a claim raised by the person it
 * happened to.
 *
 * Four questions and no more: which cover, what kind of claim, when it happened,
 * and what happened. Everything else a claims desk needs — the checklist, the
 * insurer's reference, the settlement — arrives later from people who have it,
 * and asking for it here would be asking somebody in a hospital corridor to do
 * an operator's job.
 *
 * **The decision is the machine's, not this screen's.** §9 forks on whether the
 * policy is in force: an active one goes to `intimated`, an inactive one to
 * `blocked` with the sourcing agent told why. The portal calls the same
 * `claimDesk.intimate` the staff screen calls, so a customer raising a claim on
 * a lapsed policy gets the machine's own sentence and a real record, not a
 * greyed-out button and a phone number.
 *
 * **Submission is an outward mutation, so it goes through `<ConfirmGate>`** and
 * Cancel writes nothing. Attachments ride the product's own tokenised upload
 * mechanism (FR-11.1, D21) rather than a second path invented here: the claim is
 * raised, a one-off link is issued against it, and the chosen files are recorded
 * through that link — presence and file name only, never content.
 */
export function PortalClaimNewScreen() {
  const repositories = useRepositories()
  const desk = portalDesk(repositories)
  const identity = usePortalIdentity()
  const now = useCustomerNow()
  const customerId = identity.customerId ?? ''

  const loaded = useResource(
    () => desk.claimable(customerId, now),
    `portal:claimable:${customerId}`,
  )

  const [policyId, setPolicyId] = useState('')
  const [claimType, setClaimType] = useState<ClaimType>(CLAIM_TYPES.cashless)
  const [incidentOn, setIncidentOn] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<Readonly<Record<string, File | null>>>({})
  const [armed, setArmed] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  function forget() {
    setArmed(false)
    setProblem(null)
  }

  if (loaded.status === 'loading') {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="50%" height="1.75rem" />
        <Skeleton height="14rem" />
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

  const options = loaded.data ?? []
  const chosen = options.find((option) => option.policy.id === policyId) ?? null
  const said = description.trim()
  const ready = chosen !== null && incidentOn !== '' && said !== ''

  const changes: readonly ConfirmChange[] = chosen
    ? [
        { key: 'policy', label: 'Policy', to: `${chosen.policy.systemNo} — ${chosen.productName}` },
        {
          key: 'kind',
          label: 'Kind of claim',
          to: claimType === CLAIM_TYPES.cashless ? 'Cashless' : 'Paid by me, claiming it back',
        },
        { key: 'when', label: 'When it happened', to: incidentOn },
        { key: 'what', label: 'What you told us', to: said },
        {
          key: 'files',
          label: 'Documents attached',
          to:
            chosenFiles(attachments).length === 0
              ? 'None — we will ask if we need any'
              : chosenFiles(attachments)
                  .map(([, file]) => file.name)
                  .join(', '),
        },
        {
          key: 'outcome',
          label: 'What happens next',
          to: chosen.inForce
            ? 'Your claim is registered and goes to your insurer'
            : 'This cover is not in force, so nothing goes to the insurer and your agent is told',
        },
      ]
    : []

  async function commit() {
    if (!chosen) return

    // The actor is the customer, because the customer is who did this. The event
    // log has to be able to tell a claim somebody raised on their own phone from
    // one an operator raised for them.
    const outcome = await desk.intimate({
      actorId: customerId,
      policyId: chosen.policy.id,
      customerId,
      agentId: chosen.policy.agentId,
      claimType,
      policyActive: chosen.inForce,
      policyStatus: chosen.inForce ? 'in force' : 'not in force',
      // §9: blocking a claim notifies the sourcing agent as part of the same
      // move. There is no path here that blocks quietly.
      agentNotified: true,
      now,
    })

    if (!outcome.ok) {
      // The machine's own words. Nothing was written.
      setProblem(outcome.reason)
      setArmed(false)
      return
    }

    const claim = outcome.record
    await desk.rememberIncident({
      claimId: claim.id,
      incidentOn,
      description: said,
      toldAt: now.toISOString(),
    })

    // A blocked claim goes nowhere, so nothing is attached to it: the papers
    // stay with the customer until somebody has told them what to do instead.
    const offered = claim.state === 'blocked' ? [] : chosenFiles(attachments)
    const landed = await desk.attach({
      claimId: claim.id,
      actorId: customerId,
      // Name, type and size. This screen never reads a byte of a chosen file.
      files: offered.map(([docType, file]) => ({
        docType: docType as DocumentType,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
      now,
    })

    setReceipt({
      systemNo: claim.systemNo,
      blocked: claim.state === 'blocked',
      attached: landed.recorded,
      refused: landed.refused,
    })
    setArmed(false)
    setProblem(null)
    setAttachments({})
  }

  if (receipt) {
    return (
      <>
        <div className={styles.screenHead}>
          <h1 className={styles.title}>
            {receipt.blocked ? 'We could not register this claim' : 'Your claim is registered'}
          </h1>
        </div>

        <section className={styles.receipt} role="status">
          <p className={styles.footerTitle}>Quote this number when you call us</p>
          <p className={styles.reference}>{receipt.systemNo}</p>
          <p className={styles.footerText}>
            {receipt.blocked
              ? 'The cover you chose was not in force on the day you gave, so nothing has been sent to the insurer. Your agent has been told and will call you — the claim stays on your file so there is something to talk about.'
              : 'Your insurer has been told. Somebody from the Jagad Insurance claims team will pick this up and tell you what, if anything, they need from you.'}
          </p>
          {receipt.attached.length > 0 ? (
            <p className={styles.footerText}>
              We have recorded {receipt.attached.join(', ')} against this claim.
            </p>
          ) : null}
          {receipt.refused.length > 0 ? (
            <p className={styles.problem}>
              These could not be attached: {receipt.refused.join('; ')}
            </p>
          ) : null}
        </section>

        <div className={styles.actions}>
          <Link to={portalHref('/portal/claims', identity.customerId)}>
            <Button variant="primary" iconEnd="chevron-right">
              See my claims
            </Button>
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={styles.screenHead}>
        <h1 className={styles.title}>Raise a claim</h1>
        <p className={styles.lead}>
          Four questions. You do not need paperwork to start — we will ask for what we need once
          your claim is registered.
        </p>
      </div>

      {options.length === 0 ? (
        <EmptyState
          title="There is no policy to claim against"
          explanation="A claim is raised against a policy Jagad Insurance holds for you. Nothing on your file can carry one yet."
          action={
            <Link to={portalHref('/portal/policies', identity.customerId)}>
              <Button variant="primary">See my policies</Button>
            </Link>
          }
        />
      ) : (
        <section className={styles.card}>
          <div className={styles.form}>
            {problem ? (
              <p className={styles.problem} role="alert">
                {problem}
              </p>
            ) : null}

            <Field
              label="Which cover is this about"
              required
              hint="Every policy on your file is listed, in force or not. If the one you need is not in force we will tell you before anything is sent."
            >
              <Select
                options={options.map((option) => ({
                  value: option.policy.id,
                  label: `${option.policy.systemNo} — ${option.productName}${option.inForce ? '' : ' (not in force)'}`,
                }))}
                placeholder="Choose the policy"
                value={policyId}
                onChange={(event) => {
                  forget()
                  setPolicyId(event.target.value)
                }}
              />
            </Field>

            <Field label="What kind of claim is this" control="group" required>
              <RadioGroup
                name="portal-claim-type"
                value={claimType}
                options={[
                  {
                    value: CLAIM_TYPES.cashless,
                    label: 'Cashless',
                    description: 'The hospital is billing the insurer directly.',
                  },
                  {
                    value: CLAIM_TYPES.file,
                    label: 'I paid, and want it back',
                    description: 'You have paid and are claiming the money back.',
                  },
                ]}
                onValueChange={(value) => {
                  forget()
                  setClaimType(value === CLAIM_TYPES.file ? CLAIM_TYPES.file : CLAIM_TYPES.cashless)
                }}
              />
            </Field>

            <Field label="When did it happen" required>
              <DatePicker
                value={incidentOn}
                onChange={(event) => {
                  forget()
                  setIncidentOn(event.target.value)
                }}
              />
            </Field>

            <Field
              label="What happened"
              required
              hint="A few lines is plenty. Please do not put your Aadhaar number, a card number or a password in here."
            >
              <Textarea
                rows={5}
                value={description}
                onChange={(event) => {
                  forget()
                  setDescription(event.target.value)
                }}
              />
            </Field>

            {CLAIM_UPLOAD_DOC_TYPES.map((docType) => (
              <Field
                key={docType}
                label={DOC_PROMPT[docType] ?? docType}
                optional
                hint="You can send this later instead — we will text you a one-off link."
              >
                <FileDrop
                  prompt="Take a photo, or choose a file"
                  accept="image/*,application/pdf"
                  files={attachments[docType] ? [attachments[docType] as File] : []}
                  onFiles={(files) => {
                    forget()
                    setAttachments((held) => ({ ...held, [docType]: files[0] ?? null }))
                  }}
                />
              </Field>
            ))}

            <div className={styles.actions}>
              <Button
                variant="primary"
                icon="check"
                fullWidth
                disabled={!ready}
                onClick={() => setArmed(true)}
              >
                Review and send
              </Button>
              <Link to={portalHref('/portal/claims', identity.customerId)}>
                <Button variant="quiet" fullWidth>
                  Cancel
                </Button>
              </Link>
            </div>

            {armed && chosen ? (
              <ConfirmGate
                title={`Raise a claim on ${chosen.policy.systemNo}`}
                changes={changes}
                note="Nothing is recorded if you go back. Sending gives you a claim number straight away."
                confirmLabel="Yes, raise it"
                cancelLabel="Go back and change something"
                receipt="Sent. Your claim number is below."
                onCancel={() => setArmed(false)}
                onConfirm={() => void commit()}
              />
            ) : null}

            {chosen ? (
              <p className={styles.note}>
                Claiming against <RecordId systemNo={chosen.policy.systemNo} showInsurer={false} />{' '}
                with {chosen.companyName}.
              </p>
            ) : null}
          </div>
        </section>
      )}
    </>
  )
}

type Receipt = {
  readonly systemNo: string
  readonly blocked: boolean
  readonly attached: readonly string[]
  readonly refused: readonly string[]
}

/** The attachments a person actually chose, as `[docType, file]` pairs. */
function chosenFiles(held: Readonly<Record<string, File | null>>): readonly [string, File][] {
  return Object.entries(held).filter((entry): entry is [string, File] => entry[1] !== null)
}

export default PortalClaimNewScreen
