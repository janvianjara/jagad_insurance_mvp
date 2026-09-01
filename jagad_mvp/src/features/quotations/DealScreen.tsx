import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { dealHasLineItems } from '../../domain/workflows'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { RecordLink } from '../../components/RecordLink'
import { RecordCorrection } from '../../components/RecordCorrection'
import { ConfirmGate, RollUp } from '../../components/guardrails'
import type { RollUpComponent } from '../../components/guardrails'
import { sumMoney } from '../../domain/money'
import type { Agent, Deal, Repositories } from '../../data/repo'
import type { Money } from '../../domain/money'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Select } from '../../ui/form'
import { StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { KeyValueList, Money as AmountText, RecordId } from '../../ui/type'
import { DEAL_LABEL, DEAL_TONE, nameOf } from './quotation-view'
import styles from './Deal.module.css'

/**
 * The deal — plan §9's deal machine, canvas 2.7 and 2.8.
 *
 * A deal is the bridge between a won quotation and the policies it produces, and
 * the screen's whole job is to carry the accepted line items forward without
 * letting an empty one through. §9 is explicit that the block is a sentence
 * rather than a greyed button, so the refusal rendered here is the machine's own:
 * `dealHasLineItems` is called directly, and the same function is what
 * `deals.create` and `deals.setLineItems` refuse with.
 */
export function DealScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const [reads, setReads] = useState(0)
  const [agencyId, setAgencyId] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const loaded = useResource(() => loadDeal(repositories, id), `deal:${id}:${reads}`)

  if (!user || !loaded.data) {
    if (loaded.status === 'ready' && !loaded.data) {
      return (
        <EmptyState
          variant="error"
          title="No deal answers to that address"
          explanation={`Nothing is stored under ${id}.`}
          action={
            <Button variant="primary" onClick={() => void navigate('/deals')}>
              Back to the deals queue
            </Button>
          }
        />
      )
    }
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="14rem" />
      </div>
    )
  }

  const { deal, quotation, customer, users, agents, agencies, companies, products } = loaded.data
  const actorId = user.id
  const mayAct = can(user, 'edit', 'deals')

  // The machine's own guard, asked early so the control carries the same
  // sentence the refusal would have.
  const verdict = dealHasLineItems({ lineItems: deal.lineItems })
  const breakdown = acceptedBreakdown(deal.lineItems)
  const placed = deal.status !== 'created'
  const picked = agencyId || deal.agencyId || ''

  async function place() {
    setArmed(null)
    setRefusal(null)
    const outcome = await repositories.deals.setLineItems(id, {
      actorId,
      agencyId: picked,
      lineItems: deal.lineItems,
    })
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was changed', detail: outcome.reason, tone: 'bad' })
      return
    }
    toaster.notify({ title: 'Placed. The line items are ready for policy entry.', tone: 'ok' })
    setReads((previous) => previous + 1)
  }

  return (
    <>
      <PageHeader
        backTo={{ to: '/deals', label: 'Deals' }}
        title={customer?.fullName ?? deal.customerId}
        meta={
          <>
            <RecordId systemNo={deal.systemNo} showInsurer={false} />
            <StatusPill tone={DEAL_TONE[deal.status]}>{DEAL_LABEL[deal.status]}</StatusPill>
          </>
        }
      />

      <div className={styles.screen}>
        {/*
          * A deal carries no prose of its own — every descriptive field on it
          * belongs to the quotation behind it — so the only thing correctable
          * here is the attribution, which is exactly the thing that gets picked
          * wrong off a dropdown. Discard is offered because a deal raised
          * against the wrong customer is a mistake rather than an obligation;
          * one a policy has been written from refuses, with the machine's
          * sentence saying why.
          */}
        <RecordCorrection
          entity="Deal"
          resource="deals"
          record={deal}
          subject={deal.systemNo}
          noun="deal"
          amend={(command) => repositories.deals.amend(deal.id, command)}
          discard={(command) => repositories.deals.discard(deal.id, command)}
          restore={(command) => repositories.deals.restore(deal.id, command)}
          onWritten={() => setReads((previous) => previous + 1)}
        />

        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        <Panel
          title="Line items"
        >
          {deal.lineItems.length === 0 ? (
            <p className={styles.blocked} role="alert" data-deal-blocked="">
              <Icon name="alert" size="sm" />
              {verdict.ok ? '' : verdict.reason}
            </p>
          ) : (
            <>
              <ul className={styles.items}>
                {deal.lineItems.map((item) => (
                  <li key={item.id} className={styles.item} data-line-item={item.id}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemMeta}>
                      {companies.find((company) => company.id === item.companyId)?.name ??
                        item.companyId}
                      {' · '}
                      {products.find((product) => product.id === item.productId)?.code ??
                        item.productId}
                    </span>
                    <span className={styles.itemAmount} data-accepted-premium={item.id}>
                      <AmountText
                        paise={item.acceptedFinalPayablePremium.paise}
                        currency={item.acceptedFinalPayablePremium.currency}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/*
          The derived block sits in its own panel rather than under the line
          items, so a calculated total is never read as one of the typed figures
          beside it. The roll-up appears only when every accepted column recorded
          its components: a Net built from some of them would be a total that
          looks authoritative and is not, which is worse than no total at all.
        */}
        {deal.lineItems.length > 0 ? (
          <Panel
            title="Accepted total"
            description="Derived from the figures carried off the quotation. Nothing here can be typed."
          >
            {breakdown === null ? (
              <p className={styles.note} data-rollup-absent="">
                The insurer's split of net premium and GST was not recorded on every accepted
                column, so there is no roll-up to show. Each column's typed Final Payable Premium
                is listed above.
              </p>
            ) : (
              <RollUp
                components={breakdown.components}
                gst={breakdown.gst}
                netLabel="Net across accepted columns"
                finalLabel="Accepted total"
                note="Carried from the quotation columns the customer accepted. Net and Accepted total are derived from those typed figures and cannot be entered."
              />
            )}
          </Panel>
        ) : null}

        {!placed ? (
          <Panel
            title="Place it with an agency"
            description="Placement offers only the companies and products the chosen agency is appointed for."
          >
            <Field label="Agency" required>
              <Select
                options={agencies.map((agency) => ({ value: agency.id, label: agency.name }))}
                value={picked}
                placeholder="Choose the placing agency"
                onChange={(event) => setAgencyId(event.target.value)}
              />
            </Field>
            <div className={styles.actions}>
              <Button
                variant="primary"
                disabled={!verdict.ok || picked === '' || !mayAct}
                aria-describedby={verdict.ok ? undefined : 'deal-stop'}
                onClick={() => {
                  setRefusal(null)
                  setArmed('place')
                }}
              >
                Set the line items
              </Button>
            </div>
            {verdict.ok ? null : (
              <p className={styles.stop} role="status" id="deal-stop" data-deal-stop="">
                <Icon name="alert" size="sm" />
                {verdict.reason}
              </p>
            )}
            {armed === 'place' ? (
              <ConfirmGate
                title="Set this deal's line items"
                changes={[
                  {
                    key: 'agency',
                    label: 'Agency',
                    to: agencies.find((agency) => agency.id === picked)?.name ?? picked,
                  },
                  ...deal.lineItems.map((item) => ({
                    key: item.id,
                    label: 'Line item',
                    to: item.label,
                  })),
                ]}
                note="Placement is checked against that agency's appointment. Anything outside it is refused, and nothing is written."
                confirmLabel="Set line items"
                receipt="Set. This deal is ready for policy entry."
                onCancel={() => setArmed(null)}
                onConfirm={() => void place()}
              />
            ) : null}
          </Panel>
        ) : null}

        <Panel
          title="Policy entry"
        >
          {verdict.ok && placed ? (
            <Button
              variant="primary"
              icon="doc"
              onClick={() => void navigate(`/policies/new?dealId=${deal.id}`)}
            >
              Begin policy entry
            </Button>
          ) : (
            <p className={styles.stop} role="status" data-entry-stop="">
              <Icon name="alert" size="sm" />
              {verdict.ok
                ? 'Place this deal with an agency before policy entry begins.'
                : verdict.reason}
            </p>
          )}
        </Panel>

        <Panel title="The record" level={3}>
          <KeyValueList
            columns={2}
            items={[
              {
                key: 'quotation',
                label: 'From quotation',
                value: (
                  <RecordLink
                    to={quotation ? `/quotations/${quotation.id}` : undefined}
                    label={quotation?.systemNo ?? ''}
                    absentText={deal.quotationId}
                  />
                ),
              },
              {
                key: 'customer',
                label: 'Customer',
                value: (
                  <RecordLink
                    to={customer ? `/customers/${customer.id}` : undefined}
                    label={customer?.fullName ?? ''}
                    reference={customer?.systemNo}
                    absentText={deal.customerId}
                  />
                ),
              },
              { key: 'owner', label: 'Owner', value: nameOf(users, deal.ownerId) },
              { key: 'agent', label: 'Agent', value: agentName(agents, deal.agentId) },
              { key: 'subAgent', label: 'Sub-agent', value: agentName(agents, deal.subAgentId) },
              {
                key: 'agency',
                label: 'Agency',
                value:
                  agencies.find((agency) => agency.id === deal.agencyId)?.name ?? 'Not placed yet',
              },
            ]}
          />
        </Panel>
      </div>
    </>
  )
}

/**
 * An agent by name. A raw id on a screen is a lookup somebody has to do by hand,
 * and the commission conversation this row feeds is about people.
 */
function agentName(agents: readonly Agent[], agentId: string | null): string {
  if (agentId === null) return 'None recorded'
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId
}

/**
 * The accepted columns as `<RollUp>` reads them, or `null` when the components
 * were never recorded.
 *
 * All-or-nothing on purpose. `<RollUp>` sums the components it is given, so
 * handing it a subset would produce a Net that silently omits a column the
 * customer actually bought. Nothing here produces an amount: the parts are the
 * figures typed on the quotation, and the sums are `<RollUp>`'s own.
 */
function acceptedBreakdown(
  lineItems: readonly Deal['lineItems'][number][],
): { components: readonly RollUpComponent[]; gst: Money } | null {
  if (lineItems.length === 0) return null

  const components: RollUpComponent[] = []
  const gstParts: Money[] = []
  for (const item of lineItems) {
    if (item.netPremium === null || item.gstAmount === null) return null
    components.push({ key: item.id, label: item.label, amount: item.netPremium })
    gstParts.push(item.gstAmount)
  }
  return { components, gst: sumMoney(gstParts) }
}

async function loadDeal(repositories: Repositories, id: string) {
  const deal = await repositories.deals.get(id)
  if (!deal) return null

  const [quotation, customer, users, agents, agencies, companies, products] = await Promise.all([
    repositories.quotations.get(deal.quotationId),
    repositories.customers.get(deal.customerId),
    repositories.config.users(),
    repositories.agents.list({ page: 1, pageSize: 200 }),
    repositories.agencies.list({ page: 1, pageSize: 50 }),
    repositories.companies.list({ page: 1, pageSize: 200 }),
    repositories.products.getMany(deal.lineItems.map((item) => item.productId)),
  ])

  return {
    deal,
    quotation,
    customer,
    users,
    agents: agents.rows,
    agencies: agencies.rows,
    companies: companies.rows,
    products,
  }
}

export default DealScreen
