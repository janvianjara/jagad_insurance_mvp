import { useState } from 'react'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import {
  POLICY_ENTRY_PATHS,
  POLICY_STATES,
  REFUSAL_CODES,
  policyMachine,
} from '../../domain/workflows'
import type { KycState, PolicyContext } from '../../domain/workflows'
import type { Money as MoneyValue } from '../../domain/money'
import type { Policy, PolicyEntryDraft, Product } from '../../data/repo'
import {
  ConfirmGate,
  OcrField,
  OcrFormProvider,
  OcrSubmit,
  parseAmountDraft,
} from '../../components/guardrails'
import type { ConfirmChange, OcrFieldState } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Field, FileDrop } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { KeyValueList, Money, RecordId } from '../../ui/type'
import { ISSUANCE_FIELDS, ISSUE_BLOCKERS, TYPED_PREMIUM_SOURCES } from './entry-types'
import type { IssuanceReview, IssueBlocker, TypedPremiumSource } from './entry-types'
import { extractIssuance, extractorNote } from './ocr-extract'
import { POLICY_LABEL, POLICY_TONE } from './policy-view'
import type { IssuePolicyInput, PolicyDesk } from './data/policy-desk'
import styles from './IssuancePanel.module.css'

export type IssuancePanelProps = {
  policy: Policy
  /** The entry, which is where the path lives. Null reads as the ordinary proposal path. */
  draft: PolicyEntryDraft | null
  /** The proposer's KYC, from the customer record. One of §9's two gates reads it. */
  kycState: KycState
  /** What the policy was entered on, so the wrong document can be recognised as wrong. */
  product?: Product | null
  desk: PolicyDesk
  /** Pinned by the tests and by the walkthrough clock; the wall clock otherwise. */
  now?: Date
  /** Told after every committed move, so a parent screen can re-read its copy. */
  onChanged?: (policy: Policy) => void
  className?: string
}

/**
 * Issuance — canvas 3.6: "Company issues policy · PDF uploaded · OCR fills;
 * staff confirm; both numbers stored; customer messaged."
 *
 * The panel is four acts in one column, and the order is the argument: a
 * document arrives, a person reads what the extractor made of it, the person
 * confirms, and only then is there anything to issue with. Nothing further down
 * this file can be reached by skipping something above it.
 *
 *   **The document.** `<FileDrop>` hands over a `File` and the panel takes its
 *   name and its size. It never opens it. The bytes are not read, not held in
 *   state and not passed to the desk, because document text is classified (§14)
 *   and the cheapest way to keep it away from the Assistant is to never have it.
 *
 *   **The reading.** Every extracted value is an `<OcrField>` inside an
 *   `<OcrFormProvider>`, so the form cannot submit while one is unconfirmed —
 *   and the panel's own submit handler refuses again on the same fact, because
 *   the provider guards the form while the panel is what writes. Each verdict
 *   goes to `desk.recordReview` with the original read kept beside it.
 *
 *   **The gates.** §9 puts two on issue: KYC complete, and a non-empty Final
 *   Premium, with the components staying optional. Neither is implemented here.
 *   The panel builds the machine's own `PolicyContext` and asks
 *   `policyMachine.canTransition` what it thinks, prints the refusal it gets
 *   back word for word, and then — this is the part that matters — still lets
 *   the person press Issue when a command can be built at all. The verdict on
 *   screen is a warning about a fact that may have changed in another tab since
 *   this screen loaded; the authority is the machine at the moment of the write,
 *   and that answer comes back through `desk.issue`. The one thing the panel
 *   will not do is press ahead without a Final Premium, because there is then no
 *   command to send: `IssuePolicyCommand.finalPremium` is required, and the only
 *   way to satisfy it would be to invent a figure, which is the whole of what D3
 *   forbids.
 *
 *   **The moves.** Which control appears is decided by asking the machine about
 *   each edge rather than by reading the state off the record. A policy on the
 *   proposal path gets "Raise the proposal", because that is the move §9 allows
 *   from `draft`; a directly entered policy — one the insurer has already issued
 *   — gets Issue, and the sentence explaining the difference is `directEntryPath`'s
 *   own, printed where the person is standing.
 *
 * Both numbers are stored on the way through: `systemNo` was there from entry,
 * `insurerNo` comes off the confirmed reading, and both render through
 * `<RecordId>` so nobody has to guess which number the insurer will recognise.
 * The customer message is not a button — §9 puts `message.sent` on the issue
 * edge, and `desk.issue` records what actually went out. The feedback request
 * has no template configured in M0, so the receipt says it is stubbed instead of
 * claiming something was sent.
 */
