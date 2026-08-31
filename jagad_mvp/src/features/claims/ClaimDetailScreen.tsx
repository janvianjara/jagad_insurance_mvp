import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { CLAIM_STATES, SETTLEMENT_SOURCES, claimMachine } from '../../domain/workflows'
import type { ClaimContext, ClaimState } from '../../domain/workflows'
import type { Money as Amount } from '../../domain/money'
import type { DomainEvent } from '../../domain/events'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { ChecklistPanel } from '../../components/ChecklistPanel'
import type { ChecklistItem } from '../../components/ChecklistPanel'
import { MachineActions } from '../../components/MachineActions'
import type { MachineAction } from '../../components/MachineActions'
import { RecordTimeline } from '../../components/RecordTimeline'
import { RecordOnlyAmount } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import type { IconName } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Input, Textarea } from '../../ui/form'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId } from '../../ui/type'
import type { Agent, Claim, ClaimSettlement, MutationResult, StaffUser } from '../../data/repo'
import {
  CLAIM_LABEL,
  CLAIM_TONE,
  CLAIM_TYPE_LABEL,
  outstandingChecklist,
  pipelineFor,
  pipelineIndex,
  planStatusMessage,
} from './claim-view'
import { newUploadToken, uploadDesk, uploadLinkHref } from '../upload'
import type { UploadDesk } from '../upload'
import { claimDesk } from './data/claim-desk'
import type { ClaimDeskRepository, StatusMessageLogEntry } from './data/claim-desk'
import { nameOfUser } from './queue-config'
import styles from './ClaimDetail.module.css'

/**
 * Claim detail — plan §5 "Claim queue + detail", canvas 4.1 to 4.9.
 *
 * The screen is `claimMachine` with a face on it. Every control below is one
 * edge leaving the claim's current state, and the list is built from
 * `claimMachine.targetsFrom` rather than written out by hand — so an edge the
 * machine has cannot be missing from the screen, and a control the screen offers
 * cannot be an edge the machine lacks.
 *
 * Four §9 bullets are visible here rather than merely enforced:
 *
 *   The fork is the pipeline. A cashless claim and a file claim walk different
 *   steps, so the stage strip renders the pipeline for THIS claim's type. There
 *   is no path on which the two are offered together.
 *
 *   Settlement is typed, never derived. Both figures enter through
 *   `<RecordOnlyAmount>` — a control with no default, no suggestion and no
 *   formula — and the insurer advice reference is recorded beside them, because
 *   the machine's guard asks where the figure came from as well as what it is.
 *
 *   Close needs both. A settlement without a company remark leaves Close
 *   disabled with §9's own sentence under it: the remark is what the insurer
 *   rating is built from, and an unremarked close costs the agency the data.
 *
 *   Every status change fires a customer message unless the agent's
 *   direct-updates toggle is off, in which case it reroutes to the agent — and
 *   the reroute is logged, on the claim, where somebody can see it.
 */
