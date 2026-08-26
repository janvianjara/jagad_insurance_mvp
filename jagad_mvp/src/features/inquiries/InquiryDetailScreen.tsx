import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import type { ButtonVariant } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { IconName } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Textarea } from '../../ui/form'
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
  SOURCE_LABEL,
  buildTrail,
  isClockRunning,
  readTat,
} from './inquiry-view'
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
    const [categories, users, recipes, agents] = await Promise.all([
      repositories.config.categories(),
      repositories.config.users(),
      repositories.config.recipes(),
      repositories.agents.list({ page: 1, pageSize: 200 }),
    ])
    return { categories, users, recipes, agents: agents.rows }
  }, 'inquiries:detail-context')

  const loaded = useResource(() => intake.get(id), `inquiry:${id}`)

  /** What the last committed move produced. Keyed by id so a navigation cannot inherit it. */
  const [written, setWritten] = useState<{ id: string; record: Inquiry; events: DomainEvent[] } | null>(
    null,
  )
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [lostReason, setLostReason] = useState('')

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

  const { categories, users, recipes, agents } = context.data
  const category = categoryOf(inquiry, categories)
  const tatMinutes = tatMinutesFor(inquiry, categories)
  const tat = readTat(inquiry, now, tatMinutes)
  const routing = planRouting(inquiry, categories, users)
  const escalation = planEscalation(recipes)
  const mayAct = can(user, 'assign', 'inquiries')

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
  })

  const armedAction = actions.find((action) => action.key === armed) ?? null

  const facts: readonly { key: string; label: string; value: ReactNode }[] = [
    { key: 'mobile', label: 'Mobile', value: inquiry.contactMobile },
    { key: 'source', label: 'Source', value: SOURCE_LABEL[inquiry.source] },
    { key: 'category', label: 'Category', value: category?.label ?? 'No category matched' },
    { key: 'owner', label: 'Owner', value: nameOf(users, inquiry.ownerId) },
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
        breadcrumb={<Link to="/inquiries">Inquiries</Link>}
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
            <Panel title="What happens next" description="Every move here goes through the workflow machine. A refused move writes nothing and says why.">
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
                    onCancel={() => setArmed(null)}
                    onConfirm={() => void commit(armedAction.key, armedAction.run)}
                  />
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Assignment trail"
              description="Every event on this record, oldest first. An escalation carries the whole trail with it."
            >
              <AssignmentTrail
                entries={buildTrail({ inquiry, users, tatMinutes, events })}
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

type DetailAction = {
  readonly key: string
  readonly label: string
  readonly icon: IconName
  readonly variant?: ButtonVariant
  readonly confirmTitle: string
  readonly confirmLabel?: string
  readonly changes: readonly ConfirmChange[]
  readonly note: ReactNode
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
}

function receiptFor(key: string): string {
  const receipts: Readonly<Record<string, string>> = {
    route: 'Routed. The assignee has been notified and their clock has started.',
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
    if (routing.ok) {
      const ctx = previewContext(input, {
        nextOwnerId: routing.assignee.id,
        nextOwnerCategoryGroupId: routing.category.id,
        routingMatchFound: true,
        tatMinutes: routing.tatMinutes,
      })
      list.push({
        key: 'route',
        label: 'Run routing',
        icon: 'users',
        variant: 'primary',
        confirmTitle: `Route ${inquiry.systemNo} to ${routing.assignee.name}`,
        confirmLabel: 'Route and notify',
        changes: [
          { key: 'owner', label: 'Owner', from: owner, to: routing.assignee.name },
          { key: 'status', label: 'Status', from: INQUIRY_LABEL[status], to: 'Assigned' },
          {
            key: 'tat',
            label: 'Turnaround',
            to: `${routing.tatMinutes} minutes, from the ${routing.category.label} category`,
          },
        ],
        note: `${routing.assignee.name} is notified and the clock starts now. The allowance comes from configuration, not from this screen.`,
        verdict: ask(status, 'assigned', ctx),
        run: () =>
          intake.assign(inquiry.id, {
            actorId,
            nextOwnerId: routing.assignee.id,
            nextOwnerCategoryGroupId: routing.category.id,
            tatMinutes: routing.tatMinutes,
            routingMatchFound: true,
            teamId: routing.category.teamId,
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
        note: routing.reason,
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
