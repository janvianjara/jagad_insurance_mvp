/**
 * The payment fork — plan §9 "Payment & collection", FR-10.4, canvas 3.3 to 3.5.
 *
 *   fork ─┬─ direct_to_company → reference recorded (no agency books)
 *         └─ via_agency → recorded → verified (back office)
 *                           └─ cheque → bounced → follow-up task, collection reopens
 *
 * Three decisions carry this screen, and each of them is a refusal to be helpful.
 *
 *   **The fork is a question, never a default.** A pending collection row already
 *   carries the route the customer said they would use, and it would be easy to
 *   pre-select it. It is not pre-selected. Where the money went is the single
 *   fact this screen exists to establish — a payment made straight to the insurer
 *   never touches the agency books, and one taken by the agency sits on them
 *   until the back office verifies it. A pre-ticked radio is a guess about which
 *   set of books is about to be wrong.
 *
 *   **The machine is asked before anything is offered.** Every sentence this
 *   screen shows in refusal is `collectionMachine`'s own, rendered verbatim: the
 *   missing reference, the untyped amount, the bank reason, the follow-up task.
 *   The screen never composes a second wording for a rule it does not own, and
 *   never disables a control silently — a person who cannot proceed is told which
 *   rule stopped them and what would satisfy it. `canIssueReceipt()` is here for
 *   the same reason: the platform's refusal to issue a receipt is a sentence the
 *   workflow already owns, so this file renders it rather than paraphrasing it.
 *
 *   **A cheque is watched, out loud, in lime.** Lime means a person still has to
 *   do something, which is exactly the state a cheque leaves a collection in: the
 *   money is recorded but not yet honoured. Marking it bounced raises the
 *   follow-up task on the same move — not because this screen remembers to, but
 *   because the guard refuses the transition without it.
 *
 * What this screen deliberately cannot do is open a collection. `CollectionRepository`
 * has no `create`, so a row arrives with the policy record and this screen records
 * against it. Where there is no pending row the screen says so plainly instead of
 * offering a button that would have to invent one.
 *
 * Both writes are outward mutations and both go through `<ConfirmGate>` with a
 * real change list. Cancel returns the fork to unanswered and writes nothing.
 */

import { useState } from 'react'
import { useSessionStore } from '../../app/store'
import { ConfirmGate, RecordOnlyAmount } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import type { CollectionRecord } from '../../data/repo'
import {
  COLLECTION_INSTRUMENTS,
  COLLECTION_MODES,
  COLLECTION_ROUTES,
  COLLECTION_STATES,
  canIssueReceipt,
  collectionMachine,
} from '../../domain/workflows'
import type {
  CollectionContext,
  CollectionInstrument,
  CollectionMode,
  CollectionRoute,
  CollectionState,
} from '../../domain/workflows'
import { Button } from '../../ui/Button'
import { DatePicker, Field, Input, RadioGroup, Select } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { StatusPill } from '../../ui/signal'
import type { Tone } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { Money as AmountText } from '../../ui/type'
import type { PolicyDesk, RecordPaymentInput } from './data/policy-desk'
import { isBounceWatched } from './entry-types'
import type { PaymentEntry } from './entry-types'
import styles from './PaymentFork.module.css'

export type PaymentForkProps = {
  policyId: string
  /** The rows already on the books, from `desk.dossier`. Never from a fixture. */
  collections: readonly CollectionRecord[]
  desk: PolicyDesk
  /** Told after a committed write, so the dossier is re-read rather than patched. */
  onRecorded?: (record: CollectionRecord) => void
  /** Injected: a row and the write it makes must never disagree about now. */
  now?: Date
  className?: string
}

/* ------------------------------------------------------------- the vocabulary */

const STATE_LABEL: Record<CollectionState, string> = {
  pending: 'Awaiting the payment',
  reference_recorded: 'Reference recorded',
  recorded: 'Recorded',
  verified: 'Verified by the back office',
  bounced: 'Bounced',
  closed: 'Closed',
}

/** Green is positive status only, lime is "needs a person", red is the bounce. */
const STATE_TONE: Record<CollectionState, Tone> = {
  pending: 'attn',
  reference_recorded: 'info',
  recorded: 'info',
  verified: 'ok',
  bounced: 'bad',
  closed: 'idle',
}

const ROUTE_LABEL: Record<CollectionRoute, string> = {
  direct_to_company: 'Straight to the company',
  via_agency: 'Through the agency',
}