export function IssuancePanel({
  policy,
  draft,
  kycState,
  product = null,
  desk,
  now,
  onChanged,
  className,
}: IssuancePanelProps) {
  const user = useSessionStore((state) => state.user)
  const toaster = useToaster()

  /** Our own last write. The panel is the only thing changing this record while it is open. */
  const [written, setWritten] = useState<Policy | null>(null)
  const [attached, setAttached] = useState<AttachedFile | null>(null)
  /** Verdicts as a person makes them, before the form is saved. Never read for a value. */
  const [pending, setPending] = useState<IssuanceReview>({})
  /** Verdicts once recorded. Only these are allowed to reach a command. */
  const [review, setReview] = useState<IssuanceReview | null>(null)
  const [reviewBlock, setReviewBlock] = useState<string | null>(null)
  const [armed, setArmed] = useState<Move | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [issuance, setIssuance] = useState<IssuanceReceipt | null>(null)

  if (!user) {
    return <p className={styles.missing}>Nobody is signed in, so nothing can be issued.</p>
  }

  const record = written && written.id === policy.id ? written : policy
  const mayAct = can(user, 'edit', 'policies')
  const at = now ?? new Date()

  // Mirrors the adapter's own default: a policy with no entry draft walked the
  // ordinary path, because a direct entry is always a deliberate act and always
  // writes one.
  const entryPath = draft?.entryPath ?? POLICY_ENTRY_PATHS.proposal

  const extractions = attached === null ? [] : extractIssuance(record, product)

  /** A reading is a value only once a person has vouched for it. */
  const readingOf = (name: string): string | null => {
    const verdict = review?.[name]
    return verdict && verdict.confirmed ? verdict.value : null
  }

  const readInsurerNo = readingOf(ISSUANCE_FIELDS.insurerNo)
  const readStartDate = readingOf(ISSUANCE_FIELDS.startDate)
  const readExpiryDate = readingOf(ISSUANCE_FIELDS.expiryDate)
  const readPremium = readingOf(ISSUANCE_FIELDS.finalPremium)

  // The one translation the panel performs, and the same one the typed control
  // performs: text a person confirmed, into integer paise. Nothing else in this
  // file turns anything into an amount.
  const premiumFromDocument = readPremium === null ? null : parseAmountDraft(readPremium)
  const finalPremium: MoneyValue | null = premiumFromDocument ?? record.finalPremium
  const finalPremiumSource: TypedPremiumSource =
    premiumFromDocument === null ? TYPED_PREMIUM_SOURCES.typed : TYPED_PREMIUM_SOURCES.insurerAdvice

  const insurerNo = readInsurerNo ?? record.insurerNo

  const context: PolicyContext = {
    now: at,
    entryPath,
    kycState,
    ...(finalPremium === null ? {} : { finalPremium }),
    finalPremiumSource,
    retentionClass: record.retentionClass,
  }

  // Three questions to the machine, so the panel never offers a move that is not
  // on the §9 adjacency map and never invents a reason of its own.
  const raiseVerdict = policyMachine.canTransition(record.status, POLICY_STATES.proposal, context)
  const sendVerdict = policyMachine.canTransition(record.status, POLICY_STATES.sent, context)
  const issueVerdict = policyMachine.canTransition(record.status, POLICY_STATES.issued, context)

  // `guard_blocked` means the edge exists and a fact is missing; the other codes
  // mean there is no such edge from here at all.
  const issueGuarded = !issueVerdict.ok && issueVerdict.code === REFUSAL_CODES.guardBlocked
  const issueOffered =
    issueVerdict.ok || (issueGuarded && !raiseVerdict.ok && !sendVerdict.ok)

  const outstanding = extractions.filter((field) => !pending[field.name]?.confirmed).length
  const blockers = blockersFor({
    kycState,
    finalPremium,
    outstanding: review === null ? outstanding : 0,
  })

  const command: IssuePolicyInput | null =
    finalPremium === null
      ? null
      : {
          actorId: user.id,
          finalPremium,
          finalPremiumSource,
          ...(insurerNo === null ? {} : { insurerNo }),
          ...(readStartDate === null ? {} : { startDate: readStartDate }),
          ...(readExpiryDate === null ? {} : { expiryDate: readExpiryDate }),
          ...(now === undefined ? {} : { now }),
        }

  function attach(files: File[]) {
    const [file] = files
    if (!file || !user) return

    // Name and size. The file itself is not read here or anywhere downstream.
    const reference = { fileName: file.name, sizeBytes: file.size }
    setAttached(reference)
    setPending({})
    setReview(null)
    setReviewBlock(null)
    setRefusal(null)

    desk.attachFile({
      policyId: record.id,
      ...reference,
      uploadedBy: user.id,
      uploadedAt: at.toISOString(),
    })

    toaster.notify({
      title: 'Policy document attached',
      detail: 'Its name and size are recorded. Nothing reads what it says.',
      tone: 'ok',
    })
  }

  /**
   * Records the verdicts.
   *
   * `<OcrFormProvider>` has already refused an unconfirmed form by the time this
   * runs, and this checks again anyway: the provider guards the form, but the
   * panel is what writes, and a write should refuse on its own account rather
   * than on the good behaviour of the component around it.
   */
  function saveReview() {
    if (!user) return

    const verdicts = extractions
      .map((field) => pending[field.name])
      .filter((state): state is OcrFieldState => state !== undefined)

    if (verdicts.length < extractions.length || verdicts.some((state) => !state.confirmed)) {
      setReviewBlock(waitingMessage(extractions.length - verdicts.filter((v) => v.confirmed).length))
      return
    }

    const recorded: Record<string, OcrFieldState> = {}
    for (const state of verdicts) {
      recorded[state.name] = state
      desk.recordReview({
        policyId: record.id,
        name: state.name,
        value: state.value,
        extracted: state.extracted,
        confirmed: state.confirmed,
        reviewedAt: at.toISOString(),
        actorId: user.id,
      })
    }

    setReview(recorded)
    setReviewBlock(null)
    toaster.notify({
      title: 'Extracted values confirmed',
      detail: 'What the document said is kept beside what goes on the record.',
      tone: 'ok',
    })
  }

  function commit(result: { ok: true; record: Policy } | { ok: false; reason: string }, done: string) {
    setArmed(null)
    if (!result.ok) {
      setRefusal(result.reason)
      toaster.notify({ title: 'Nothing changed', detail: result.reason, tone: 'bad' })
      return
    }
    setRefusal(null)
    setWritten(result.record)
    onChanged?.(result.record)
    toaster.notify({ title: done, tone: 'ok' })
  }

  async function raiseProposal() {
    if (!user) return
    const result = await desk.raiseProposal(record.id, user.id, now)
    commit(result, 'Proposal raised')
  }

  async function sendProposal() {
    if (!user) return
    const result = await desk.sendProposal(record.id, user.id, now)
    commit(result, 'Proposal sent to the insurer')
  }

  async function issuePolicy() {
    if (!command) return

    const outcome = await desk.issue(record.id, command)
    setArmed(null)

    if (!outcome.ok) {
      // The machine's sentence, unedited. It is the only account of the refusal
      // this screen gives, because a second wording would be a second rule.
      setRefusal(outcome.reason)
      toaster.notify({ title: 'The policy was not issued', detail: outcome.reason, tone: 'bad' })
      return
    }

    setRefusal(null)
    setWritten(outcome.policy)
    setIssuance({ note: outcome.note, feedbackSent: outcome.feedback !== null })
    onChanged?.(outcome.policy)
    toaster.notify({ title: 'Policy live', detail: outcome.note, tone: 'ok' })
  }

  const issueChanges: readonly ConfirmChange[] = [
    { key: 'status', label: 'Policy', from: POLICY_LABEL[record.status], to: POLICY_LABEL.issued },
    { key: 'systemNo', label: 'Our reference', to: record.systemNo },
    {
      key: 'insurerNo',
      label: 'Insurer policy number',
      from: record.insurerNo ?? 'awaited',
      to: insurerNo ?? 'still awaited',
    },
    {
      key: 'finalPremium',
      label: 'Final premium',
      from: <Money paise={record.finalPremium?.paise ?? null} />,
      to: <Money paise={finalPremium?.paise ?? null} />,
    },
    { key: 'message', label: 'Customer', to: 'Messaged on the configured channel' },
  ]

  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')} data-issuance={record.id}>
      <Panel
        title="This policy"
        description="Both numbers, always. The insurer's arrives with their document and is awaited until it does."
      >
        <div className={styles.standing}>
          <RecordId systemNo={record.systemNo} insurerNo={record.insurerNo} layout="stacked" />
          <StatusPill tone={POLICY_TONE[record.status]}>{POLICY_LABEL[record.status]}</StatusPill>
        </div>
      </Panel>

      <Panel
        title="The insurer's policy document"
        description="The name and the size are recorded against the policy. What the document says is never stored, never exported and never reaches the Assistant."
      >
        <Field
          label="Policy document (PDF)"
          control="group"
          hint="Dropping it here runs the extractor in front of you. Nothing it reads is on the record until you confirm it."
          disabled={!mayAct}
        >
          <FileDrop
            accept="application/pdf"
            prompt="Drop the policy PDF here"
            disabled={!mayAct}
            onFiles={attach}
          />
        </Field>

        {attached ? (
          <p className={styles.attached}>
            <Icon name="doc" size="sm" />
            <span className={styles.fileName}>{attached.fileName}</span>
            <span className={styles.fileSize}>{attached.sizeBytes} bytes</span>
          </p>
        ) : null}
      </Panel>

      {attached ? (
        <Panel
          title="What the document says — confirm each value"
          description="Read by the extractor, vouched for by a person. Editing a value withdraws the confirmation, and the original read is kept either way."
        >
          {extractions.length === 0 ? (
            <p className={styles.note}>{extractorNote(record, product)}</p>
          ) : review === null ? (
            <OcrFormProvider onSubmit={saveReview}>
              {extractions.map((field) => (
                <OcrField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  extraction={field.extraction}
                  disabled={!mayAct}
                  hint={
                    field.name === ISSUANCE_FIELDS.finalPremium
                      ? 'The figure printed on the schedule. It becomes an amount only when you confirm it, and the platform never works one out.'
                      : undefined
                  }
                  onChange={(state) => setPending((draftReview) => ({ ...draftReview, [state.name]: state }))}
                />
              ))}
              {reviewBlock ? (
                <p className={styles.blocked} role="alert">
                  {reviewBlock}
                </p>
              ) : null}
              <OcrSubmit disabled={!mayAct}>Record these confirmations</OcrSubmit>
            </OcrFormProvider>
          ) : (
            <>
              <KeyValueList
                columns={2}
                items={extractions.map((field) => ({
                  key: field.name,
                  label: field.label,
                  value: <span className={styles.reading}>{review[field.name]?.value ?? ''}</span>,
                }))}
              />
              <p className={styles.note}>{extractorNote(record, product)}</p>
            </>
          )}
        </Panel>
      ) : null}

      <Panel
        title="Next move"
        description="Only the moves the machine allows from where this policy stands, and the machine's own words for the ones it does not."
      >
        {record.status === POLICY_STATES.issued ? (
          <div className={styles.receipt}>
            <p className={styles.live}>
              <Icon name="check" size="sm" />
              Policy live
            </p>
            <RecordId systemNo={record.systemNo} insurerNo={record.insurerNo} layout="stacked" />
            {issuance ? (
              <>
                <p className={styles.note}>{issuance.note}</p>
                <p className={styles.stub}>
                  <Icon name="alert" size="sm" />
                  {issuance.feedbackSent ? FEEDBACK_SENT : FEEDBACK_STUBBED}
                </p>
              </>
            ) : (
              <p className={styles.note}>
                This policy was already live when the screen opened, so there is nothing here to
                send again.
              </p>
            )}
          </div>
        ) : (
          <div className={styles.moves}>
            {blockers.length > 0 ? (
              <ul className={styles.blockers}>
                {blockers.map((blocker) => (
                  <li key={blocker.key} className={styles.blocker} data-blocker={blocker.key}>
                    <Icon name="alert" size="sm" />
                    {blocker.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {raiseVerdict.ok ? (
              <>
                <Button
                  variant="primary"
                  icon="doc"
                  disabled={!mayAct}
                  onClick={() => void raiseProposal()}
                >
                  Raise the proposal
                </Button>
                {issueVerdict.ok ? null : (
                  <p className={styles.blocked}>{issueVerdict.reason}</p>
                )}
              </>
            ) : null}

            {sendVerdict.ok ? (
              <>
                <Button
                  variant="primary"
                  icon="msg"
                  disabled={!mayAct}
                  onClick={() => {
                    setRefusal(null)
                    setArmed(MOVES.send)
                  }}
                >
                  Send the proposal to the insurer
                </Button>
                {armed === MOVES.send ? (
                  <ConfirmGate
                    title="Send this proposal"
                    changes={[
                      { key: 'status', label: 'Proposal', from: 'Raised', to: 'Sent' },
                      { key: 'message', label: 'Notification', to: 'Goes out as part of this move' },
                    ]}
                    note="The message is on the machine's own edge, so there is no separate send and no way to send twice."
                    confirmLabel="Send it"
                    receipt="Sent. The insurer has the proposal."
                    onCancel={() => setArmed(null)}
                    onConfirm={() => void sendProposal()}
                  />
                ) : null}
              </>
            ) : null}

            {issueOffered ? (
              <>
                <Button
                  variant="primary"
                  icon="check"
                  disabled={!mayAct || command === null}
                  aria-describedby={issueVerdict.ok ? undefined : 'issue-blocked'}
                  onClick={() => {
                    setRefusal(null)
                    setArmed(MOVES.issue)
                  }}
                >
                  Issue this policy
                </Button>

                {issueVerdict.ok ? null : (
                  <p className={styles.blocked} id="issue-blocked">
                    {issueVerdict.reason}
                  </p>
                )}

                {armed === MOVES.issue ? (
                  <ConfirmGate
                    title="Issue this policy"
                    changes={issueChanges}
                    note="The customer is messaged by the recipe on this edge; there is no separate notify step. The feedback request is stubbed in M0 and the receipt will say so."
                    confirmLabel="Issue it"
                    receipt="Issued. The policy is live."
                    onCancel={() => setArmed(null)}
                    onConfirm={() => void issuePolicy()}
                  />
                ) : null}
              </>
            ) : null}

            {refusal ? (
              <p className={styles.refusal} role="alert">
                <Icon name="alert" size="sm" />
                {refusal}
              </p>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* --------------------------------------------------------------- the details */

/** Name and size, which is the whole of what this feature keeps about a document. */
type AttachedFile = {
  readonly fileName: string
  readonly sizeBytes: number
}

/** What `desk.issue` gave back, kept so the screen can say what actually happened. */
type IssuanceReceipt = {
  readonly note: string
  readonly feedbackSent: boolean
}

const MOVES = { send: 'send', issue: 'issue' } as const
type Move = (typeof MOVES)[keyof typeof MOVES]

const FEEDBACK_SENT = 'The feedback request went out on the same move.'

/**
 * FR-19 in M0, said plainly. The fixtures configure a `policy.issued` template
 * and no `policy.feedback` one, and a screen that printed "feedback requested"
 * anyway would be the first place this product told somebody something untrue.
 */
const FEEDBACK_STUBBED =
  'The feedback request is stubbed. No policy.feedback template is configured, so nothing was sent to the customer; the request goes out for real when the template exists.'

function waitingMessage(count: number): string {
  const noun = count === 1 ? 'value is' : 'values are'
  return `${count} extracted ${noun} still waiting on a person. Nothing was recorded.`
}

/**
 * What is standing in the way, shown before anybody presses anything.
 *
 * This is a courtesy, not a rule: every sentence here is about a fact the panel
 * can see, and the machine is what decides whether the move happens. The two
 * agree because they read the same facts, and where they disagree the machine
 * wins — which is why the refusal printed beside the control is always the
 * machine's own and never one of these.
 */
function blockersFor(input: {
  kycState: KycState
  finalPremium: MoneyValue | null
  outstanding: number
}): readonly IssueBlocker[] {
  const blockers: IssueBlocker[] = []

  if (input.kycState !== 'complete') {
    blockers.push({
      key: ISSUE_BLOCKERS.kyc,
      message: `KYC is ${input.kycState} for the proposer. It is completed on the customer's KYC file, and the policy cannot be issued until it is.`,
    })
  }

  if (input.finalPremium === null) {
    blockers.push({
      key: ISSUE_BLOCKERS.finalPremium,
      message:
        'No Final Premium is on the record. It is read off the insurer document and confirmed by a person; the platform will not work one out.',
    })
  }

  if (input.outstanding > 0) {
    blockers.push({
      key: ISSUE_BLOCKERS.unconfirmedExtraction,
      message: waitingMessage(input.outstanding),
    })
  }

  return blockers
}
