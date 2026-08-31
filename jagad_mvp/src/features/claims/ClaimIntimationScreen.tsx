import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { CLAIM_STATES, CLAIM_TYPES, claimMachine } from '../../domain/workflows'
import type { ClaimContext, ClaimState, ClaimType } from '../../domain/workflows'
import { can } from '../../domain/permissions'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, RadioGroup, Select } from '../../ui/form'
import { Panel } from '../../ui/surface'
import { useToaster } from '../../ui/surface'
import type { Agent, Customer } from '../../data/repo'
import { CLAIM_TYPE_LABEL } from './claim-view'
import { claimDesk } from './data/claim-desk'
import styles from './ClaimIntimation.module.css'

/**
 * Claim intimation — plan §4 `/claims/new`, canvas 4.1 and 4.2.
 *
 * The screen is one decision with a machine behind it. A claim is raised against
 * a policy, and §9 forks immediately on whether that policy is in force: an
 * active policy goes to `intimated` with the claim number and the insurer email,
 * the agent copied; an inactive one goes to `blocked` with the sourcing agent
 * notified so somebody picks the phone up.
 *
 * Neither branch is decided here. The screen asks `claimMachine` which move the
 * chosen policy allows and renders the answer — the sentence under a blocked
 * intimation is §9's own, written for the person reading it. Nothing is written
 * until Confirm, and Cancel writes nothing.
 *
 * "Active" means the policy is `issued`, which is the same test the repository
 * applies when it hands the machine its context. One rule, asked in two places,
 * never two rules that can disagree.
 */
