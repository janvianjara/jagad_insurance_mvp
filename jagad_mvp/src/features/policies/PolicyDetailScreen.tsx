import { useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { canHardDeletePolicy, retentionWindowElapsed } from '../../domain/workflows'
import type { KycState } from '../../domain/workflows'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { RecordCorrection } from '../../components/RecordCorrection'
import { RecordLink } from '../../components/RecordLink'
import { RollUp } from '../../components/guardrails'
import type { RollUpComponent } from '../../components/guardrails'
import type {
  Agent,
  Company,
  Customer,
  Deal,
  PolicyNcb,
  PolicyPremiumComponent,
  Product,
  Repositories,
  RetentionClass,
  StaffUser,
} from '../../data/repo'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { Panel, Tabs } from '../../ui/surface'
import { KeyValueList, Money, RecordId } from '../../ui/type'
import { DispatchPanel } from './DispatchPanel'
import { IssuancePanel } from './IssuancePanel'
import { PaymentFork } from './PaymentFork'
import { PolicySchedule } from './PolicySchedule'
import { PolicyVersions } from './PolicyVersions'
import { policyDesk } from './data/policy-desk'
import type { PolicyDossier } from './data/policy-desk'
import { dealIdOf } from '../../data/repo'
import { loadPolicyFacets } from './data/policy-facets'
import type { PolicyFacets } from './data/policy-facets'
import { POLICY_TABS, POLICY_TAB_LABEL, policyTabFromPath, policyTabHref } from './policy-tabs'
import type { PolicyTab } from './policy-tabs'
import { endorsementsInFlight, versionHistory } from './version-diff'
import {
  ENTRY_PATH_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  LIVE_POLICY_STATES,
  PREMIUM_MODE_LABEL,
  insurerHasIssued,
  policyLabelFor,
  policyToneFor,
} from './policy-view'
import { usePolicyNow } from './clock'
import styles from './PolicyDetail.module.css'

/**
 * `/policies/:id` — plan §5's "Policy detail" row: state, dual numbers, premium
 * record, payment block, documents, dispatch, versions, retention lock.
 *
 * The screen is a composition and deliberately holds no rules of its own. The
 * premium record renders through `<RollUp>`, the payment fork through
 * `<PaymentFork>` and issuance through `<IssuancePanel>`, and each of those owns
 * the guard it enforces. What this file adds is the one thing none of them can:
 * the order in which a person meets them, and the single re-read that keeps them
 * agreeing about the record after any of them writes.
 *
 * Two decisions are worth stating.
 *
 * **The premium here is read-only, and it is read-only twice over.** Once
 * issued, a policy's figures are the insurer's and are changed by endorsement
 * (P2), not by editing a field. So the recorded Final Premium is printed rather
 * than offered in a control, and the derived roll-up beside it is exactly the
 * cross-check the entry screen showed — same components, same arithmetic, same
 * `<RollUp>`. Nothing on this screen can produce an amount.
 *
 * **The retention lock is drawn as an answer, not as a missing button.** §9 says
 * a closed policy past its retention class locks and is never hard-deleted, and
 * the temptation is to express that by simply having no delete control. That
 * teaches nobody anything: the person who came looking for one leaves believing
 * the feature is unbuilt. So `canHardDeletePolicy()` renders its sentence, and
 * `retentionWindowElapsed` renders either the date the lock falls due or the
 * refusal that says why it has not. Both are the machine's own words.
 *
 * **The file has three faces, and each one is an address.** `/policies/:id/versions`
 * and `/policies/:id/schedule` are facets of THIS record, not screens elsewhere,
 * so they are tabs on this page whose deep routes are their addressable URLs —
 * a person moves between what the policy is, what it has been and what it owes
 * without ever leaving the record, and can send a colleague a link to any of the
 * three. The tab is read off the path rather than held in state
 * (`policyTabFromPath`), so landing cold on the schedule opens the schedule on
 * the first paint: there is no effect that corrects the tab afterwards and
 * therefore no frame in which the overview flashes.
 *
 * The facets load WITH the record rather than when a tab is opened, for the same
 * reason the Customer 360 keys its resource on the customer alone: they are three
 * views of one file, so putting the tab in the key would make every click throw
 * away a good result and re-read the whole dossier.
 */

type DetailData = {
  readonly dossier: PolicyDossier
  readonly customer: Customer | null
  readonly product: Product | null
  /* The neighbours a policy names but never used to show. */
  readonly company: Company | null
  readonly agent: Agent | null
  readonly deal: Deal | null
  readonly retention: RetentionClass | null
  readonly users: readonly StaffUser[]
  readonly facets: PolicyFacets
}

async function loadDetail(
  repositories: Repositories,
  policyId: string,
): Promise<DetailData | null> {
  const desk = policyDesk(repositories)
  const dossier = await desk.dossier(policyId)
  if (!dossier) return null

  /*
   * The policy's neighbours, read in the same round as everything else.
   *
   * `dealId` is not a column: provenance is a union, and only a policy that came
   * out of a deal has one — `dealIdOf` is the existing helper that says so
   * rather than this screen re-deciding it.
   */
  const dealId = dealIdOf(dossier.policy.provenance)
  const [customer, product, company, agent, deal, classes, users, facets] = await Promise.all([
    repositories.customers.get(dossier.policy.customerId),
    repositories.products.get(dossier.policy.productId),
    repositories.companies.get(dossier.policy.companyId),
    dossier.policy.agentId === null
      ? Promise.resolve(null)
      : repositories.agents.get(dossier.policy.agentId),
    dealId === null ? Promise.resolve(null) : repositories.deals.get(dealId),
    repositories.config.retentionClasses(),
    repositories.config.users(),
    loadPolicyFacets(repositories, policyId),
  ])

  return {
    dossier,
    customer,
    product,
    company,
    agent,
    deal,
    retention: classes.find((entry) => entry.key === dossier.policy.retentionClass) ?? null,
    users,
    facets,
  }
}

/**
 * The typed components this record carries, for the derived cross-check.
 *
 * Each one is a figure a person read off the insurer's schedule and typed, kept
 * as it was entered. They are handed to `<RollUp>` so the record shows the same
 * relationship the entry screen showed — and the derived Net it prints is a
 * cross-check against `policy.netPremium`, never a replacement for it. Nothing
 * on this screen writes the sum anywhere.
 *
 * A component nobody typed is dropped from the roll-up rather than counted as
 * zero, because a total that silently included unrecorded rows would be a figure
 * the platform asserted rather than one it was given. It is still listed above,
 * as "Not recorded", so the omission is visible instead of invisible.
 *
 * A record captured before itemisation was kept falls back to the single stored
 * Net. That is not an error state and is not drawn as one — it is an older record
 * showing what it actually holds.
 */
function recordedComponents(
  components: readonly PolicyPremiumComponent[],
  net: RollUpComponent['amount'] | null,
): readonly RollUpComponent[] {
  if (components.length === 0) {
    return net === null ? [] : [{ key: 'netPremium', label: 'Net premium, as recorded', amount: net }]
  }

  const rows: RollUpComponent[] = []
  for (const component of components) {
    if (component.amount === null) continue
    rows.push({ key: component.key, label: component.label, amount: component.amount })
  }
  return rows
}

/** NCB as a percentage. Basis points in, a string out; never money. */
function ncbReading(ncb: PolicyNcb | null): string {
  if (ncb === null) return 'Not recorded'
  return `${(ncb.percentBp / 100).toFixed(ncb.percentBp % 100 === 0 ? 0 : 2)}%`
}

export function PolicyDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSessionStore((state) => state.user)
  const now = usePolicyNow()

  // Read off the address, not held in state. A cold landing on
  // `/policies/:id/schedule` therefore opens the schedule on the first paint.
  const tab = policyTabFromPath(location.pathname)

  const [reads, setReads] = useState(0)
  const loaded = useResource(() => loadDetail(repositories, id), `policy:${id}:${reads}`)

  if (loaded.status === 'error') {
    return (
      <EmptyState
        variant="error"
        title="This policy could not be read"
        explanation={loaded.error?.message ?? 'The read failed before the record came back.'}
        action={
          <Button variant="primary" onClick={() => loaded.reload()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (loaded.status === 'ready' && !loaded.data) {
    return (
      <EmptyState
        variant="error"
        title="No policy answers to that address"
        explanation={`Nothing is stored under ${id}.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/policies')}>
            Back to the policy queue
          </Button>
        }
      />
    )
  }

  if (!user || !loaded.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  const { dossier, customer, product, company, agent, deal, retention, users, facets } =
    loaded.data
  const { policy, draft } = dossier
  const desk = policyDesk(repositories)
  const mayAct = can(user, 'edit', 'policies')
  const kycState: KycState = customer?.kycState ?? 'pending'

  // The retention answer, taken from the machine rather than restated. `closedAt`
  // is left to the adapter's own reading of the event log; what the screen needs
  // is the sentence, and the guard writes it either way.
  const deletionAnswer = canHardDeletePolicy()
  const retentionVerdict = retentionWindowElapsed({
    now: new Date(),
    entryPath: draft?.entryPath ?? 'proposal',
    kycState,
    retentionClass: policy.retentionClass,
    retentionYearsByClass: retention === null ? {} : { [retention.key]: retention.years },
    closedAt: undefined,
  })

  const versions = versionHistory(dossier.versions, facets.endorsements)
  const inFlight = endorsementsInFlight(facets.endorsements)
  const staffName = (userId: string | null): string =>
    userId === null ? 'Unassigned' : (users.find((person) => person.id === userId)?.name ?? userId)

  const panels: Readonly<Record<PolicyTab, ReactNode>> = {
    versions: (
      <PolicyVersions entries={versions} inFlight={inFlight} staffName={staffName} />
    ),

    schedule: (
      <PolicySchedule
        packet={facets.schedule}
        collections={dossier.collections}
        premiumMode={policy.premiumMode}
        now={now}
        staffName={staffName}
      />
    ),

    overview: (
      <>
      {/*
        * Who and what this contract is between, before what state it is in.
        *
        * A policy names five other records — the customer, the insurer, the
        * product, the agent who wrote it and the deal it came out of — and this
        * screen used to show one of them (the product, in the header) and link
        * to none. Everything in the product points at a policy; the policy
        * pointed nowhere, so the only way from here to the customer was the rail
        * and a search.
        *
        * They lead the panel because they are what a person checks first: whose
        * policy is this, with whom, and who sold it. State and dates follow.
        */}
      <Panel title="The record">
        <KeyValueList
          items={[
            {
              key: 'customer',
              label: 'Customer',
              value: (
                <RecordLink
                  to={customer ? `/customers/${customer.id}` : undefined}
                  label={customer?.fullName ?? ''}
                  reference={customer?.systemNo}
                  absentText="No customer on file"
                />
              ),
            },
            {
              key: 'company',
              label: 'Insurer',
              value: (
                <RecordLink
                  to={company ? `/config/companies?record=${company.id}` : undefined}
                  label={company?.name ?? ''}
                  absentText="Not recorded"
                />
              ),
            },
            {
              key: 'product',
              label: 'Product',
              value: (
                <RecordLink
                  to={product ? `/config/products?record=${product.id}` : undefined}
                  label={product?.name ?? ''}
                  absentText="Not recorded"
                />
              ),
            },
            {
              key: 'agent',
              label: 'Agent',
              value: (
                <RecordLink
                  to={agent ? `/config/agents?record=${agent.id}` : undefined}
                  label={agent?.name ?? ''}
                  absentText="Written by the agency itself"
                />
              ),
            },
            {
              key: 'deal',
              // Only a policy that came out of a deal has one. A captured or
              // migrated policy honestly has none, and says so.
              label: 'Came from',
              value: (
                <RecordLink
                  to={deal ? `/deals/${deal.id}` : undefined}
                  label={deal?.systemNo ?? ''}
                  absentText={ENTRY_PATH_LABEL[draft?.entryPath ?? 'proposal']}
                />
              ),
            },
            { key: 'state', label: 'State', value: policyLabelFor(policy, now) },
            { key: 'mode', label: 'Premium mode', value: PREMIUM_MODE_LABEL[policy.premiumMode] },
            {
              key: 'payment',
              label: 'Payment',
              value: (
                <StatusPill tone={PAYMENT_TONE[policy.paymentState]}>
                  {PAYMENT_LABEL[policy.paymentState]}
                </StatusPill>
              ),
            },
            { key: 'start', label: 'Cover starts', value: policy.startDate ?? 'Not recorded' },
            { key: 'expiry', label: 'Cover ends', value: policy.expiryDate ?? 'Not recorded' },
          ]}
        />
      </Panel>

      <Panel
        title="Premium"
        description="Every figure was read off the insurer document and typed. Nothing here was worked out."
      >
        <dl className={styles.premium}>
          <dt className={styles.premiumLabel}>Final premium, as recorded</dt>
          <dd className={styles.premiumValue}>
            {policy.finalPremium === null ? (
              'Not recorded'
            ) : (
              <Money paise={policy.finalPremium.paise} emphasis="strong" />
            )}
          </dd>
        </dl>
        {dossier.ncb === null ? null : (
          <dl className={styles.premium} data-policy-ncb="">
            <dt className={styles.premiumLabel}>No claim bonus, as recorded</dt>
            {/* A percentage, not money: it never goes near <Money> and it is
                never part of the roll-up, because the discount it earned was
                applied on the insurer's system and is already inside the
                figures above. */}
            <dd className={styles.premiumValue}>{ncbReading(dossier.ncb)}</dd>
          </dl>
        )}
        {dossier.components.length === 0 ? (
          <p className={styles.quiet}>
            This record was captured before the premium was itemised, so it carries a single Net
            figure. What follows is that figure, not a breakdown of it.
          </p>
        ) : (
          <dl className={styles.components} data-premium-components="">
            {dossier.components.map((component) => (
              <div key={component.key} className={styles.componentRow}>
                <dt className={styles.premiumLabel}>{component.label}</dt>
                <dd className={styles.premiumValue}>
                  {component.amount === null ? (
                    'Not recorded'
                  ) : (
                    <Money paise={component.amount.paise} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <RollUp
          components={recordedComponents(dossier.components, policy.netPremium)}
          gst={policy.gstAmount}
          note="Net and Final below are the same cross-check the entry screen showed. The figure the policy carries is the recorded Final above."
        />
      </Panel>

      <Panel title="Payment" description="Record-only. The platform issues no receipt.">
        <PaymentFork
          policyId={policy.id}
          collections={dossier.collections}
          desk={desk}
          onRecorded={() => setReads((count) => count + 1)}
        />
      </Panel>

      {mayAct ? (
        <Panel title="Issuance" description="The insurer's document, read and confirmed by a person.">
          <IssuancePanel
            policy={policy}
            draft={draft}
            kycState={kycState}
            product={product}
            desk={desk}
            onChanged={() => setReads((count) => count + 1)}
          />
        </Panel>
      ) : null}

      <Panel
        title="Dispatch"
      >
        <DispatchPanel
          policyId={policy.id}
          dispatches={dossier.dispatches}
          disabled={!mayAct || !LIVE_POLICY_STATES.includes(policy.status)}
          disabledReason={
            mayAct
              ? 'A document can be sent once the policy has been issued.'
              : 'Your role can read this record but not send from it.'
          }
          actorId={user?.id ?? ''}
          desk={desk}
          onChanged={() => setReads((count) => count + 1)}
        />
      </Panel>

      <Panel title="Retention" description="A closed policy locks. It is never deleted.">
        <p className={styles.quiet}>{deletionAnswer.ok ? '' : deletionAnswer.reason}</p>
        <p className={styles.quiet} data-retention="">
          {retentionVerdict.ok
            ? 'The retention window has elapsed. This record can be locked.'
            : retentionVerdict.reason}
        </p>
      </Panel>

      <Panel title="Documents" description="Presence, never content.">
        {dossier.documents.length === 0 && dossier.files.length === 0 ? (
          <p className={styles.quiet}>
            Nothing has been filed against this policy yet. The insurer document is attached from
            the issuance panel above.
          </p>
        ) : (
          <ul className={styles.versions}>
            {dossier.documents.map((document) => (
              <li key={document.id}>
                <RecordId systemNo={document.systemNo} showInsurer={false} />
                <span className={styles.quiet}>{document.docType}</span>
              </li>
            ))}
            {dossier.files.map((file) => (
              <li key={`${file.policyId}:${file.fileName}`}>
                <span>{file.fileName}</span>
                <span className={styles.quiet}>attached at issuance</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      </>
    ),
  }

  return (
    <div className={styles.screen}>
      <PageHeader
        backTo={{ to: '/policies', label: 'Policies' }}
        title={customer?.fullName ?? 'Policy'}
        meta={
          <>
            <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
            {product ? <span>{product.name}</span> : null}
          </>
        }
        actions={
          <StatusPill tone={policyToneFor(policy, now)}>{policyLabelFor(policy, now)}</StatusPill>
        }
      />

      {/*
        * Correcting a policy, with D3's line drawn where the domain draws it.
        *
        * Before the insurer issues, the four figures are data entry and a typo
        * in one is correctable. From `issued` onwards they are contractual and
        * are not offered at all — the panel says in one line that a premium
        * after issue changes through an endorsement, which is where it actually
        * changes. There is no discard: a policy is never deleted.
        */}
      <RecordCorrection
        entity="Policy"
        resource="policies"
        record={policy}
        subject={policy.systemNo}
        noun="policy"
        issued={insurerHasIssued(policy)}
        amend={(command) => repositories.policies.amend(policy.id, command)}
        onWritten={() => setReads((previous) => previous + 1)}
      />

      <Tabs
        label="Policy file"
        value={tab}
        onChange={(next) => void navigate(policyTabHref(policy.id, next as PolicyTab))}
        tabs={[
          { id: POLICY_TABS.overview, label: POLICY_TAB_LABEL.overview },
          {
            id: POLICY_TABS.versions,
            label: POLICY_TAB_LABEL.versions,
            count: versions.length,
          },
          { id: POLICY_TABS.schedule, label: POLICY_TAB_LABEL.schedule },
        ]}
      >
        {(activeId) => (
          <div className={styles.tabPanel}>{panels[activeId as PolicyTab] ?? panels.overview}</div>
        )}
      </Tabs>
    </div>
  )
}

export default PolicyDetailScreen
