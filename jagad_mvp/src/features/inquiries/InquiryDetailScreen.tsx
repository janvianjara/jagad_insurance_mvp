import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { canTransitionInquiry } from '../../domain/workflows'
import type { InquiryContext, InquiryState, TransitionResult } from '../../domain/workflows'
import type { DomainEvent } from '../../domain/events'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { AssignmentTrail } from '../../components/AssignmentTrail'
import { PageHeader } from '../../components/AppShell'
import { ConfirmGate } from '../../components/guardrails'
import { RecordCorrection } from '../../components/RecordCorrection'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import type { ButtonVariant } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { IconName } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Select, Textarea } from '../../ui/form'
import { Clock, StatusPill } from '../../ui/signal'
import { Panel } from '../../ui/surface'
import { useToaster } from '../../ui/surface'
import { KeyValueList, RecordId } from '../../ui/type'
import type { Inquiry, InquiryCategory, MutationResult, StaffUser } from '../../data/repo'
import { useInquiryNow } from './clock'
import { DevClock } from './DevClock'
import { inquiryIntake } from './data/intake'
import type { IntakeRepository } from './data/intake'
import {
  INQUIRY_LABEL,
  INQUIRY_TONE,
  referrerLabel,
  SOURCE_LABEL,
  buildTrail,
  isClockRunning,
  readTat,
} from './inquiry-view'
import { LogActivityPanel } from './LogActivityPanel'
import { RequirementPanel } from './RequirementPanel'
import { requirementObjectKey } from './requirement-view'
import { categoryOf, nameOf, planEscalation, planRouting, tatMinutesFor } from './routing'
import styles from './InquiryDetail.module.css'

const MINUTE_MS = 60_000

/**
 * Inquiry detail — plan §5 row 2, canvas 1.1 to 1.6.
 *
 * The screen is the §9 machine with a face on it. Every control below maps to one
 * edge of `inquiryMachine`, and none of them writes a status: they call the
 * repository, which asks the machine, which either allows the move or refuses
 * with a sentence written for the person reading it. That sentence is what a
 * blocked action shows — never "action failed", because the whole reason §9
 * carries prose refusals is so nobody has to phone a developer to find out which
 * rule fired.
 *
 * Three things on this screen are the §9 bullets made visible:
 *
 *   - the trail shows every event and, on an escalation, the full assignment
 *     history it carried rather than a link to it;
 *   - reassignment is proposed only inside the category group, so the screen
 *     never offers a move the machine is about to refuse;
 *   - unrouted is an alert on the record itself, not an absence somewhere else.
 *
 * The turnaround allowance is read from the inquiry's category, which an admin
 * edits. There is no minute count in this file.
 */
