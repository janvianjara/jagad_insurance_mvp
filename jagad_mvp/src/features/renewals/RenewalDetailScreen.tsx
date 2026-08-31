import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { RENEWAL_STATES, renewalTaskMachine } from '../../domain/workflows'
import type {
  BackdatingRecord,
  RenewalContext,
  RenewalReminder,
  RenewalState,
  RenewedTerm,
  YearWiseAmount,
} from '../../domain/workflows'
import type { Money as Amount } from '../../domain/money'
import type { DomainEvent } from '../../domain/events'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { MachineActions } from '../../components/MachineActions'
import type { MachineAction } from '../../components/MachineActions'
import { RecordTimeline } from '../../components/RecordTimeline'
import { RecordOnlyAmount } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { IconName } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Checkbox, DatePicker, Field, Input, Textarea } from '../../ui/form'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId } from '../../ui/type'
import type { MutationResult, RenewalTask, StaffUser } from '../../data/repo'
import { useRenewalNow } from './clock'
import { renewalDesk } from './data/renewal-desk'
import type { RenewalDeskRepository } from './data/renewal-desk'
import { leadDaysOrNull, maxReminders } from './lead-days'
import { CONTINUITY_AT_RISK, MODE_LABEL, RENEWAL_LABEL, RENEWAL_TONE } from './renewal-view'
import styles from './RenewalDetail.module.css'

/**
 * Renewal detail — plan §4 `/renewals/:id`, §5 "Renewal pool", canvas 5.1 to 5.5.
 *
 * The screen is `renewalTaskMachine` with a face on it, built from
 * `targetsFrom` so an edge the machine has cannot go missing and a control the
 * screen offers cannot be an edge the machine lacks.
 *
 * The §9 lines that are visible here rather than merely enforced:
 *
 *   The pool is a pull. Taking a renewal assigns it to the person pressing the
 *   button and to nobody else, because the guard refuses an assignment that was
 *   pushed onto somebody — whoever completes it, owns it.
 *
 *   A reminder carries year-wise amounts and offers. The current term's figure
 *   is the one recorded on the policy and is shown as a recorded fact, not as
 *   something this screen worked out; earlier years are typed through
 *   `<RecordOnlyAmount>`. A bare "your policy expires" is refused.
 *
 *   A renewal is a new term, a new document version and a commission
 *   recalculation. Version 1 is last year's PDF and it stays exactly as it was
 *   sent, so the version offered here is never 1.
 *
 *   Backdating is permitted. It is the logging that is compulsory — the actor,
 *   the timestamp, the original date and the reason, or the move is refused.
 *
 *   The lead time is configuration. There is no day count in this file.
 */