const ROUTE_NOTE: Record<CollectionRoute, string> = {
  direct_to_company:
    'The customer paid the insurer. The agency records the reference and nothing else.',
  via_agency:
    'The agency took the money and carries it on its books until the back office verifies it.',
}

const INSTRUMENT_LABEL: Record<CollectionInstrument, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  online: 'Online transfer',
  mandate: 'Mandate',
}

const MODE_LABEL: Record<CollectionMode, string> = {
  back_office: 'Back office',
  on_field: 'On field',
}

const INSTRUMENT_OPTIONS = Object.values(COLLECTION_INSTRUMENTS).map((value) => ({
  value,
  label: INSTRUMENT_LABEL[value],
}))

const MODE_OPTIONS = Object.values(COLLECTION_MODES).map((value) => ({
  value,
  label: MODE_LABEL[value],
}))

const ROUTE_OPTIONS = Object.values(COLLECTION_ROUTES).map((value) => ({
  value,
  label: ROUTE_LABEL[value],
  description: ROUTE_NOTE[value],
}))

/**
 * The receipt refusal, in the workflow's words rather than in this file's. A
 * second wording of the same rule is a second rule waiting to drift.
 */
const RECEIPT_VERDICT = canIssueReceipt()
const NO_RECEIPT = RECEIPT_VERDICT.ok ? '' : RECEIPT_VERDICT.reason

const UNDECIDED = 'Not yet recorded'
const NOT_RECORDED = 'Not recorded'

const BOUNCE_WATCH =
  'A cheque is the only instrument that can bounce, so this record stays on bounce watch until the bank has honoured it. Somebody has to look.'

const REOPENED =
  'This collection has reopened. The money is still owed, and a follow-up task is out for it.'

const NO_ROWS =
  'No collection is open against this policy. A collection row is opened with the policy record, not here, so there is nothing yet to record against.'

const NO_PENDING =
  'Nothing is pending against this policy. This screen records against a collection that is already open; it cannot open a new one.'

const AMOUNT_HINT =
  'The figure the customer actually paid. Type it; the platform records what moved and never works out what should have.'

/* ----------------------------------------------------------------- the drafts */

/** The fork before it is answered. `route` is null until a person chooses. */
type ForkDraft = Omit<PaymentEntry, 'route'> & { readonly route: CollectionRoute | null }

type BounceDraft = { readonly reason: string; readonly dueOn: string }

/**
 * A draft starts from the row itself, which is the honest starting point for
 * everything except the route: instrument and mode record what the customer said
 * they would do, and the route records where the money actually went.
 */
function initialDraft(record: CollectionRecord): ForkDraft {
  return {
    route: null,
    instrument: record.instrument,
    mode: record.mode,
    amount: record.amount,
    reference: record.reference ?? '',
  }
}

function targetOf(route: CollectionRoute): CollectionState {
  return route === COLLECTION_ROUTES.directToCompany
    ? COLLECTION_STATES.referenceRecorded
    : COLLECTION_STATES.recorded
}

function blank(text: string): boolean {
  return text.trim().length === 0
}

/** The row is watched from the moment it is recorded until it is bounced or closed. */
function onBounceWatch(record: CollectionRecord): boolean {
  if (!isBounceWatched(record)) return false
  return record.state === COLLECTION_STATES.recorded || record.state === COLLECTION_STATES.verified
}

function amountOf(record: CollectionRecord): number | null {
  return record.amount === null ? null : record.amount.paise
}

/* -------------------------------------------------------------- the component */