export function ClaimIntimationScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const [params] = useSearchParams()
  const user = useSessionStore((state) => state.user)
  const desk = claimDesk(repositories)

  const context = useResource(async () => {
    const [policies, customers, agents] = await Promise.all([
      repositories.policies.list({ page: 1, pageSize: 500 }),
      repositories.customers.list({ page: 1, pageSize: 500 }),
      repositories.agents.list({ page: 1, pageSize: 200 }),
    ])
    return { policies: policies.rows, customers: customers.rows, agents: agents.rows }
  }, 'claims:intimation-context')

  const [policyId, setPolicyId] = useState(params.get('policyId') ?? '')
  const [claimType, setClaimType] = useState<ClaimType>(CLAIM_TYPES.cashless)
  const [armed, setArmed] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  if (!can(user, 'create', 'claims')) {
    return (
      <EmptyState
        variant="error"
        title="Your role cannot intimate a claim"
        explanation="Claim intimation belongs to the claims desk and to administrators. Ask the claims team to raise this one; you will still see it on the customer once it exists."
        action={
          <Button variant="primary" onClick={() => void navigate('/claims')}>
            Back to the claim queue
          </Button>
        }
      />
    )
  }

  const actorId = user.id
  const { policies, customers, agents } = context.data
  const claimable = policies.filter((policy) => CLAIMABLE_STATES.includes(policy.status))
  const policy = claimable.find((row) => row.id === policyId) ?? null
  const customer = policy ? findCustomer(customers, policy.customerId) : null
  const agent = policy?.agentId ? findAgent(agents, policy.agentId) : null

  const active = policy?.status === 'issued'
  const target: ClaimState = active ? CLAIM_STATES.intimated : CLAIM_STATES.blocked

  const ctx: ClaimContext = {
    claimType,
    policyActive: active,
    policyStatus: policy ? humanStatus(policy.status) : 'not chosen',
    // §9: blocking notifies the sourcing agent in the same move, so the screen
    // offers the notification as part of the act rather than as a later nicety.
    agentNotified: true,
  }
  const verdict = policy
    ? claimMachine.canTransition(claimMachine.initial, target, ctx)
    : { ok: false as const, reason: 'Choose the policy this claim is being raised against.' }

  const changes: readonly ConfirmChange[] = !policy
    ? []
    : active
      ? [
          { key: 'claim', label: 'Claim number', to: 'Generated on intimation' },
          { key: 'policy', label: 'Policy', to: policy.systemNo },
          { key: 'type', label: 'Type', to: CLAIM_TYPE_LABEL[claimType] },
          { key: 'status', label: 'Status', from: 'Raised', to: 'Intimated' },
          {
            key: 'insurer',
            label: 'Insurer',
            to: 'Intimation emailed to the claims contact on record',
          },
          {
            key: 'agent',
            label: 'Sourcing agent',
            to: agent === null ? 'None linked to this policy' : `${agent.name} copied`,
          },
        ]
      : [
          { key: 'policy', label: 'Policy', to: `${policy.systemNo} — ${humanStatus(policy.status)}` },
          { key: 'status', label: 'Status', from: 'Raised', to: 'Blocked' },
          {
            key: 'agent',
            label: 'Sourcing agent',
            to: agent === null ? 'None linked — the claims desk is alerted' : `${agent.name} notified`,
          },
          { key: 'insurer', label: 'Insurer', to: 'Nothing is sent' },
        ]

  async function commit() {
    if (!policy) return
    const outcome = await desk.intimate({
      actorId,
      policyId: policy.id,
      customerId: policy.customerId,
      agentId: policy.agentId,
      claimType,
      policyActive: active,
      policyStatus: humanStatus(policy.status),
      agentNotified: true,
      now: new Date(),
    })

    if (!outcome.ok) {
      // The machine's own words. Nothing was written.
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was changed', detail: outcome.reason, tone: 'bad' })
      return
    }

    setRefusal(null)
    toaster.notify({
      title: active
        ? `${outcome.record.systemNo} intimated. The insurer has been emailed and the agent copied.`
        : `${outcome.record.systemNo} blocked. The sourcing agent has been notified.`,
      tone: active ? 'ok' : 'warn',
    })
    void navigate(`/claims/${outcome.record.id}`)
  }

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/claims">Claims</Link>}
        title="Intimate a claim"
        meta={
          <span className={styles.meta}>
            The policy is checked before anything reaches the insurer.
          </span>
        }
      />

      <div className={styles.screen}>
        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        <Panel
          title="What is being claimed"
          description="A claim is raised against a policy, so the policy is the first thing chosen and the only thing that decides whether this can go to the insurer."
        >
          <div className={styles.form}>
            <Field
              label="Policy"
              required
              hint="Every policy on the books is listed, in force or not. Choosing one that is not in force is allowed — the platform blocks the intimation and tells the agent rather than hiding the option."
            >
              <Select
                options={claimable.map((row) => ({
                  value: row.id,
                  label: `${row.systemNo} — ${nameFor(customers, row.customerId)} — ${humanStatus(row.status)}`,
                }))}
                placeholder="Choose the policy"
                value={policyId}
                onChange={(event) => {
                  setArmed(false)
                  setRefusal(null)
                  setPolicyId(event.target.value)
                }}
              />
            </Field>

            <Field
              label="Claim type"
              control="group"
              required
              hint="Cashless sends the customer a tokenised upload link for the discharge summary. A reimbursement file raises the document checklist for the company and product."
            >
              <RadioGroup
                name="claim-type"
                orientation="horizontal"
                value={claimType}
                options={[
                  { value: CLAIM_TYPES.cashless, label: CLAIM_TYPE_LABEL.cashless },
                  { value: CLAIM_TYPES.file, label: CLAIM_TYPE_LABEL.file },
                ]}
                onValueChange={(value) => {
                  setArmed(false)
                  setClaimType(value === CLAIM_TYPES.file ? CLAIM_TYPES.file : CLAIM_TYPES.cashless)
                }}
              />
            </Field>
          </div>
        </Panel>

        {policy ? (
          <Panel
            title={active ? 'This policy is in force' : 'This policy is not in force'}
            level={3}
            description={
              active
                ? 'The claim goes to the insurer with its number, and the sourcing agent is copied.'
                : 'Nothing will be sent to the insurer. The claim is recorded as blocked and the sourcing agent is told, so the customer hears it from a person rather than at the hospital desk.'
            }
          >
            <p className={styles.policyLine}>
              <strong>{policy.systemNo}</strong>
              {' · '}
              {customer?.fullName ?? policy.customerId}
              {' · '}
              {humanStatus(policy.status)}
            </p>
            {verdict.ok ? null : (
              <p className={styles.blocked} id="intimation-blocked">
                {verdict.reason}
              </p>
            )}
          </Panel>
        ) : null}

        <div className={styles.actions}>
          <Button
            variant="primary"
            icon="check"
            disabled={!policy || !verdict.ok}
            aria-describedby={verdict.ok ? undefined : 'intimation-blocked'}
            onClick={() => setArmed(true)}
          >
            {active ? 'Intimate to the insurer' : 'Block and notify the agent'}
          </Button>
          <Button variant="quiet" onClick={() => void navigate('/claims')}>
            Cancel
          </Button>
        </div>

        {armed && policy ? (
          <ConfirmGate
            title={active ? `Intimate a claim on ${policy.systemNo}` : `Block this claim on ${policy.systemNo}`}
            changes={changes}
            confirmLabel={active ? 'Intimate and notify' : 'Block and notify'}
            receipt={
              active
                ? 'Intimated. The insurer has the claim number and the agent has been copied.'
                : 'Blocked, and the sourcing agent has been notified.'
            }
            note={
              active
                ? 'The claim number is generated by the platform and is what the customer is given. The insurer number arrives later, if it arrives at all.'
                : 'The block is the record of what happened. It is not a refusal to help — the agent has the customer, and the claim stays on the books so the conversation has something to point at.'
            }
            onCancel={() => setArmed(false)}
            onConfirm={() => void commit()}
          />
        ) : null}
      </div>
    </>
  )
}

export default ClaimIntimationScreen

/**
 * Policies a claim may be raised against at all. Drafts and proposals are not
 * contracts yet, so they are absent rather than offered and refused; a lapsed or
 * closed policy IS offered, because canvas 4.2 is precisely the case where
 * somebody tries and has to be told why not.
 */
const CLAIMABLE_STATES: readonly string[] = [
  'issued',
  'dispatched',
  'documents_collected',
  'closed',
  'lapsed',
  'locked',
]

function humanStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

function findCustomer(customers: readonly Customer[], id: string): Customer | null {
  return customers.find((customer) => customer.id === id) ?? null
}

function nameFor(customers: readonly Customer[], id: string): string {
  return findCustomer(customers, id)?.fullName ?? id
}

function findAgent(agents: readonly Agent[], id: string): Agent | null {
  return agents.find((agent) => agent.id === id) ?? null
}
