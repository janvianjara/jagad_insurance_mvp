import { useState } from 'react'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { DatePicker, Field, FormRow, Select, Textarea } from '../../ui/form'
import { Panel } from '../../ui/surface'
import { nextActionSatisfied } from '../../domain/workflows'
import type {
  ActivityChannel,
  ActivityDirection,
  Disposition,
  InquiryStage,
  Inquiry,
  LogEngagementCommand,
  MutationResult,
  EngagementOutcome,
  RecycleInquiryCommand,
  TaskKind,
} from '../../data/repo'
import styles from './InquiryDetail.module.css'

/**
 * Logging one contact — FR-06.13 to .15, and the screen the PRD had no object
 * for.
 *
 * Three things about the shape are deliberate.
 *
 * The outcome comes first and everything else follows from it. The disposition
 * is not a label filed alongside the note; it is what decides where the inquiry
 * goes next, whether a date is owed and whether a reason is compulsory. So the
 * form reshapes under it rather than showing every field to everybody, and the
 * next-action block appears because the outcome asked for it.
 *
 * The refusal is the mandate's own sentence, asked before the control is drawn.
 * `nextActionSatisfied` is the same function the repository will call, so the
 * button is disabled with exactly the words the write would have refused with —
 * nobody presses a button to find out what is missing.
 *
 * And it goes behind `<ConfirmGate>` because logging a contact notifies somebody
 * and schedules work. Cancel writes nothing: no activity, no task, no stamp.
 */

const CHANNELS: readonly { value: ActivityChannel; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'visit', label: 'Visit' },
]

/**
 * What the follow-up will be. One kind today because the engagement layer raises
 * one kind of task; the list is here rather than inline so a second one is a row
 * rather than a refactor.
 */
const NEXT_ACTION_KINDS: readonly { value: TaskKind; label: string }[] = [
  { value: 'inquiry_follow_up', label: 'Follow up on this inquiry' },
]