export function PaymentFork({
  policyId,
  collections,
  desk,
  onRecorded,
  now = new Date(),
  className,
}: PaymentForkProps) {
  const user = useSessionStore((state) => state.user)
  const toaster = useToaster()

  const [drafts, setDrafts] = useState<Readonly<Record<string, ForkDraft>>>({})
  const [bounces, setBounces] = useState<Readonly<Record<string, BounceDraft>>>({})
  const [refusals, setRefusals] = useState<Readonly<Record<string, string>>>({})

  const rows = collections.filter((row) => row.policyId === policyId)
  const pending = rows.filter((row) => row.state === COLLECTION_STATES.pending)

  function patchDraft(record: CollectionRecord, patch: Partial<ForkDraft>) {
    setDrafts((current) => ({
      ...current,
      [record.id]: { ...(current[record.id] ?? initialDraft(record)), ...patch },
    }))
  }

  function patchBounce(record: CollectionRecord, patch: Partial<BounceDraft>) {
    setBounces((current) => ({
      ...current,
      [record.id]: { ...(current[record.id] ?? { reason: '', dueOn: '' }), ...patch },
    }))
  }

  function clearDraft(record: CollectionRecord) {
    setDrafts((current) => ({ ...current, [record.id]: initialDraft(record) }))
  }

  function closeBounce(record: CollectionRecord) {
    setBounces((current) => {
      const next = { ...current }
      delete next[record.id]
      return next
    })
  }

  function setRefusal(record: CollectionRecord, reason: string | null) {
    setRefusals((current) => {
      const next = { ...current }
      if (reason === null) delete next[record.id]
      else next[record.id] = reason
      return next
    })
  }

  async function record(row: CollectionRecord, draft: ForkDraft) {
    if (!user || draft.route === null || draft.amount === null) return

    const reference = draft.reference.trim()
    const input: RecordPaymentInput = {
      actorId: user.id,
      amount: draft.amount,
      route: draft.route,
      instrument: draft.instrument,
      mode: draft.mode,
      collectedBy: user.id,
      now,
      ...(reference === '' ? {} : { reference }),
    }

    const result = await desk.recordPayment(row.id, input)
    if (!result.ok) {
      setRefusal(row, result.reason)
      return
    }

    setRefusal(row, null)
    toaster.notify({
      title:
        draft.route === COLLECTION_ROUTES.directToCompany
          ? 'Payment reference recorded'
          : 'Collection recorded',
      tone: 'ok',
    })
    onRecorded?.(result.record)
  }

  async function bounce(row: CollectionRecord, draft: BounceDraft) {
    if (!user) return

    const result = await desk.markBounced(row.id, {
      actorId: user.id,
      bounceReason: draft.reason.trim(),
      followUpDueOn: draft.dueOn,
      now,
    })

    if (!result.ok) {
      setRefusal(row, result.reason)
      return
    }

    setRefusal(row, null)
    closeBounce(row)
    toaster.notify({ title: 'Cheque marked bounced', tone: 'bad' })
    onRecorded?.(result.record)
  }

  return (
    <Panel
      title="Payment and collection"
      description="Every payment recorded against this policy, as it was taken. The platform notes that money moved; it produces nothing else."
      className={className}
    >
      <div data-payment-fork="">
        {rows.length === 0 ? (
          <p className={styles.empty} data-empty="collections">
            {NO_ROWS}
          </p>
        ) : (
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li
                key={row.id}
                className={styles.row}
                data-collection={row.id}
                data-state={row.state}
              >
                <div className={styles.head}>
                  <StatusPill tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</StatusPill>
                  {onBounceWatch(row) ? (
                    <StatusPill tone="attn" icon="alert" dot={false}>
                      On bounce watch
                    </StatusPill>
                  ) : null}
                </div>

                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <dt className={styles.label}>Route</dt>
                    <dd className={styles.value}>
                      {row.state === COLLECTION_STATES.pending ? UNDECIDED : ROUTE_LABEL[row.route]}
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt className={styles.label}>Instrument</dt>
                    <dd className={styles.value}>
                      {row.state === COLLECTION_STATES.pending
                        ? UNDECIDED
                        : INSTRUMENT_LABEL[row.instrument]}
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt className={styles.label}>Where it was taken</dt>
                    <dd className={styles.value}>
                      {row.state === COLLECTION_STATES.pending ? UNDECIDED : MODE_LABEL[row.mode]}
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt className={styles.label}>Amount</dt>
                    <dd className={styles.value}>
                      <AmountText paise={amountOf(row)} absentText={UNDECIDED} />
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt className={styles.label}>Reference</dt>
                    <dd className={styles.value} data-mono="">
                      {row.reference ?? NOT_RECORDED}
                    </dd>
                  </div>
                </dl>

                {row.state === COLLECTION_STATES.bounced ? (
                  <p className={styles.watch} data-reopened="">
                    <Icon name="alert" size="sm" />
                    {REOPENED}
                  </p>
                ) : null}

                {row.state === COLLECTION_STATES.pending ? (
                  <Fork
                    record={row}
                    draft={drafts[row.id] ?? initialDraft(row)}
                    now={now}
                    actorId={user?.id ?? null}
                    onPatch={(patch) => patchDraft(row, patch)}
                    onCancel={() => clearDraft(row)}
                    onConfirm={(draft) => void record(row, draft)}
                  />
                ) : null}

                {row.state === COLLECTION_STATES.recorded && isBounceWatched(row) ? (
                  <Bounce
                    record={row}
                    draft={bounces[row.id] ?? null}
                    now={now}
                    onOpen={() => patchBounce(row, {})}
                    onPatch={(patch) => patchBounce(row, patch)}
                    onCancel={() => closeBounce(row)}
                    onConfirm={(draft) => void bounce(row, draft)}
                  />
                ) : null}

                {refusals[row.id] ? (
                  <p className={styles.refusal} role="alert">
                    {refusals[row.id]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {rows.length > 0 && pending.length === 0 ? (
          <p className={styles.empty} data-empty="pending">
            {NO_PENDING}
          </p>
        ) : null}

        <p className={styles.receipt} data-no-receipt="">
          {NO_RECEIPT}
        </p>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------- the fork */

type ForkProps = {
  record: CollectionRecord
  draft: ForkDraft
  now: Date
  actorId: string | null
  onPatch: (patch: Partial<ForkDraft>) => void
  onCancel: () => void
  onConfirm: (draft: ForkDraft) => void
}

function Fork({ record, draft, now, actorId, onPatch, onCancel, onConfirm }: ForkProps) {
  const direct = draft.route === COLLECTION_ROUTES.directToCompany
  const reference = draft.reference.trim()

  // The machine, asked before anything is offered, so the only sentence a person
  // reads when they cannot proceed is the one the rule itself wrote.
  const context: CollectionContext = {
    now,
    route: draft.route ?? record.route,
    instrument: draft.instrument,
    mode: draft.mode,
    amount: draft.amount ?? undefined,
    reference: reference === '' ? undefined : reference,
    agencyBooksTouched: false,
    collectedBy: actorId ?? undefined,
  }

  const verdict =
    draft.route === null
      ? null
      : collectionMachine.canTransition(record.state, targetOf(draft.route), context)

  const changes: ConfirmChange[] =
    draft.route === null
      ? []
      : [
          { key: 'route', label: 'Route', from: UNDECIDED, to: ROUTE_LABEL[draft.route] },
          ...(direct
            ? [
                {
                  key: 'reference',
                  label: 'Insurer or bank reference',
                  from: record.reference ?? NOT_RECORDED,
                  to: reference,
                },
                { key: 'books', label: 'Agency books', to: 'Untouched. Nothing is posted.' },
              ]
            : [
                {
                  key: 'instrument',
                  label: 'Instrument',
                  from: UNDECIDED,
                  to: INSTRUMENT_LABEL[draft.instrument],
                },
                {
                  key: 'mode',
                  label: 'Where it was taken',
                  from: UNDECIDED,
                  to: MODE_LABEL[draft.mode],
                },
              ]),
          {
            key: 'amount',
            label: 'Amount',
            from: <AmountText paise={amountOf(record)} absentText={UNDECIDED} />,
            to: <AmountText paise={draft.amount === null ? null : draft.amount.paise} />,
          },
          ...(!direct && isBounceWatched(draft)
            ? [
                {
                  key: 'watch',
                  label: 'Bounce watch',
                  to: 'On, until the bank has honoured the cheque.',
                },
              ]
            : []),
          {
            key: 'state',
            label: 'This collection',
            from: STATE_LABEL[record.state],
            to: STATE_LABEL[targetOf(draft.route)],
          },
        ]

  return (
    <div className={styles.fork}>
      <Field label="Where did this money go?" control="group">
        <RadioGroup
          name={`route-${record.id}`}
          value={draft.route ?? ''}
          options={ROUTE_OPTIONS}
          onValueChange={(value) => onPatch({ route: value as CollectionRoute })}
        />
      </Field>

      {draft.route === null ? null : (
        <div className={styles.branch}>
          {direct ? (
            <Field
              label="Insurer or bank reference"
              id={`reference-${record.id}`}
              hint="The number the insurer or the bank put on the payment. It is the only trace the agency keeps of a direct payment."
              required
            >
              <Input
                mono
                name="reference"
                value={draft.reference}
                autoComplete="off"
                onChange={(event) => onPatch({ reference: event.target.value })}
              />
            </Field>
          ) : (
            <>
              <Field label="Instrument" id={`instrument-${record.id}`} required>
                <Select
                  name="instrument"
                  options={INSTRUMENT_OPTIONS}
                  value={draft.instrument}
                  onChange={(event) =>
                    onPatch({ instrument: event.target.value as CollectionInstrument })
                  }
                />
              </Field>
              <Field label="Where it was taken" id={`mode-${record.id}`} required>
                <Select
                  name="mode"
                  options={MODE_OPTIONS}
                  value={draft.mode}
                  onChange={(event) => onPatch({ mode: event.target.value as CollectionMode })}
                />
              </Field>
            </>
          )}

          <RecordOnlyAmount
            id={`amount-${record.id}`}
            name="amount"
            label="Amount paid"
            value={draft.amount}
            hint={AMOUNT_HINT}
            required
            onValueChange={(amount) => onPatch({ amount })}
          />

          {!direct && isBounceWatched(draft) ? (
            <p className={styles.watch} data-bounce-watch="">
              <Icon name="alert" size="sm" />
              {BOUNCE_WATCH}
            </p>
          ) : null}

          {verdict && !verdict.ok ? (
            <p className={styles.refusal} role="alert">
              {verdict.reason}
            </p>
          ) : (
            <ConfirmGate
              className={styles.gate}
              title={direct ? 'Record the payment reference' : 'Record this collection'}
              changes={changes}
              confirmLabel="Record it"
              cancelLabel="Start again"
              receipt={
                direct
                  ? 'The reference is recorded. Nothing was posted to the agency books.'
                  : 'The collection is recorded.'
              }
              onCancel={onCancel}
              onConfirm={() => onConfirm(draft)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- the bounce */

type BounceProps = {
  record: CollectionRecord
  draft: BounceDraft | null
  now: Date
  onOpen: () => void
  onPatch: (patch: Partial<BounceDraft>) => void
  onCancel: () => void
  onConfirm: (draft: BounceDraft) => void
}

function Bounce({ record, draft, now, onOpen, onPatch, onCancel, onConfirm }: BounceProps) {
  if (draft === null) {
    return (
      <div className={styles.actions}>
        <Button variant="quiet" onClick={onOpen}>
          Mark bounced
        </Button>
      </div>
    )
  }

  const reason = draft.reason.trim()

  // `followUpTaskCreated` is a fact about this call rather than a promise about a
  // later one: it is true only once a due date exists to raise the task on. So a
  // missing date is refused by the guard that cares, in its own words.
  const context: CollectionContext = {
    now,
    route: record.route,
    instrument: record.instrument,
    mode: record.mode,
    bounceReason: reason === '' ? undefined : reason,
    followUpTaskCreated: !blank(draft.dueOn),
    followUpTaskDueOn: blank(draft.dueOn) ? undefined : draft.dueOn,
  }

  const verdict = collectionMachine.canTransition(
    record.state,
    COLLECTION_STATES.bounced,
    context,
  )

  return (
    <div className={styles.bounce}>
      <Field
        label="What the bank said"
        id={`bounce-reason-${record.id}`}
        hint="The bank's own words. Nothing is inferred from them."
        required
      >
        <Input
          name="bounceReason"
          value={draft.reason}
          autoComplete="off"
          onChange={(event) => onPatch({ reason: event.target.value })}
        />
      </Field>

      <Field
        label="Follow-up due"
        id={`bounce-due-${record.id}`}
        hint="When somebody chases this. The task is raised on the same move as the bounce."
        required
      >
        <DatePicker
          name="followUpDueOn"
          value={draft.dueOn}
          onChange={(event) => onPatch({ dueOn: event.target.value })}
        />
      </Field>

      {verdict.ok ? (
        <ConfirmGate
          className={styles.gate}
          title="Mark this cheque bounced"
          changes={[
            {
              key: 'state',
              label: 'This collection',
              from: STATE_LABEL[record.state],
              to: STATE_LABEL.bounced,
            },
            { key: 'reason', label: 'Bank reason', to: reason },
            { key: 'task', label: 'Follow-up task', to: `Raised, due ${draft.dueOn}` },
            { key: 'money', label: 'The money', to: 'Still owed. The collection reopens.' },
          ]}
          note="The customer is told and the follow-up task is raised as part of this move, not after it."
          confirmLabel="Record the bounce"
          receipt="The bounce is recorded and the follow-up task is raised."
          onCancel={onCancel}
          onConfirm={() => onConfirm(draft)}
        />
      ) : (
        <p className={styles.refusal} role="alert">
          {verdict.reason}
        </p>
      )}
    </div>
  )
}