export function RenewalDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const desk = renewalDesk(repositories)

  const context = useResource(async () => {
    const [users, recipes] = await Promise.all([
      repositories.config.users(),
      repositories.config.recipes(),
    ])
    return { users, leadDays: leadDaysOrNull(recipes), maxReminders: maxReminders(recipes) }
  }, 'renewals:detail-context')

  const loaded = useResource(() => desk.get(id), `renewal:${id}`)
  const now = useRenewalNow()

  const [written, setWritten] = useState<{
    id: string
    record: RenewalTask
    events: DomainEvent[]
  } | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [offersText, setOffersText] = useState('')
  const [earlier, setEarlier] = useState<readonly { year: string; amount: Amount | null }[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [commissionDone, setCommissionDone] = useState(false)
  const [backdateReason, setBackdateReason] = useState('')
  const [lapseReason, setLapseReason] = useState('')

  const fresh = written && written.id === id ? written : null
  const task = fresh?.record ?? loaded.data ?? null
  const events = fresh?.events ?? []

  const policy = useResource(
    () => (task ? repositories.policies.get(task.policyId) : Promise.resolve(null)),
    `renewal-policy:${task?.policyId ?? ''}`,
  )
  const customer = useResource(
    () => (task ? repositories.customers.get(task.customerId) : Promise.resolve(null)),
    `renewal-customer:${task?.customerId ?? ''}`,
  )
  const versions = useResource(
    () => (task ? repositories.policies.versions(task.policyId) : Promise.resolve([])),
    `renewal-versions:${task?.policyId ?? ''}`,
  )
  const schedule = useResource(
    () => (task ? repositories.schedules.forPolicy(task.policyId) : Promise.resolve(null)),
    `renewal-schedule:${task?.policyId ?? ''}`,
  )

  if (!user || !context.data || (loaded.isLoading && !task)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (!task) {
    return (
      <EmptyState
        variant="error"
        title="No renewal answers to that address"
        explanation={`Nothing is stored under ${id}. It may belong to another session, or the link may be wrong.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/renewals')}>
            Back to the pool
          </Button>
        }
      />
    )
  }

  const actorId = user.id
  const { users, leadDays } = context.data
  const mayAct = can(user, 'edit', 'renewals')
  const today = now.toISOString().slice(0, 10)
  const customerName = customer.data?.fullName ?? task.customerId

  /**
   * The year-wise amounts. The current term's figure is the one recorded on the
   * policy — read, never worked out — and everything else is typed.
   */
  const recordedYear = policy.data?.startDate ? Number(policy.data.startDate.slice(0, 4)) : null
  const recordedAmount = policy.data?.finalPremium ?? null
  const yearWiseAmounts: readonly YearWiseAmount[] = [
    ...(recordedYear !== null && recordedAmount !== null
      ? [{ year: recordedYear, amount: recordedAmount }]
      : []),
    ...earlier.flatMap((row) =>
      row.amount !== null && /^\d{4}$/.test(row.year)
        ? [{ year: Number(row.year), amount: row.amount }]
        : [],
    ),
  ]

  const offers = offersText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const reminder: RenewalReminder = { yearWiseAmounts, offers }

  /** Version 1 is last year's PDF. A renewal never writes over it. */
  const documentVersion = Math.max(2, (versions.data?.length ?? 1) + 1)
  const renewedTerm: RenewedTerm = {
    startDate,
    endDate,
    documentVersion,
    commissionRecalculated: commissionDone,
  }

  const backdated = startDate !== '' && startDate < today
  const backdating: BackdatingRecord | undefined = backdated
    ? {
        actorId,
        loggedAt: now.toISOString(),
        originalDate: task.expiryDate,
        newDate: startDate,
        ...(backdateReason.trim() === '' ? {} : { reason: backdateReason.trim() }),
      }
    : undefined

  async function commit(to: RenewalState, run: () => Promise<MutationResult<RenewalTask>>) {
    const outcome = await run()
    if (!outcome.ok) {
      // The machine's own sentence. Nothing was written.
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was changed', detail: outcome.reason, tone: 'bad' })
      return
    }
    setRefusal(null)
    setWritten((previous) => ({
      id,
      record: outcome.record,
      events: [...(previous && previous.id === id ? previous.events : []), ...outcome.events],
    }))
    setArmed(null)
    toaster.notify({ title: receiptFor(to), tone: 'ok' })
  }

  const actions = buildActions({
    task,
    desk,
    actorId,
    actorName: nameOf(users, actorId),
    customerName,
    leadDays,
    now,
    reminder,
    renewedTerm,
    ...(backdating === undefined ? {} : { backdating }),
    lapseReason,
    commit,
  })

  const facts: readonly { key: string; label: string; value: ReactNode }[] = [
    { key: 'customer', label: 'Customer', value: customerName },
    { key: 'policy', label: 'Policy', value: policy.data?.systemNo ?? task.policyId },
    {
      key: 'expiry',
      label: 'Term ends',
      value: <DateTime value={task.expiryDate} mode="date" />,
    },
    { key: 'due', label: 'In the pool from', value: <DateTime value={task.dueOn} mode="date" /> },
    {
      key: 'lead',
      label: 'Lead time',
      value:
        leadDays === null
          ? 'No lead is configured, so nothing can be pooled'
          : `${leadDays} days before expiry, from the renewal recipe in configuration`,
    },
    { key: 'owner', label: 'Owner', value: ownerLabel(users, task.assigneeId) },
    { key: 'reminders', label: 'Reminders sent', value: String(task.remindersSent) },
    {
      key: 'mode',
      label: 'Premium mode',
      value: schedule.data === null ? 'Annual — no instalment schedule' : MODE_LABEL[schedule.data.mode],
    },
  ]

  const showReminder = task.state === RENEWAL_STATES.assigned || task.state === RENEWAL_STATES.reminded
  const showOutcome = showReminder

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/renewals">Renewals</Link>}
        title={customerName}
        meta={
          <>
            <RecordId
              systemNo={policy.data?.systemNo ?? task.policyId}
              insurerNo={policy.data?.insurerNo ?? null}
            />
            <StatusPill tone={RENEWAL_TONE[task.state]}>{RENEWAL_LABEL[task.state]}</StatusPill>
            <Badge tone="warn" caps>
              Renewal — the term ends
            </Badge>
          </>
        }
      />

      <div className={styles.screen}>
        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        <div className={styles.columns}>
          <div className={styles.main}>
            <Panel
              title="What happens next"
              description="Every move here goes through the workflow machine. A refused move writes nothing and says why."
            >
              <MachineActions
                actions={actions}
                armed={armed}
                onArm={(key) => {
                  setRefusal(null)
                  setArmed(key)
                }}
                permitted={mayAct}
                permissionNote="Your role can read this renewal but not work it. The renewals desk owns the pool."
                emptyText={`This renewal is settled at ${RENEWAL_LABEL[task.state].toLowerCase()}. Nothing further moves from here.`}
              />
            </Panel>

            {showReminder ? (
              <Panel
                title="The reminder"
                description="A renewal reminder carries the year-wise amounts and the current offers. A bare notice that a policy expires is what customers ignore, and the machine refuses to send one."
              >
                <div className={styles.entry}>
                  <div className={styles.years}>
                    <p className={styles.yearsHead}>Year-wise amounts</p>
                    {recordedYear === null || recordedAmount === null ? (
                      <p className={styles.quiet}>
                        No premium is recorded against this policy, so there is no year-wise amount
                        to carry. Type the years the reminder should show.
                      </p>
                    ) : (
                      <p className={styles.recordedYear}>
                        <span className={styles.yearMark}>{recordedYear}</span>
                        <Money paise={recordedAmount.paise} />
                        <span className={styles.quiet}>from the policy record</span>
                      </p>
                    )}

                    {earlier.map((row, index) => (
                      <div className={styles.yearRow} key={`year-${index}`}>
                        <Field label={`Earlier year ${index + 1}`}>
                          <Input
                            mono
                            inputMode="numeric"
                            value={row.year}
                            onChange={(event) =>
                              setEarlier(
                                earlier.map((entry, position) =>
                                  position === index
                                    ? { ...entry, year: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                        <RecordOnlyAmount
                          label={`Amount for year ${index + 1}`}
                          value={row.amount}
                          onValueChange={(value) =>
                            setEarlier(
                              earlier.map((entry, position) =>
                                position === index ? { ...entry, amount: value } : entry,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}

                    <Button
                      variant="quiet"
                      icon="plus"
                      onClick={() => setEarlier([...earlier, { year: '', amount: null }])}
                    >
                      Add an earlier year
                    </Button>
                  </div>

                  <Field
                    label="Offers"
                    required
                    hint="One per line. A matched notice from the company enriches these with the insurer's own figures; anything else is typed here."
                  >
                    <Textarea
                      rows={3}
                      value={offersText}
                      onChange={(event) => setOffersText(event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>
            ) : null}

            {showOutcome ? (
              <Panel
                title="The outcome"
                description="A renewal is a new term, a new document version and a commission recalculation. A lapse is a reason, because the win-back list is worked from it."
              >
                <div className={styles.entry}>
                  <div className={styles.termRow}>
                    <Field label="New term starts" required>
                      <DatePicker
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </Field>
                    <Field label="New term ends" required>
                      <DatePicker
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                      />
                    </Field>
                  </div>

                  <p className={styles.version}>
                    The renewal writes document version {documentVersion}. Version 1 is last
                    year&apos;s PDF and it stays exactly as it was sent.
                  </p>

                  <Checkbox
                    label="Commission has been recalculated for the new term"
                    description="The chain is recalculated on renewal. The machine refuses to complete without it."
                    checked={commissionDone}
                    onChange={(event) => setCommissionDone(event.target.checked)}
                  />

                  {backdated ? (
                    <Field
                      label="Why is this term backdated"
                      required
                      hint={`Backdating is permitted and it is logged in full: you, the moment you did it, the original date of ${task.expiryDate}, and this reason.`}
                    >
                      <Textarea
                        rows={2}
                        value={backdateReason}
                        onChange={(event) => setBackdateReason(event.target.value)}
                      />
                    </Field>
                  ) : null}

                  <Field
                    label="If it lapsed, why"
                    hint="Compulsory to record a lapse. It is what the win-back list is worked from."
                  >
                    <Textarea
                      rows={2}
                      value={lapseReason}
                      onChange={(event) => setLapseReason(event.target.value)}
                    />
                  </Field>
                </div>
              </Panel>
            ) : null}

            {task.state === RENEWAL_STATES.lapsed ? (
              <Panel title="Lapsed" description="What the win-back list is worked from.">
                <p className={styles.reason}>
                  {task.lapseReason ?? 'No reason is recorded against this lapse.'}
                </p>
                <p className={styles.continuity}>{CONTINUITY_AT_RISK}</p>
              </Panel>
            ) : null}

            <Panel
              title="Record timeline"
              description="Every event on this renewal, as the machine emitted it."
            >
              <RecordTimeline
                events={events}
                options={{ actorName: (actor) => (actor ? nameOf(users, actor) : 'System') }}
                emptyText="Nothing has been recorded against this renewal in this session. Every move made from here appears in this list, with who made it and when."
              />
            </Panel>
          </div>

          <div className={styles.side}>
            <Panel title="The record" level={3}>
              <KeyValueList items={facts} columns={1} />
            </Panel>

            <Panel title="This is a renewal" level={3}>
              <p className={styles.quiet}>
                The policy term ends on{' '}
                <DateTime value={task.expiryDate} mode="date" /> and nothing after it is covered.
                That is what makes this a renewal rather than an instalment: an instalment falls due
                inside a term that is still running, and the policy stays in force either way.
              </p>
              <Link className={styles.link} to="/renewals/instalments">
                Instalments due — the other clock
              </Link>
            </Panel>
          </div>
        </div>
      </div>
    </>
  )
}

export default RenewalDetailScreen

/* ------------------------------------------------------------------ actions */

type ActionInput = {
  readonly task: RenewalTask
  readonly desk: RenewalDeskRepository
  readonly actorId: string
  readonly actorName: string
  readonly customerName: string
  readonly leadDays: number | null
  readonly now: Date
  readonly reminder: RenewalReminder
  readonly renewedTerm: RenewedTerm
  readonly backdating?: BackdatingRecord
  readonly lapseReason: string
  readonly commit: (
    to: RenewalState,
    run: () => Promise<MutationResult<RenewalTask>>,
  ) => Promise<void>
}

type EdgeCopy = {
  readonly label: string
  readonly icon: IconName
  readonly variant?: MachineAction['variant']
  readonly confirmLabel: string
  readonly receipt: string
}

function copyFor(to: RenewalState): EdgeCopy {
  switch (to) {
    case RENEWAL_STATES.inPool:
      return {
        label: 'Open into the pool',
        icon: 'inbox',
        variant: 'primary',
        confirmLabel: 'Open into the pool',
        receipt: 'In the pool. Whoever completes it, owns it.',
      }
    case RENEWAL_STATES.assigned:
      return {
        label: 'Take this renewal from the pool',
        icon: 'users',
        variant: 'primary',
        confirmLabel: 'Take and own',
        receipt: 'Taken. Ownership is recorded against you.',
      }
    case RENEWAL_STATES.reminded:
      return {
        label: 'Send the renewal reminder',
        icon: 'msg',
        variant: 'primary',
        confirmLabel: 'Send the reminder',
        receipt: 'Reminder sent with the year-wise amounts and the offers.',
      }
    case RENEWAL_STATES.renewed:
      return {
        label: 'Record the renewal',
        icon: 'check',
        variant: 'primary',
        confirmLabel: 'Record the new term',
        receipt: 'Renewed. A new document version was written and commission was recalculated.',
      }
    case RENEWAL_STATES.lapsed:
      return {
        label: 'Record a lapse',
        icon: 'close',
        variant: 'danger',
        confirmLabel: 'Record the lapse',
        receipt: 'Lapse recorded with its reason.',
      }
    default:
      return {
        label: 'Add to the win-back list',
        icon: 'spark',
        variant: 'primary',
        confirmLabel: 'Add to win-back',
        receipt: 'On the win-back list, with the lapse reason to work from.',
      }
  }
}

function contextFor(input: ActionInput, to: RenewalState): RenewalContext {
  const { task, actorId, leadDays, now, reminder, renewedTerm, backdating, lapseReason } = input

  return {
    now,
    expiryDate: task.expiryDate,
    ...(leadDays === null ? {} : { leadDays }),
    ...(to === RENEWAL_STATES.assigned
      ? { assigneeId: actorId, selfAssigned: true }
      : task.assigneeId === null
        ? {}
        : { assigneeId: task.assigneeId }),
    remindersSent: task.remindersSent,
    ...(to === RENEWAL_STATES.reminded ? { reminder } : {}),
    ...(to === RENEWAL_STATES.renewed ? { renewedTerm } : {}),
    ...(to === RENEWAL_STATES.renewed && backdating !== undefined ? { backdating } : {}),
    ...(to === RENEWAL_STATES.lapsed ? { lapseReason } : {}),
  }
}

function changesFor(input: ActionInput, to: RenewalState): readonly ConfirmChange[] {
  const { task, actorName, customerName, leadDays, reminder, renewedTerm, backdating, lapseReason } =
    input

  const base: ConfirmChange[] = [
    { key: 'status', label: 'Status', from: RENEWAL_LABEL[task.state], to: RENEWAL_LABEL[to] },
  ]

  if (to === RENEWAL_STATES.inPool) {
    base.push({
      key: 'lead',
      label: 'Lead time',
      to: leadDays === null ? 'Not configured' : `${leadDays} days before expiry, from configuration`,
    })
  }

  if (to === RENEWAL_STATES.assigned) {
    base.push({ key: 'owner', label: 'Owner', from: 'In the pool', to: actorName })
    base.push({ key: 'pull', label: 'How', to: 'Taken, not assigned by somebody else' })
  }

  if (to === RENEWAL_STATES.reminded) {
    // No preview means no Confirm: the gate refuses an empty box, which is what
    // stops a bare "your policy expires" going out by habit.
    if (reminder.yearWiseAmounts.length === 0 || reminder.offers.length === 0) return []
    base.push({ key: 'to', label: 'Recipient', to: customerName })
    base.push({
      key: 'years',
      label: 'Year-wise amounts',
      to: reminder.yearWiseAmounts
        .map((entry) => `${entry.year}: ${entry.amount.paise / 100}`)
        .join(' · '),
    })
    base.push({ key: 'offers', label: 'Offers', to: reminder.offers.join(' · ') })
    base.push({
      key: 'count',
      label: 'Reminders sent',
      from: String(task.remindersSent),
      to: String(task.remindersSent + 1),
    })
  }

  if (to === RENEWAL_STATES.renewed) {
    if (renewedTerm.startDate === '' || renewedTerm.endDate === '') return []
    base.push({
      key: 'term',
      label: 'New term',
      from: `ends ${task.expiryDate}`,
      to: `${renewedTerm.startDate} to ${renewedTerm.endDate}`,
    })
    base.push({
      key: 'version',
      label: 'Document version',
      to: `${renewedTerm.documentVersion} — a new PDF, never an edit of last year's`,
    })
    base.push({
      key: 'commission',
      label: 'Commission',
      to: renewedTerm.commissionRecalculated ? 'Recalculated' : 'Not recalculated yet',
    })
    if (backdating !== undefined) {
      base.push({
        key: 'backdate',
        label: 'Backdated',
        to: `Logged: ${backdating.actorId ?? 'no actor'} · ${backdating.originalDate ?? 'no original date'} · ${backdating.reason ?? 'no reason'}`,
      })
    }
  }

  if (to === RENEWAL_STATES.lapsed) {
    if (lapseReason.trim() === '') return []
    base.push({ key: 'reason', label: 'Reason', to: lapseReason.trim() })
    base.push({ key: 'winback', label: 'Next', to: 'The win-back list is worked from this reason' })
  }

  if (to === RENEWAL_STATES.winBackList) {
    base.push({
      key: 'reason',
      label: 'Lapse reason carried',
      to: task.lapseReason ?? 'None recorded',
    })
  }

  return base
}

function buildActions(input: ActionInput): readonly MachineAction[] {
  const { task, desk, actorId, leadDays, now, reminder, renewedTerm, backdating, lapseReason, commit } =
    input

  return renewalTaskMachine.targetsFrom(task.state).map((to) => {
    const copy = copyFor(to)
    const verdict = renewalTaskMachine.canTransition(task.state, to, contextFor(input, to))

    return {
      key: `${task.state}-to-${to}`,
      label: copy.label,
      icon: copy.icon,
      ...(copy.variant === undefined ? {} : { variant: copy.variant }),
      verdict,
      confirmTitle: `${copy.label} — ${task.policyId}`,
      confirmLabel: copy.confirmLabel,
      receipt: copy.receipt,
      changes: changesFor(input, to),
      note: noteFor(to, input),
      run: () =>
        void commit(to, () => {
          switch (to) {
            case RENEWAL_STATES.inPool:
              return desk.toPool(task.id, { actorId, leadDays: leadDays ?? -1, now })
            case RENEWAL_STATES.assigned:
              return desk.assign(task.id, {
                actorId,
                assigneeId: actorId,
                selfAssigned: true,
                leadDays: leadDays ?? -1,
                now,
              })
            case RENEWAL_STATES.reminded:
              return desk.remind(task.id, { actorId, reminder, now })
            case RENEWAL_STATES.renewed:
              return desk.renew(task.id, {
                actorId,
                renewedTerm,
                ...(backdating === undefined ? {} : { backdating }),
                now,
              })
            case RENEWAL_STATES.lapsed:
              return desk.lapse(task.id, { actorId, lapseReason: lapseReason.trim(), now })
            default:
              return desk.winBack(task.id, { actorId, now })
          }
        }),
    }
  })
}

function noteFor(to: RenewalState, input: ActionInput): string {
  switch (to) {
    case RENEWAL_STATES.assigned:
      return 'Renewals are taken from the pool by the person who will work them, never pushed onto them. Ownership is recorded against you the moment you confirm.'
    case RENEWAL_STATES.reminded:
      return `${input.customerName} receives the amounts year by year alongside the current offers. The reminder can be sent again; each send is counted.`
    case RENEWAL_STATES.renewed:
      return 'A new term is a new document version and a recalculated commission chain. Last year’s PDF is untouched.'
    case RENEWAL_STATES.lapsed:
      return `The reason is compulsory. ${CONTINUITY_AT_RISK}`
    case RENEWAL_STATES.winBackList:
      return 'The lapse and its reason travel with the record, so the win-back conversation starts from what actually happened.'
    default:
      return 'The lead time comes from the renewal recipe in configuration, not from this screen.'
  }
}

function receiptFor(to: RenewalState): string {
  return copyFor(to).receipt
}

function nameOf(users: readonly StaffUser[], id: string | null): string {
  if (id === null) return 'Unassigned'
  return users.find((user) => user.id === id)?.name ?? id
}

function ownerLabel(users: readonly StaffUser[], assigneeId: string | null): string {
  return assigneeId === null ? 'In the pool — nobody has taken it' : nameOf(users, assigneeId)
}