export function InquiryDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const now = useInquiryNow()
  const intake = inquiryIntake(repositories)

  const context = useResource(async () => {
    const [categories, users, recipes, agents, dispositions, stages, customers] =
      await Promise.all([
        repositories.config.categories(),
        repositories.config.users(),
        repositories.config.recipes(),
        repositories.agents.list({ page: 1, pageSize: 200 }),
        repositories.config.dispositions(),
        repositories.config.inquiryStages(),
        // Only to name a referrer. A referral attributed to an id nobody can
        // read is the same problem the attribution was added to solve.
        repositories.customers.list({ page: 1, pageSize: 200 }),
      ])
    return {
      categories,
      users,
      recipes,
      agents: agents.rows,
      dispositions,
      stages,
      customers: customers.rows,
    }
  }, 'inquiries:detail-context')

  /** Bumped after a logged contact, so the timeline and the facts re-read. */
  const [engagementSeq, setEngagementSeq] = useState(0)

  const loaded = useResource(() => intake.get(id), `inquiry:${id}:${engagementSeq}`)
  const contacts = useResource(
    () => repositories.activities.forSubject('Inquiry', id),
    `inquiry:${id}:activities:${engagementSeq}`,
  )
  const requirement = useResource(
    () => repositories.requirements.forInquiry(id),
    `inquiry:${id}:requirement:${engagementSeq}`,
  )

  /** What the last committed move produced. Keyed by id so a navigation cannot inherit it. */
  const [written, setWritten] = useState<{ id: string; record: Inquiry; events: DomainEvent[] } | null>(
    null,
  )
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [lostReason, setLostReason] = useState('')
  /** Who the person on this screen named. Empty means they left it to routing. */
  const [assignToId, setAssignToId] = useState('')

  const fresh = written && written.id === id ? written : null
  const inquiry = fresh?.record ?? loaded.data ?? null
  const events = fresh?.events ?? []

  if (!user || !context.data || (loaded.isLoading && !inquiry)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (!inquiry) {
    return (
      <EmptyState
        variant="error"
        title="No inquiry answers to that address"
        explanation={`Nothing is stored under ${id}. It may have been captured in another session, or the link may be wrong.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/inquiries')}>
            Back to the queue
          </Button>
        }
      />
    )
  }

  const { categories, users, recipes, agents, dispositions, stages, customers } = context.data
  const activities = contacts.data ?? []
  const category = categoryOf(inquiry, categories)
  const tatMinutes = tatMinutesFor(inquiry, categories)
  const tat = readTat(inquiry, now, tatMinutes)
  const routing = planRouting(inquiry, categories, users)
  const escalation = planEscalation(recipes)
  const mayAct = can(user, 'assign', 'inquiries')
  /**
   * Logging a contact is `edit`, not `assign`.
   *
   * Assigning hands work to somebody else and is a manager's move; ringing the
   * customer is the work itself, and the agent who owns the lead has to be able
   * to record it. Gating both on the same grant would have left an agent able to
   * own an inquiry and unable to say they had spoken to anybody — which is the
   * silence this whole layer exists to end.
   */
  const mayLog = can(user, 'edit', 'inquiries')

  async function commit(key: string, run: () => Promise<MutationResult<Inquiry>>) {
    const outcome = await run()
    if (!outcome.ok) {
      // The machine's own words. Nothing was written.
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
    setAssignToId('')
    toaster.notify({ title: receiptFor(key), tone: 'ok' })

    // The one move that leads somewhere else: converting opens the composer with
    // this inquiry as its origin (P-13's entry point).
    if (key === 'convert') void navigate(`/quotations/new?inquiry=${id}`)
  }

  const actions = buildActions({
    inquiry,
    users,
    category,
    tatMinutes,
    routing,
    escalation,
    now,
    actorId: user.id,
    intake,
    lostReason,
    assignToId,
  })

  const armedAction = actions.find((action) => action.key === armed) ?? null

  const facts: readonly { key: string; label: string; value: ReactNode }[] = [
    { key: 'mobile', label: 'Mobile', value: inquiry.contactMobile },
    { key: 'source', label: 'Source', value: SOURCE_LABEL[inquiry.source] },
    ...(inquiry.referral === null
      ? []
      : [
          {
            key: 'referrer',
            label: 'Referred by',
            value: referrerLabel(inquiry, { customers, agents, users }) ?? '',
          },
        ]),
    { key: 'category', label: 'Category', value: category?.label ?? 'No category matched' },
    { key: 'owner', label: 'Owner', value: nameOf(users, inquiry.ownerId) },
    {
      key: 'agent',
      label: 'Agent',
      value:
        inquiry.agentId === null
          ? 'Not attached to an agent'
          : (agents.find((agent) => agent.id === inquiry.agentId)?.name ?? inquiry.agentId),
    },
    {
      key: 'subAgent',
      label: 'Sub-agent',
      value:
        inquiry.subAgentId === null
          ? 'Not captured by a sub-agent'
          : (agents.find((agent) => agent.id === inquiry.subAgentId)?.name ?? inquiry.subAgentId),
    },
    {
      key: 'tat',
      label: 'Turnaround allowance',
      value:
        tatMinutes === null
          ? 'No category, so no allowance is set'
          : `${tatMinutes} minutes, from the ${category?.label} category in configuration`,
    },
    { key: 'escalations', label: 'Escalations', value: String(inquiry.escalationLevel) },
  ]

  return (
    <>
      <PageHeader
        backTo={{ to: '/inquiries', label: 'Inquiries' }}
        title={inquiry.contactName}
        meta={
          <>
            <RecordId systemNo={inquiry.systemNo} showInsurer={false} />
            <StatusPill tone={INQUIRY_TONE[inquiry.status]}>
              {INQUIRY_LABEL[inquiry.status]}
            </StatusPill>
            {isClockRunning(inquiry) && inquiry.assignedAt !== null && tatMinutes !== null ? (
              <Clock
                mode="tat"
                label="TAT"
                emphasis="strong"
                start={inquiry.assignedAt}
                now={now}
                durationMs={tatMinutes * MINUTE_MS}
              />
            ) : (
              <span className={styles.stopped}>clock stopped</span>
            )}
          </>
        }
      />

      <div className={styles.screen}>
        <DevClock />

        {/*
          * Correcting and discarding, at the top of the record.
          *
          * A mistyped mobile number is the commonest thing wrong with an
          * inquiry and it used to have no way out of the record at all. The
          * banner for a discarded lead renders here too, above everything the
          * screen otherwise says, because a discarded record that reads like a
          * live one is the defect this whole affordance would introduce.
          */}
        <RecordCorrection
          entity="Inquiry"
          resource="inquiries"
          record={inquiry}
          subject={inquiry.systemNo}
          noun="inquiry"
          amend={(command) => intake.amend(inquiry.id, command)}
          discard={(command) => intake.discard(inquiry.id, command)}
          restore={(command) => intake.restore(inquiry.id, command)}
          onWritten={(next) =>
            setWritten((previous) => ({
              id,
              record: next,
              events: previous && previous.id === id ? previous.events : [],
            }))
          }
        />

        {inquiry.status === 'unrouted' ? (
          <div className={styles.unrouted} role="alert">
            <Icon name="alert" size="md" />
            <div>
              <p className={styles.unroutedTitle}>Unrouted — the admin has been alerted</p>
              <p className={styles.unroutedNote}>
                {routing.ok
                  ? 'A category has since been set, so this can be routed by hand from the actions below.'
                  : routing.reason}
              </p>
            </div>
          </div>
        ) : null}

        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        <div className={styles.columns}>
          <div className={styles.main}>
            <Panel title="What happens next">
              {actions.length === 0 ? (
                <p className={styles.none}>
                  This inquiry is in a final state. Nothing further moves from{' '}
                  {INQUIRY_LABEL[inquiry.status].toLowerCase()}.
                </p>
              ) : (
                <ul className={styles.actions}>
                  {actions.map((action) => (
                    <li key={action.key} className={styles.action}>
                      <Button
                        variant={action.variant ?? 'quiet'}
                        icon={action.icon}
                        disabled={!mayAct || !action.verdict.ok}
                        aria-describedby={action.verdict.ok ? undefined : `${action.key}-blocked`}
                        onClick={() => {
                          setRefusal(null)
                          setArmed(action.key)
                        }}
                      >
                        {action.label}
                      </Button>
                      {action.verdict.ok ? null : (
                        <p className={styles.blocked} id={`${action.key}-blocked`}>
                          {action.verdict.reason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {armedAction ? (
                <div className={styles.gate}>
                  {armedAction.choice ? (
                    <Field label={armedAction.choice.label} hint={armedAction.choice.hint}>
                      <Select
                        value={assignToId}
                        placeholder={armedAction.choice.emptyLabel}
                        options={armedAction.choice.options}
                        onChange={(event) => setAssignToId(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  {armedAction.key === 'lost' ? (
                    <Field
                      label="Why was this lost"
                      required
                      hint="Compulsory. Lost-reason reporting is only worth reading when this is filled in."
                    >
                      <Textarea
                        value={lostReason}
                        rows={2}
                        onChange={(event) => setLostReason(event.target.value)}
                      />
                    </Field>
                  ) : null}
                  <ConfirmGate
                    title={armedAction.confirmTitle}
                    changes={armedAction.changes}
                    note={armedAction.note}
                    confirmLabel={armedAction.confirmLabel ?? armedAction.label}
                    receipt={receiptFor(armedAction.key)}
                    onCancel={() => {
                      setArmed(null)
                      setAssignToId('')
                    }}
                    onConfirm={() => void commit(armedAction.key, armedAction.run)}
                  />
                </div>
              ) : null}
            </Panel>

            {/*
              * The contact panel sits above the trail because it is the thing a
              * person opens this screen to do. The machine actions above it move
              * the inquiry between lifecycle states; this moves it through the
              * conversation, which is where an accepted inquiry actually spends
              * its life.
              */}
            {inquiry.status === 'accepted' ? (
              <LogActivityPanel
                inquiry={inquiry}
                dispositions={dispositions}
                stages={stages}
                now={now}
                actorId={user.id}
                canLog={mayLog}
                onLog={(command) => intake.logEngagement(inquiry.id, command)}
                onRecycle={(command) => intake.recycle(inquiry.id, command)}
                onLogged={() => setEngagementSeq((seq) => seq + 1)}
              />
            ) : null}

            {/*
              * What they need, next to what was said. The composer opens from
              * this record, so it belongs on the screen where the conversation
              * is happening rather than behind a link somebody has to know about.
              */}
            {inquiry.status === 'accepted' ? (
              <RequirementPanel
                inquiry={inquiry}
                category={category}
                requirement={requirement.data ?? null}
                canCapture={mayLog}
                onCapture={(submission) =>
                  repositories.requirements.capture({
                    actorId: user.id,
                    inquiryId: inquiry.id,
                    formSchemaId: submission.schemaId,
                    objectKey:
                      category === null ? '' : requirementObjectKey(category.line),
                    schemaVersion: submission.schemaVersion,
                    values: submission.values,
                    now,
                  })
                }
                onCaptured={() => setEngagementSeq((seq) => seq + 1)}
              />
            ) : null}

            <Panel
              title="Assignment trail"
            >
              <AssignmentTrail
                entries={buildTrail({
                  inquiry,
                  users,
                  tatMinutes,
                  events,
                  activities,
                  dispositions,
                  customers,
                  agents,
                })}
                now={now}
              />
            </Panel>
          </div>

          <div className={styles.side}>
            <Panel title="The record" level={3}>
              <KeyValueList items={facts} columns={1} />
            </Panel>

            {inquiry.notes ? (
              <Panel title="Note" level={3}>
                <p className={styles.note}>{inquiry.notes}</p>
              </Panel>
            ) : null}

            {tat.running ? (
              <Panel title="Turnaround" level={3}>
                <p className={styles.tatLine}>
                  {tat.breached
                    ? 'The allowance has run out. This inquiry reassigns rather than accepting.'
                    : 'The clock is running. A confirmation inside the allowance accepts it.'}
                </p>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

export default InquiryDetailScreen

/* ------------------------------------------------------------------ actions */

/**
 * A person to hand the inquiry to, offered inside the gate.
 *
 * It lives with the action rather than beside the button because the preview
 * underneath has to answer for it: change the person and the gate redraws what
 * it is about to write, which is the only reason previewing is worth doing.
 */
type DetailChoice = {
  readonly label: string
  readonly emptyLabel: string
  readonly hint: ReactNode
  readonly options: readonly { readonly value: string; readonly label: string }[]
}

type DetailAction = {
  readonly key: string
  readonly label: string
  readonly icon: IconName
  readonly variant?: ButtonVariant
  readonly confirmTitle: string
  readonly confirmLabel?: string
  readonly changes: readonly ConfirmChange[]
  readonly note: ReactNode
  readonly choice?: DetailChoice
  /** The machine's answer, asked before the control is drawn. */
  readonly verdict: TransitionResult
  readonly run: () => Promise<MutationResult<Inquiry>>
}

type ActionInput = {
  readonly inquiry: Inquiry
  readonly users: readonly StaffUser[]
  readonly category: InquiryCategory | null
  readonly tatMinutes: number | null
  readonly routing: ReturnType<typeof planRouting>
  readonly escalation: ReturnType<typeof planEscalation>
  readonly now: Date
  readonly actorId: string
  readonly intake: IntakeRepository
  readonly lostReason: string
  /** The person named on the screen. Empty means nobody said, so routing decides. */
  readonly assignToId: string
}

/**
 * Who this inquiry goes to, and under what allowance.
 *
 * A person named on the screen wins over routing's pick. Canvas 1.1 still holds
 * — routing assigns when nobody says otherwise — but a name typed by somebody
 * looking at the record is not a lesser answer than the recipe's, and making
 * them run routing first only to reassign afterwards is two moves for one
 * decision.
 *
 * The allowance is not part of the choice. It comes from the inquiry's own
 * category either way, so naming somebody on an inquiry with no category buys
 * nothing: there is no allowance to measure them against, and routing's refusal
 * still stands. §9 holds no default and neither does this screen.
 */
function assignmentTarget(input: ActionInput): {
  readonly assignee: StaffUser
  readonly categoryId: string
  readonly categoryLabel: string
  readonly teamId: string | undefined
  readonly tatMinutes: number
  readonly manual: boolean
} | null {
  const { assignToId, users, category, routing } = input

  if (assignToId !== '' && category) {
    const person = users.find((entry) => entry.id === assignToId && entry.active)
    if (person) {
      return {
        assignee: person,
        categoryId: category.id,
        categoryLabel: category.label,
        teamId: category.teamId,
        tatMinutes: category.tatMinutes,
        manual: true,
      }
    }
  }

  if (routing.ok) {
    return {
      assignee: routing.assignee,
      categoryId: routing.category.id,
      categoryLabel: routing.category.label,
      teamId: routing.category.teamId,
      tatMinutes: routing.tatMinutes,
      manual: false,
    }
  }

  return null
}

function receiptFor(key: string): string {
  const receipts: Readonly<Record<string, string>> = {
    route: 'Assigned. They have been notified and their clock has started.',
    unroute: 'Moved to unrouted. The admin alert went with it.',
    accept: 'Accepted. They own it and the clock has stopped.',
    reassign: 'Reassigned to the next person in the category. Both have been notified.',
    escalate: 'Escalated with the full assignment history.',
    convert: 'Converted. A quotation can open from here.',
    lost: 'Marked lost with the reason recorded.',
  }
  return receipts[key] ?? 'Recorded.'
}

/** The context the repository will hand the machine, built here so the screen can ask first. */
function previewContext(input: ActionInput, extra: Partial<InquiryContext>): InquiryContext {
  const { inquiry, now } = input
  return {
    now,
    assignedAt: inquiry.assignedAt ?? undefined,
    categoryGroupId: inquiry.categoryId ?? undefined,
    assignmentHistory: inquiry.assignmentHistory,
    ...extra,
  }
}

function ask(from: InquiryState, to: InquiryState, ctx: InquiryContext): TransitionResult {
  return canTransitionInquiry(from, to, ctx)
}

function buildActions(input: ActionInput): readonly DetailAction[] {
  const { inquiry, users, tatMinutes, routing, escalation, now, actorId, intake, lostReason } = input
  const status = inquiry.status
  const owner = nameOf(users, inquiry.ownerId)
  const list: DetailAction[] = []

  if (status === 'new' || status === 'unrouted') {
    const target = assignmentTarget(input)
    if (target) {
      const ctx = previewContext(input, {
        nextOwnerId: target.assignee.id,
        nextOwnerCategoryGroupId: target.categoryId,
        routingMatchFound: true,
        tatMinutes: target.tatMinutes,
      })
      const suggestion = routing.ok ? routing.assignee.name : null
      list.push({
        key: 'route',
        label: 'Assign',
        icon: 'users',
        variant: 'primary',
        confirmTitle: `Assign ${inquiry.systemNo} to ${target.assignee.name}`,
        confirmLabel: 'Assign and notify',
        choice: {
          label: 'Assign to',
          emptyLabel:
            suggestion === null ? 'Nobody yet' : `${suggestion} — routing's pick`,
          hint:
            suggestion === null
              ? 'Routing has nobody to suggest for this one, so name somebody.'
              : `Leave it alone and routing's pick stands. Anyone active can take it; from here on it only moves to the next person when the allowance runs out.`,
          options: users
            .filter((person) => person.active)
            .map((person) => ({ value: person.id, label: person.name })),
        },
        changes: [
          { key: 'owner', label: 'Owner', from: owner, to: target.assignee.name },
          { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Assigned' },
          {
            key: 'tat',
            label: 'Turnaround',
            to: `${target.tatMinutes} minutes, from the ${target.categoryLabel} category`,
          },
        ],
        note: target.manual
          ? `${target.assignee.name} is notified and the clock starts now. The allowance comes from the ${target.categoryLabel} category in configuration, not from this screen, and it only moves on to somebody else if that allowance runs out.`
          : `${target.assignee.name} is notified and the clock starts now. The allowance comes from configuration, not from this screen.`,
        verdict: ask(status, 'assigned', ctx),
        run: () =>
          intake.assign(inquiry.id, {
            actorId,
            nextOwnerId: target.assignee.id,
            nextOwnerCategoryGroupId: target.categoryId,
            tatMinutes: target.tatMinutes,
            routingMatchFound: true,
            ...(target.teamId === undefined ? {} : { teamId: target.teamId }),
            now,
          }),
      })
    } else if (status === 'new') {
      const ctx = previewContext(input, { routingMatchFound: false, adminAlertRaised: true })
      list.push({
        key: 'unroute',
        label: 'Send to unrouted and alert the admin',
        icon: 'inbox',
        variant: 'primary',
        confirmTitle: `Park ${inquiry.systemNo} in the unrouted queue`,
        confirmLabel: 'Park and alert',
        changes: [
          { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Unrouted' },
          { key: 'alert', label: 'Admin alert', to: 'Raised with the move' },
        ],
        note: routing.ok
          ? 'Routing has a match for this one, so parking it is a deliberate override.'
          : routing.reason,
        verdict: ask(status, 'unrouted', ctx),
        run: () =>
          intake.markUnrouted(inquiry.id, { actorId, adminAlertRaised: true, now }),
      })
    }
  }

  if (status === 'assigned' || status === 'reassigned') {
    const confirmedAt = now.toISOString()
    const acceptCtx = previewContext(input, {
      confirmedAt,
      ...(tatMinutes === null ? {} : { tatMinutes }),
    })
    list.push({
      key: 'accept',
      label: 'Confirm and accept',
      icon: 'check',
      variant: 'primary',
      confirmTitle: `${owner} accepts ${inquiry.systemNo}`,
      confirmLabel: 'Confirm',
      changes: [
        { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Accepted' },
        { key: 'owner', label: 'Owner', to: owner },
        { key: 'clock', label: 'Turnaround clock', from: 'Running', to: 'Stopped' },
      ],
      note: 'Confirming inside the allowance is what accepts an inquiry. After the allowance it reassigns instead, and the machine says so.',
      verdict: ask(status, 'accepted', acceptCtx),
      run: () =>
        intake.accept(inquiry.id, {
          actorId,
          confirmedAt,
          tatMinutes: tatMinutes ?? 0,
          now,
        }),
    })
  }

  if (status === 'assigned' && routing.ok) {
    const ctx = previewContext(input, {
      nextOwnerId: routing.assignee.id,
      nextOwnerCategoryGroupId: routing.category.id,
      ...(tatMinutes === null ? {} : { tatMinutes }),
    })
    list.push({
      key: 'reassign',
      label: 'Auto-reassign to the next person',
      icon: 'sort',
      confirmTitle: `Reassign ${inquiry.systemNo} to ${routing.assignee.name}`,
      confirmLabel: 'Reassign and notify',
      changes: [
        { key: 'owner', label: 'Owner', from: owner, to: routing.assignee.name },
        { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Reassigned' },
        { key: 'group', label: 'Category group', to: `${routing.category.label} — unchanged` },
      ],
      note: `${owner} and ${routing.assignee.name} are both notified. Reassignment stays inside the ${routing.category.label} group.`,
      verdict: ask(status, 'reassigned', ctx),
      run: () =>
        intake.reassign(inquiry.id, {
          actorId,
          nextOwnerId: routing.assignee.id,
          nextOwnerCategoryGroupId: routing.category.id,
          tatMinutes: routing.tatMinutes,
          now,
        }),
    })
  }

  if (status === 'reassigned' && escalation.ok) {
    const ctx = previewContext(input, { ...(tatMinutes === null ? {} : { tatMinutes }) })
    const manager = nameOf(users, escalation.toUserId)
    list.push({
      key: 'escalate',
      label: 'Escalate with the full history',
      icon: 'alert',
      variant: 'danger',
      confirmTitle: `Escalate ${inquiry.systemNo} to ${manager}`,
      confirmLabel: 'Escalate',
      changes: [
        { key: 'owner', label: 'Owner', from: owner, to: manager },
        { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Escalated' },
        {
          key: 'history',
          label: 'Assignment history carried',
          to: `${inquiry.assignmentHistory.length} holders, in full`,
        },
      ],
      note: `${manager} receives the whole trail — who held it, for how long, and why each handover happened — not just the item.`,
      verdict: ask(status, 'escalated', ctx),
      run: () =>
        intake.escalate(inquiry.id, {
          actorId,
          toUserId: escalation.toUserId,
          tatMinutes: tatMinutes ?? 0,
          now,
        }),
    })
  }

  if (status === 'accepted') {
    list.push({
      key: 'convert',
      label: 'Convert to quotation',
      icon: 'doc',
      variant: 'primary',
      confirmTitle: `Convert ${inquiry.systemNo} into a quotation`,
      confirmLabel: 'Convert',
      changes: [
        { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Converted' },
        { key: 'next', label: 'Next', to: 'The quotation composer opens with this customer' },
      ],
      note: 'The inquiry stays as the record of where the quotation came from.',
      verdict: ask(status, 'converted', previewContext(input, {})),
      run: () => intake.convert(inquiry.id, { actorId, now }),
    })

    list.push({
      key: 'lost',
      label: 'Mark lost',
      icon: 'close',
      confirmTitle: `Mark ${inquiry.systemNo} lost`,
      confirmLabel: 'Mark lost',
      changes:
        lostReason.trim() === ''
          ? []
          : [
              { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Lost' },
              { key: 'reason', label: 'Reason', to: lostReason.trim() },
            ],
      note: 'The reason is compulsory and is what makes lost-reason reporting worth reading.',
      verdict: ask(status, 'lost', previewContext(input, { lostReason })),
      run: () => intake.markLost(inquiry.id, { actorId, lostReason, now }),
    })
  }

  return list
}