export function ClaimDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const desk = claimDesk(repositories)
  const uploads = uploadDesk(repositories)

  const context = useResource(async () => {
    const [users, agents] = await Promise.all([
      repositories.config.users(),
      repositories.agents.list({ page: 1, pageSize: 200 }),
    ])
    return { users, agents: agents.rows }
  }, 'claims:detail-context')

  const loaded = useResource(() => desk.get(id), `claim:${id}`)

  /** What the last committed move produced. Keyed by id so navigation cannot inherit it. */
  const [written, setWritten] = useState<{
    id: string
    record: Claim
    events: DomainEvent[]
    messages: StatusMessageLogEntry[]
  } | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [amount, setAmount] = useState<Amount | null>(null)
  const [deduction, setDeduction] = useState<Amount | null>(null)
  const [adviceRef, setAdviceRef] = useState('')
  const [remark, setRemark] = useState('')
  const [collected, setCollected] = useState<readonly string[] | null>(null)

  const fresh = written && written.id === id ? written : null
  const claim = fresh?.record ?? loaded.data ?? null
  const events = fresh?.events ?? []
  const messages = fresh?.messages ?? []

  const customer = useResource(
    () => (claim ? repositories.customers.get(claim.customerId) : Promise.resolve(null)),
    `claim-customer:${claim?.customerId ?? ''}`,
  )
  const policy = useResource(
    () => (claim ? repositories.policies.get(claim.policyId) : Promise.resolve(null)),
    `claim-policy:${claim?.policyId ?? ''}`,
  )
  /**
   * The upload ledger, which is what `dischargeSummaryReceived` reads. The screen
   * asks the same question the write will ask, so the control it draws and the
   * refusal it would get cannot disagree.
   */
  const uploaded = useResource(
    async () =>
      claim
        ? {
            link: await uploads.linkFor(claim.id),
            present: await uploads.presentDocTypes(claim.id),
          }
        : null,
    // Keyed off the claim's own id, not the route's: the loader reads `claim`,
    // which is null on the first render, and a key that did not change when it
    // arrived would cache that first empty answer forever.
    `claim-uploads:${claim?.id ?? ''}:${written?.events.length ?? 0}`,
  )

  if (!user || !context.data || (loaded.isLoading && !claim)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (!claim) {
    return (
      <EmptyState
        variant="error"
        title="No claim answers to that address"
        explanation={`Nothing is stored under ${id}. It may have been intimated in another session, or the link may be wrong.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/claims')}>
            Back to the queue
          </Button>
        }
      />
    )
  }

  const actorId = user.id
  const { users, agents } = context.data
  const agent = claim.agentId === null ? null : findAgent(agents, claim.agentId)
  const customerName = customer.data?.fullName ?? claim.customerId
  const plan = planStatusMessage(customerName, agent)
  const mayAct = can(user, 'edit', 'claims')

  const held = collected ?? claim.documentsCollected
  const typedSettlement: ClaimSettlement = {
    amount,
    deduction,
    source: SETTLEMENT_SOURCES.insurerAdvice,
    insurerAdviceRef: adviceRef.trim() === '' ? null : adviceRef.trim(),
  }

  async function commit(to: ClaimState, run: () => Promise<MutationResult<Claim>>) {
    const outcome = await run()
    if (!outcome.ok) {
      // The machine's own sentence. Nothing was written.
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was changed', detail: outcome.reason, tone: 'bad' })
      return
    }

    // FR-11's other half: the message went somewhere, and where it went is kept.
    const entry = await desk.logStatusMessage({
      claimId: id,
      state: to,
      to: plan.to,
      rerouteLogged: plan.rerouteLogged,
      note: plan.note,
    })

    setRefusal(null)
    setWritten((previous) => {
      const carried = previous && previous.id === id ? previous : null
      return {
        id,
        record: outcome.record,
        events: [...(carried?.events ?? []), ...outcome.events],
        messages: [...(carried?.messages ?? []), entry],
      }
    })
    setArmed(null)
    setCollected(null)
    toaster.notify({ title: `${CLAIM_LABEL[to]}. ${plan.note}`, tone: 'ok' })
  }

  const actions = buildActions({
    claim,
    desk,
    actorId,
    agent,
    customerName,
    policyActive: policy.data?.status === 'issued',
    policyStatus: policy.data ? policy.data.status.replace(/_/g, ' ') : 'not known',
    settlement: typedSettlement,
    remark,
    collected: held,
    presentDocTypes: uploaded.data?.present ?? [],
    uploads,
    planNote: plan.note,
    rerouted: plan.rerouteLogged,
    commit,
  })

  const pipeline = pipelineFor(claim.claimType)
  const reached = pipelineIndex(claim)
  const outstanding = outstandingChecklist({ ...claim, documentsCollected: held })

  const checklistItems: readonly ChecklistItem[] = claim.checklistItems.map((item) => ({
    key: item,
    label: item,
    state: held.includes(item) ? 'received' : 'outstanding',
  }))

  const facts: readonly { key: string; label: string; value: ReactNode }[] = [
    { key: 'customer', label: 'Customer', value: customerName },
    { key: 'policy', label: 'Policy', value: policy.data?.systemNo ?? claim.policyId },
    {
      key: 'policyState',
      label: 'Policy status',
      value: policy.data ? policy.data.status.replace(/_/g, ' ') : 'not known',
    },
    { key: 'type', label: 'Claim type', value: CLAIM_TYPE_LABEL[claim.claimType] },
    { key: 'owner', label: 'Owner', value: ownerLabel(users, claim.ownerId) },
    {
      key: 'agent',
      label: 'Sourcing agent',
      value: agent === null ? 'None linked' : `${agent.name} — informed, not the owner`,
    },
    {
      key: 'updates',
      label: 'Direct updates',
      value:
        agent === null
          ? 'No agent toggle applies'
          : agent.directUpdatesEnabled
            ? 'On — status messages go to the customer'
            : 'Off — status messages reroute to the agent',
    },
  ]

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/claims">Claims</Link>}
        title={customerName}
        meta={
          <>
            <RecordId systemNo={claim.systemNo} insurerNo={claim.insurerNo} />
            <StatusPill tone={CLAIM_TONE[claim.state]}>{CLAIM_LABEL[claim.state]}</StatusPill>
            <Badge tone="neutral" caps>
              {CLAIM_TYPE_LABEL[claim.claimType]}
            </Badge>
          </>
        }
      />

      <div className={styles.screen}>
        {claim.state === CLAIM_STATES.blocked ? (
          <div className={styles.alert} role="alert">
            <Icon name="alert" size="md" />
            <div>
              <p className={styles.alertTitle}>
                Blocked — the policy was not in force when this claim was raised
              </p>
              <p className={styles.alertNote}>
                Nothing was sent to the insurer.{' '}
                {agent === null
                  ? 'No sourcing agent is linked, so the claims desk carries this one.'
                  : `${agent.name} was notified to handle it with the customer.`}
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

        <Panel
          title="The claim pipeline"
          description={`A ${CLAIM_TYPE_LABEL[claim.claimType].toLowerCase()} claim walks these steps. The fork is the machine's, so the other route's steps are not offered here.`}
        >
          <ol className={styles.pipeline} aria-label="Claim pipeline">
            {pipeline.map((state, index) => (
              <li
                key={state}
                className={styles.stage}
                data-reached={index <= reached ? 'true' : 'false'}
                data-current={state === claim.state ? 'true' : 'false'}
              >
                <span className={styles.stageMark} aria-hidden="true" />
                <span className={styles.stageLabel}>{CLAIM_LABEL[state]}</span>
              </li>
            ))}
          </ol>
          {claim.state === CLAIM_STATES.queryOpen ? (
            <p className={styles.loop}>
              The insurer has raised a query. The loop back to filed can run as many times as the
              company asks, and the explanation goes to the customer and the hospital in the
              language they were spoken to in.
            </p>
          ) : null}
        </Panel>

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
                permissionNote="Your role can read this claim but not move it on. The claims desk owns the file."
                emptyText={`This claim is closed. Nothing further moves from ${CLAIM_LABEL[claim.state].toLowerCase()} — the settlement and the company remark are both on the record.`}
              />
            </Panel>

            {claim.checklistItems.length > 0 ? (
              <Panel
                title="Document checklist"
                description="Per company and product, from configuration. Documents collected by the customer or picked up on field are the same state either way."
              >
                <ChecklistPanel
                  items={checklistItems}
                  source={`${CLAIM_TYPE_LABEL[claim.claimType]} · ${policy.data?.systemNo ?? claim.policyId}`}
                  renderAction={(item) =>
                    held.includes(item.key) || !mayAct ? null : (
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => setCollected([...held, item.key])}
                      >
                        Record received
                      </Button>
                    )
                  }
                />
                {outstanding.length > 0 ? (
                  <p className={styles.outstanding}>
                    Still waiting on {outstanding.length}{' '}
                    {outstanding.length === 1 ? 'document' : 'documents'}. Marking documents
                    collected is refused until the checklist is complete.
                  </p>
                ) : null}
              </Panel>
            ) : null}

            {SETTLEMENT_STATES.includes(claim.state) ? (
              <Panel
                title="Settlement, from the insurer's advice"
                description="Both figures are typed off the advice. The platform never works a settlement out from the claimed amount, and there is nowhere on this form for it to try."
              >
                <div className={styles.entry}>
                  <RecordOnlyAmount
                    label="Settled amount"
                    value={amount}
                    onValueChange={setAmount}
                    required
                    hint="As the insurer's advice states it."
                  />
                  <RecordOnlyAmount
                    label="Deduction"
                    value={deduction}
                    onValueChange={setDeduction}
                    hint="As stated. Leave empty when the advice records none — empty is not zero."
                  />
                  <Field
                    label="Insurer advice reference"
                    required
                    hint="The document the two figures were read off. The machine asks for the provenance as well as the amount."
                  >
                    <Input
                      mono
                      value={adviceRef}
                      onChange={(event) => setAdviceRef(event.target.value)}
                    />
                  </Field>
                  <p className={styles.source}>
                    Source recorded as insurer advice. A figure marked derived is refused.
                  </p>
                </div>
              </Panel>
            ) : null}

            {claim.state === CLAIM_STATES.settlementRecorded ? (
              <Panel
                title="Company remark"
                description="What the insurer did and how they did it. This is what the agency's insurer rating is built from, so a close without one costs the data."
              >
                <Field
                  label="How did the company handle this claim"
                  required
                  hint="Compulsory. Close is refused until it is written."
                >
                  <Textarea
                    rows={3}
                    value={remark}
                    onChange={(event) => setRemark(event.target.value)}
                  />
                </Field>
              </Panel>
            ) : null}

            <Panel
              title="Record timeline"
              description="Every event on this claim, as the machine emitted it."
            >
              <RecordTimeline
                events={events}
                options={{ actorName: (actor) => (actor ? nameOfUser(users, actor) : 'System') }}
                emptyText="Nothing has been recorded against this claim in this session. Every move made from here appears in this list, with who made it and when."
              />
            </Panel>
          </div>

          <div className={styles.side}>
            <Panel title="The record" level={3}>
              <KeyValueList items={facts} columns={1} />
            </Panel>

            {uploaded.data?.link ? (
              <Panel
                title="The upload link"
                level={3}
                description="FR-11.1, D21: login-free, expiring, and for this claim only."
              >
                <p className={styles.uploadHref}>{uploadLinkHref(uploaded.data.link.token)}</p>
                <KeyValueList
                  columns={1}
                  items={[
                    {
                      key: 'closes',
                      label: 'Closes',
                      value: <DateTime value={uploaded.data.link.expiresAt} mode="datetime" />,
                    },
                    {
                      key: 'accepts',
                      label: 'Accepts',
                      value: uploaded.data.link.docTypes
                        .map((type) => type.replace(/_/g, ' '))
                        .join(', '),
                    },
                    {
                      key: 'taken',
                      label: 'Documents in',
                      value: `${uploaded.data.link.usedUploads} of ${uploaded.data.link.maxUploads}`,
                    },
                  ]}
                />
                <p className={styles.quiet}>
                  Presence is recorded, never the document itself. Nothing on this link is read into
                  the record beyond the file name.
                </p>
              </Panel>
            ) : null}

            <Panel
              title="Customer updates"
              level={3}
              description="FR-11: every status change fires a message."
            >
              <p className={styles.routing} data-route={plan.to} data-reroute={String(plan.rerouteLogged)}>
                {plan.note}
              </p>
              {messages.length === 0 ? (
                <p className={styles.quiet}>
                  No status message has been sent from this screen yet. Each move below sends one and
                  records where it went.
                </p>
              ) : (
                <ul className={styles.messages} aria-label="Status messages">
                  {messages.map((entry) => (
                    <li key={entry.id} className={styles.message}>
                      <span className={styles.messageState}>{CLAIM_LABEL[entry.state]}</span>
                      <Badge tone={entry.rerouteLogged ? 'warn' : 'ok'} caps>
                        {entry.rerouteLogged ? 'Rerouted to agent' : 'Sent to customer'}
                      </Badge>
                      {entry.rerouteLogged ? (
                        <span className={styles.messageNote}>Reroute logged</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {claim.settlement.amount === null ? null : (
              <Panel title="Settled" level={3}>
                <KeyValueList
                  columns={1}
                  items={[
                    {
                      key: 'amount',
                      label: 'Settled amount',
                      value: <Money paise={claim.settlement.amount.paise} />,
                    },
                    {
                      key: 'deduction',
                      label: 'Deduction',
                      value: <Money paise={claim.settlement.deduction?.paise ?? null} />,
                    },
                    {
                      key: 'source',
                      label: 'Source',
                      value: 'Insurer advice',
                    },
                    {
                      key: 'ref',
                      label: 'Advice reference',
                      value: claim.settlement.insurerAdviceRef ?? 'not recorded',
                    },
                  ]}
                />
              </Panel>
            )}

            {claim.companyRemark ? (
              <Panel title="Company remark" level={3}>
                <p className={styles.remark}>{claim.companyRemark}</p>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

export default ClaimDetailScreen

/* ------------------------------------------------------------------ actions */

/** States from which a settlement may be recorded, so the entry panel shows. */
const SETTLEMENT_STATES: readonly ClaimState[] = [
  CLAIM_STATES.tracked,
  CLAIM_STATES.filedWithInsurer,
]

type ActionInput = {
  readonly claim: Claim
  readonly desk: ClaimDeskRepository
  readonly actorId: string
  readonly agent: Agent | null
  readonly customerName: string
  readonly policyActive: boolean
  readonly policyStatus: string
  readonly settlement: ClaimSettlement
  readonly remark: string
  readonly collected: readonly string[]
  /** Read off the upload ledger, never asserted by the screen. */
  readonly presentDocTypes: readonly string[]
  readonly uploads: UploadDesk
  readonly planNote: string
  readonly rerouted: boolean
  readonly commit: (to: ClaimState, run: () => Promise<MutationResult<Claim>>) => Promise<void>
}

type EdgeCopy = {
  readonly label: string
  readonly icon: IconName
  readonly variant?: MachineAction['variant']
  readonly confirmLabel: string
  readonly receipt: string
}

/**
 * The wording for one edge. Keyed by both ends, because two edges land on
 * `settlement_recorded` and two leave `filed_with_insurer` — the target alone
 * does not say what the move is.
 */
function copyFor(from: ClaimState, to: ClaimState): EdgeCopy {
  const key = `${from}->${to}`
  switch (key) {
    case 'raised->intimated':
      return {
        label: 'Intimate to the insurer',
        icon: 'msg',
        variant: 'primary',
        confirmLabel: 'Intimate and notify',
        receipt: 'Intimated. The insurer has the claim number and the agent is copied.',
      }
    case 'raised->blocked':
      return {
        label: 'Block — the policy is not in force',
        icon: 'alert',
        variant: 'danger',
        confirmLabel: 'Block and notify the agent',
        receipt: 'Blocked, and the sourcing agent has been notified.',
      }
    case 'intimated->picked_up':
      return {
        label: 'Pick up',
        icon: 'users',
        variant: 'primary',
        confirmLabel: 'Pick up and inform the agent',
        receipt: 'Picked up. The claims team owns it; the agent has been informed.',
      }
    case 'picked_up->upload_link_sent':
      return {
        label: 'Send the tokenised upload link',
        icon: 'upload',
        variant: 'primary',
        confirmLabel: 'Send the link',
        receipt: 'Link sent. It is login-free and it expires.',
      }
    case 'picked_up->checklist_raised':
      return {
        label: 'Raise the document checklist',
        icon: 'doc',
        variant: 'primary',
        confirmLabel: 'Raise the checklist',
        receipt: 'Checklist raised for this company and product.',
      }
    case 'upload_link_sent->summary_received':
      return {
        label: 'Record the discharge summary',
        icon: 'doc',
        variant: 'primary',
        confirmLabel: 'Record it',
        receipt: 'Summary recorded against the claim.',
      }
    case 'summary_received->tracked':
      return {
        label: 'Track with the insurer',
        icon: 'clock',
        variant: 'primary',
        confirmLabel: 'Mark tracked',
        receipt: 'Tracked. The customer can watch it from their panel.',
      }
    case 'checklist_raised->docs_collected':
      return {
        label: 'Mark documents collected',
        icon: 'check',
        variant: 'primary',
        confirmLabel: 'Mark collected',
        receipt: 'Documents collected — by the customer or on field, the same state either way.',
      }
    case 'docs_collected->filed_with_insurer':
      return {
        label: 'Send the file to the company',
        icon: 'upload',
        variant: 'primary',
        confirmLabel: 'Send the file',
        receipt: 'Filed with the claim-manager contact on record.',
      }
    case 'filed_with_insurer->query_open':
      return {
        label: 'Record an insurer query',
        icon: 'alert',
        confirmLabel: 'Open the query',
        receipt: 'Query recorded. The loop is visible to the customer.',
      }
    case 'query_open->filed_with_insurer':
      return {
        label: 'Answer the query and re-file',
        icon: 'msg',
        variant: 'primary',
        confirmLabel: 'Send the explanation',
        receipt: 'Explanation sent and the file is back with the company.',
      }
    case 'settlement_recorded->closed':
      return {
        label: 'Close the claim',
        icon: 'check',
        variant: 'primary',
        confirmLabel: 'Close',
        receipt: 'Closed, with the settlement and the company remark both on the record.',
      }
    default:
      return {
        label: 'Record the settlement from the insurer advice',
        icon: 'coin',
        variant: 'primary',
        confirmLabel: 'Record the settlement',
        receipt: 'Settlement recorded exactly as the advice states it.',
      }
  }
}

/**
 * The context the repository will hand the machine, built here so the screen can
 * ask before it draws a control. One shape, so a screen cannot ask a different
 * question from the one the write will ask.
 */
function contextFor(input: ActionInput, to: ClaimState): ClaimContext {
  const { claim, settlement, remark, collected, policyActive, policyStatus } = input
  const recording = to === CLAIM_STATES.settlementRecorded
  const recorded = recording ? settlement : claim.settlement

  return {
    claimType: claim.claimType,
    policyActive,
    policyStatus,
    agentNotified: true,
    settlement: {
      ...(recorded.amount === null ? {} : { amount: recorded.amount }),
      ...(recorded.deduction === null ? {} : { deduction: recorded.deduction }),
      ...(recorded.source === null ? {} : { source: recorded.source }),
      ...(recorded.insurerAdviceRef === null
        ? {}
        : { insurerAdviceRef: recorded.insurerAdviceRef }),
    },
    companyRemark: remark.trim() === '' ? (claim.companyRemark ?? '') : remark.trim(),
    documentsCollected: collected,
    checklistItems: claim.checklistItems,
    presentDocTypes: input.presentDocTypes,
  }
}

function changesFor(input: ActionInput, to: ClaimState): readonly ConfirmChange[] {
  const { claim, agent, settlement, remark, collected, customerName } = input
  const base: ConfirmChange[] = [
    { key: 'status', label: 'Status', from: CLAIM_LABEL[claim.state], to: CLAIM_LABEL[to] },
  ]

  if (to === CLAIM_STATES.blocked) {
    base.push({ key: 'insurer', label: 'Insurer', to: 'Nothing is sent' })
    base.push({
      key: 'agent',
      label: 'Sourcing agent',
      to: agent === null ? 'None linked — the claims desk is alerted' : `${agent.name} notified`,
    })
  }

  if (to === CLAIM_STATES.pickedUp) {
    base.push({ key: 'owner', label: 'Owner', from: 'Unassigned', to: 'The claims team' })
    base.push({
      key: 'agent',
      label: 'Sourcing agent',
      to: agent === null ? 'None linked' : `${agent.name} informed, not made the owner`,
    })
  }

  if (to === CLAIM_STATES.docsCollected) {
    base.push({
      key: 'docs',
      label: 'Documents on file',
      to: `${collected.length} of ${claim.checklistItems.length}`,
    })
  }

  if (to === CLAIM_STATES.settlementRecorded) {
    // No preview means no Confirm: `<ConfirmGate>` refuses an empty box, which is
    // what keeps an unrecorded figure from being confirmed by habit.
    if (settlement.amount === null || settlement.insurerAdviceRef === null) return []
    base.push({
      key: 'amount',
      label: 'Settled amount',
      to: <Money paise={settlement.amount.paise} />,
    })
    base.push({
      key: 'deduction',
      label: 'Deduction',
      to: <Money paise={settlement.deduction?.paise ?? null} />,
    })
    base.push({ key: 'source', label: 'Source', to: 'Typed from the insurer advice' })
    base.push({ key: 'ref', label: 'Advice reference', to: settlement.insurerAdviceRef })
  }

  if (to === CLAIM_STATES.closed) {
    if (remark.trim() === '' && (claim.companyRemark ?? '') === '') return []
    base.push({
      key: 'remark',
      label: 'Company remark',
      to: remark.trim() === '' ? (claim.companyRemark ?? '') : remark.trim(),
    })
    base.push({
      key: 'rating',
      label: 'Insurer rating',
      to: 'This remark feeds it',
    })
  }

  base.push({
    key: 'message',
    label: 'Status message',
    to: input.rerouted
      ? 'Rerouted to the agent, and the reroute is logged'
      : `Sent to ${customerName}`,
  })

  return base
}

function buildActions(input: ActionInput): readonly MachineAction[] {
  const { claim, desk, actorId, settlement, remark, collected, planNote, commit, uploads } = input

  return claimMachine.targetsFrom(claim.state).map((to) => {
    const copy = copyFor(claim.state, to)
    const ctx = contextFor(input, to)
    const verdict = claimMachine.canTransition(claim.state, to, ctx)

    return {
      key: `${claim.state}-to-${to}`,
      label: copy.label,
      icon: copy.icon,
      ...(copy.variant === undefined ? {} : { variant: copy.variant }),
      verdict,
      confirmTitle: `${copy.label} — ${claim.systemNo}`,
      confirmLabel: copy.confirmLabel,
      receipt: copy.receipt,
      changes: changesFor(input, to),
      note: planNote,
      run: () =>
        void commit(to, async () => {
          // The receipt on this edge says the link is live and expiring, so the
          // link is issued first and the move is abandoned if it cannot be. A
          // status that claims a link was sent when none exists is the kind of
          // lie the customer discovers at the discharge desk.
          if (to === CLAIM_STATES.uploadLinkSent) {
            const issued = await uploads.issue({
              actorId,
              claimId: claim.id,
              token: newUploadToken(),
            })
            if (!issued.ok) return issued
          }

          return desk.advance(claim.id, to, {
            actorId,
            agentNotified: true,
            ...(to === CLAIM_STATES.settlementRecorded ? { settlement } : {}),
            ...(to === CLAIM_STATES.closed && remark.trim() !== ''
              ? { companyRemark: remark.trim() }
              : {}),
            documentsCollected: collected,
            // The same list the screen asked `canTransition` with. A control that
            // is enabled by one context and refused by another is the bug this
            // field exists to stop.
            presentDocTypes: input.presentDocTypes,
          })
        }),
    }
  })
}

function ownerLabel(users: readonly StaffUser[], ownerId: string | null): string {
  return ownerId === null ? 'Unassigned — waiting for the claims team' : nameOfUser(users, ownerId)
}

function findAgent(agents: readonly Agent[], id: string): Agent | null {
  return agents.find((agent) => agent.id === id) ?? null
}