/** `yyyy-MM-ddTHH:mm` for the native control, in the browser's own zone. */
function toLocalInput(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`
}

export type LogActivityPanelProps = {
  readonly inquiry: Inquiry
  readonly dispositions: readonly Disposition[]
  readonly stages: readonly InquiryStage[]
  readonly now: Date
  readonly actorId: string
  readonly canLog: boolean
  readonly onLog: (command: LogEngagementCommand) => Promise<MutationResult<EngagementOutcome>>
  readonly onRecycle: (command: RecycleInquiryCommand) => Promise<MutationResult<Inquiry>>
  readonly onLogged: () => void
}

export function LogActivityPanel({
  inquiry,
  dispositions,
  stages,
  now,
  actorId,
  canLog,
  onLog,
  onRecycle,
  onLogged,
}: LogActivityPanelProps) {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ActivityChannel>('call')
  const [direction, setDirection] = useState<ActivityDirection>('outbound')
  const [dispositionKey, setDispositionKey] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [nextKind, setNextKind] = useState<TaskKind>(NEXT_ACTION_KINDS[0].value)
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const offered = dispositions.filter(
    (row) =>
      row.active && (row.channelKeys.length === 0 || row.channelKeys.includes(channel)),
  )
  const chosen = offered.find((row) => row.key === dispositionKey) ?? null
  const landsOn = chosen?.stageKey ?? null
  const stage = stages.find((row) => row.key === landsOn) ?? null
  const terminal = stage?.terminal ?? false

  const wantsNextAction = chosen !== null && chosen.requiresNextAction && !terminal

  const nextAction = wantsNextAction && dueAt !== ''
    ? { kind: nextKind, dueAt: new Date(dueAt).toISOString() }
    : null

  // Asked with the same function the write will ask, so the sentence matches.
  const verdict = nextActionSatisfied({
    now,
    disposition:
      chosen === null
        ? null
        : {
            key: chosen.key,
            label: chosen.label,
            terminal,
            requiresNextAction: chosen.requiresNextAction,
            requiresReason: chosen.requiresReason,
          },
    nextAction,
    reason,
  })

  function reset() {
    setOpen(false)
    setDispositionKey('')
    setNotes('')
    setReason('')
    setDueAt('')
    setRefusal(null)
  }

  async function commit() {
    setSaving(true)
    setRefusal(null)
    const outcome = await onLog({
      actorId,
      channel,
      direction,
      dispositionKey,
      notes: notes.trim() === '' ? null : notes.trim(),
      reason: reason.trim() === '' ? null : reason.trim(),
      nextAction,
      now,
    })
    setSaving(false)

    if (!outcome.ok) {
      // The repository's own sentence, rendered as written.
      setRefusal(outcome.reason)
      return
    }
    reset()
    onLogged()
  }

  const changes: readonly ConfirmChange[] = chosen === null
    ? []
    : [
        {
          key: 'contact',
          label: 'Contact',
          to: `${CHANNELS.find((row) => row.value === channel)?.label ?? channel}, ${direction === 'inbound' ? 'received' : 'made'}`,
        },
        { key: 'outcome', label: 'Outcome', to: chosen.label },
        ...(stage
          ? [{ key: 'stage', label: 'Stage', from: stageLabel(stages, inquiry.stageKey), to: stage.label }]
          : []),
        ...(nextAction
          ? [
              {
                key: 'next',
                label: 'Next action',
                to: `${new Date(nextAction.dueAt).toLocaleString()} — a task for ${inquiry.contactName}`,
              },
            ]
          : []),
        ...(chosen.incrementsAttempt
          ? [
              {
                key: 'attempts',
                label: 'Attempts',
                from: String(inquiry.contactAttempts),
                to: String(inquiry.contactAttempts + 1),
              },
            ]
          : []),
      ]

  const parked = stages.find((row) => row.key === inquiry.stageKey)?.terminal === true

  if (!open) {
    return (
      <Panel
        title="Contact"
      >
        <ContactSummary inquiry={inquiry} stages={stages} now={now} />

        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        {parked ? (
          /*
           * A parked lead needs a way back or dormancy is Lost with a friendlier
           * name — and the win-back list the agency would work next quarter is
           * exactly the thing that disappears. FR-06.17.
           */
          <RecycleControl
            inquiry={inquiry}
            actorId={actorId}
            canRecycle={canLog}
            onRecycle={onRecycle}
            onDone={onLogged}
            onRefused={setRefusal}
          />
        ) : (
          <div className={styles.actions}>
            <Button
              variant="primary"
              icon="users"
              disabled={!canLog}
              onClick={() => setOpen(true)}
            >
              Log a contact
            </Button>
          </div>
        )}
      </Panel>
    )
  }

  return (
    <Panel
      title="Log a contact"
    >
      {refusal ? (
        <p className={styles.refusal} role="alert">
          <Icon name="alert" size="sm" />
          {refusal}
        </p>
      ) : null}

      <FormRow columns={3}>
        <Field label="Channel">
          <Select
            value={channel}
            options={CHANNELS.map((row) => ({ value: row.value, label: row.label }))}
            onChange={(event) => {
              setChannel(event.target.value as ActivityChannel)
              // An outcome that does not belong to the new channel would be
              // refused by the write, so it is dropped here rather than left
              // sitting in the control looking chosen.
              setDispositionKey('')
            }}
          />
        </Field>
        <Field label="Direction" hint="Who moved first.">
          <Select
            value={direction}
            options={[
              { value: 'outbound', label: 'We contacted them' },
              { value: 'inbound', label: 'They contacted us' },
            ]}
            onChange={(event) => setDirection(event.target.value as ActivityDirection)}
          />
        </Field>
        <Field label="Outcome" required>
          <Select
            value={dispositionKey}
            placeholder="What came of it"
            options={offered.map((row) => ({ value: row.key, label: row.label }))}
            onChange={(event) => {
              const key = event.target.value
              setDispositionKey(key)
              // The outcome proposes when to come back — "call back" suggests two
              // days, "busy" suggests two hours — from `defaultRetryMinutes` on
              // its own configured row, so neither number appears in this file.
              // It is filled in once as a starting value rather than derived on
              // every render, because a value that reappears when you clear it is
              // a field you cannot empty, and an empty one is a real answer the
              // mandate has something to say about.
              const proposed = offered.find((row) => row.key === key)?.defaultRetryMinutes
              setDueAt(
                proposed == null ? '' : toLocalInput(new Date(now.getTime() + proposed * 60_000)),
              )
            }}
          />
        </Field>
      </FormRow>

      {chosen?.requiresReason ? (
        <Field
          label="Reason"
          required
          hint="Compulsory for this outcome, and what makes lost-reason reporting worth reading."
        >
          <Textarea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} />
        </Field>
      ) : null}

      {wantsNextAction ? (
        <FormRow>
          <Field label="Next action">
            <Select
              value={nextKind}
              options={NEXT_ACTION_KINDS.map((row) => ({ value: row.value, label: row.label }))}
              onChange={(event) => setNextKind(event.target.value as TaskKind)}
            />
          </Field>
          <Field
            label="When"
            required
            hint={
              chosen?.defaultRetryMinutes == null
                ? 'An open inquiry always carries a date.'
                : 'Suggested by the outcome. Change it to whatever was actually agreed.'
            }
          >
            <DatePicker
              withTime
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
        </FormRow>
      ) : null}

      <Field
        label="Note"
        optional
        hint="What was said, in your words. Stays on the record and is never sent anywhere."
      >
        <Textarea value={notes} rows={3} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      {verdict.ok && chosen ? (
        <div className={styles.gate}>
          <ConfirmGate
            title={`Log this ${CHANNELS.find((row) => row.value === channel)?.label.toLowerCase() ?? channel} on ${inquiry.systemNo}`}
            changes={changes}
            note={
              nextAction
                ? 'The follow-up task is raised and the inquiry carries its date. Nothing is sent to the customer from here.'
                : 'Recorded on the inquiry. Nothing is sent to the customer from here.'
            }
            confirmLabel={saving ? 'Recording' : 'Log the contact'}
            receipt="Recorded. The inquiry has moved and the follow-up is on the queue."
            onCancel={reset}
            onConfirm={() => void commit()}
          />
        </div>
      ) : (
        <>
          <p className={styles.blocked}>{verdict.ok ? '' : verdict.reason}</p>
          <div className={styles.actions}>
            <Button variant="quiet" onClick={reset}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </Panel>
  )
}

/**
 * The way back off the parked list — FR-06.17.
 *
 * The reason is compulsory for the same purpose Lost's is: a record that
 * reappears with no account of why is one nobody can explain later. Bringing a
 * lead back is an outward act — it puts work on somebody's queue — so it goes
 * through the gate like every other one.
 */
function RecycleControl({
  inquiry,
  actorId,
  canRecycle,
  onRecycle,
  onDone,
  onRefused,
}: {
  readonly inquiry: Inquiry
  /** Whoever is signed in. Not the owner — they may be exactly who dropped it. */
  readonly actorId: string
  readonly canRecycle: boolean
  readonly onRecycle: (command: RecycleInquiryCommand) => Promise<MutationResult<Inquiry>>
  readonly onDone: () => void
  readonly onRefused: (reason: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const [reason, setReason] = useState('')
  const [toPool, setToPool] = useState(false)

  if (!armed) {
    return (
      <div className={styles.actions}>
        <Button variant="primary" icon="sort" disabled={!canRecycle} onClick={() => setArmed(true)}>
          Bring this lead back
        </Button>
      </div>
    )
  }

  return (
    <>
      <Field
        label="Why is it coming back"
        required
        hint="Compulsory. A parked lead that reappears with no reason is one nobody can account for."
      >
        <Textarea value={reason} rows={2} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Field label="Who takes it">
        <Select
          value={toPool ? 'pool' : 'owner'}
          options={[
            { value: 'owner', label: 'Stays with the current owner' },
            { value: 'pool', label: 'Back to the pool for anyone to take' },
          ]}
          onChange={(event) => setToPool(event.target.value === 'pool')}
        />
      </Field>

      {reason.trim() === '' ? (
        <>
          <p className={styles.blocked}>
            Say why this lead is coming back before bringing it back.
          </p>
          <div className={styles.actions}>
            <Button variant="quiet" onClick={() => setArmed(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.gate}>
          <ConfirmGate
            title={`Bring ${inquiry.systemNo} back into the pipeline`}
            changes={[
              { key: 'stage', label: 'Stage', from: 'Dormant', to: 'Not contacted' },
              { key: 'attempts', label: 'Attempts', from: String(inquiry.contactAttempts), to: '0' },
              {
                key: 'owner',
                label: 'Owner',
                to: toPool ? 'Back to the pool' : 'Unchanged',
              },
              { key: 'reason', label: 'Reason', to: reason.trim() },
            ]}
            note="It re-enters unstaged, which is what it is: a lead nobody has spoken to lately. The attempt count starts again."
            confirmLabel="Bring it back"
            receipt="Back in the pipeline. Somebody needs to ring them."
            onCancel={() => setArmed(false)}
            onConfirm={() => {
              void onRecycle({
                actorId,
                reason: reason.trim(),
                toPool,
              }).then((outcome) => {
                if (!outcome.ok) {
                  onRefused(outcome.reason)
                  return
                }
                setArmed(false)
                onDone()
              })
            }}
          />
        </div>
      )}
    </>
  )
}

function stageLabel(stages: readonly InquiryStage[], key: string | null): string {
  if (key === null) return 'Not yet contacted'
  return stages.find((row) => row.key === key)?.label ?? key
}

/**
 * The three facts that say whether this lead is being worked.
 *
 * Rendered together because they are read together: a stage with no date under
 * it is the shape of a lead going quiet, and putting them in separate corners of
 * the screen is how that goes unnoticed.
 */
function ContactSummary({
  inquiry,
  stages,
  now,
}: {
  readonly inquiry: Inquiry
  readonly stages: readonly InquiryStage[]
  readonly now: Date
}) {
  const overdue =
    inquiry.nextActionAt !== null && new Date(inquiry.nextActionAt).getTime() < now.getTime()

  return (
    <dl className={styles.contactFacts}>
      <div>
        <dt>Stage</dt>
        <dd>{stageLabel(stages, inquiry.stageKey)}</dd>
      </div>
      <div>
        <dt>Last contact</dt>
        <dd>
          {inquiry.lastActivityAt === null
            ? 'Nobody has spoken to them yet'
            : new Date(inquiry.lastActivityAt).toLocaleString()}
        </dd>
      </div>
      <div>
        <dt>Attempts</dt>
        <dd>{inquiry.contactAttempts === 0 ? 'None recorded' : String(inquiry.contactAttempts)}</dd>
      </div>
      <div>
        <dt>Next action</dt>
        <dd data-overdue={overdue || undefined}>
          {inquiry.nextActionAt === null
            ? 'Nothing is scheduled'
            : `${new Date(inquiry.nextActionAt).toLocaleString()}${overdue ? ' — overdue' : ''}`}
        </dd>
      </div>
    </dl>
  )
}

export default LogActivityPanel
