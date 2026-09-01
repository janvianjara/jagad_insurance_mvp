import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { RecordCorrection } from '../../components/RecordCorrection'
import { ConsentBadge } from '../../components/ConsentBadge'
import { MaskedField } from '../../components/MaskedField'
import { RecordTimeline } from '../../components/RecordTimeline'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, Tabs } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId, RelativeTime } from '../../ui/type'
import { INQUIRY_LABEL, INQUIRY_TONE } from '../inquiries'
import { KycFile, derivedStateFor, loadKycChecklist } from '../kyc'
import { kycStateReason } from '../../domain/derive'
import { can } from '../../domain/permissions'
import { useSessionStore } from '../../app/store'
import { useCustomerNow } from './clock'
import { CustomerConsent } from './CustomerConsent'
import { CUSTOMER_TABS, customerTabFromLocation, customerTabHref } from './customer-tabs'
import type { CustomerTab } from './customer-tabs'
import { customerDesk } from './data/customer-desk'
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  DOCUMENT_TYPE_LABEL,
  KYC_LABEL,
  KYC_TONE,
  RELATIONSHIP_LABEL,
  activePolicies,
  timelineOptions,
} from './customer-view'
import styles from './Customer360.module.css'

/**
 * Customer 360 — plan §5's "Customer 360" row, prototype card `g_360`.
 *
 * Everything §5 asks for is here: the household and its members and
 * relationships, the policies, the document metadata, the transactions, the open
 * requests, where consent stands, and the full timeline from the event log
 * (charter U14).
 *
 * Two rules run through the whole screen. **Metadata, never content**: the
 * documents tab shows what exists, who sent it and whether it has been verified,
 * and not one word of what any document says — the same line §14.1 draws for the
 * Assistant, drawn here because it is the right line for a screen too.
 * **Last four, never more**: every Aadhaar on this page, the customer's and each
 * member's, renders through `<MaskedField>`, which slices before it builds a
 * node.
 *
 * The open tab lives in the URL, so a link to a customer's timeline is a link to
 * their timeline (§7, "URL owns list state"). Consent is the one facet the §4
 * route map gives a path of its own — `/customers/:id/consent`, because a
 * per-customer consent ledger is a compliance surface asked for by name and
 * shown by link — so `customerTabFromLocation` reads the path first and the
 * query string second. Landing cold on that address opens the ledger on the
 * first paint; there is no effect afterwards that corrects the tab, and
 * therefore no frame in which the household flashes.
 */
export function Customer360Screen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const now = useCustomerNow()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSessionStore((state) => state.user)
  const tab = customerTabFromLocation(location.pathname, location.search)

  /** Bumped after a withdrawal is recorded, so the ledger re-reads the file. */
  const [reads, setReads] = useState(0)

  const loaded = useResource(async () => {
    const dossier = await desk.dossier(id)
    if (!dossier) return null
    const [events, users, products, companies, referred, checklist, templates] = await Promise.all([
      desk.timeline(id),
      repositories.config.users(),
      repositories.products.list({ page: 1, pageSize: 500 }),
      repositories.companies.list({ page: 1, pageSize: 500 }),
      // FR-06.2: what this customer has sent us. Recording a referrer and being
      // able to ask what somebody referred are two capabilities, and this is the
      // screen the second question gets asked on.
      repositories.inquiries.referredBy(id, { page: 1, pageSize: 50 }),
      // The badge derives from the same checklist the KYC desk measures against,
      // so the header and that desk cannot tell different stories.
      loadKycChecklist(repositories, dossier),
      // What an active template would send, so the consent tab can say what a
      // withdrawal actually suppresses rather than asserting it suppresses
      // something unnamed.
      repositories.config.templates(),
    ])
    return {
      dossier,
      events,
      users,
      products: products.rows,
      companies: companies.rows,
      referred: referred.rows,
      checklist,
      templates,
    }
    // Keyed on the customer alone, NOT the tab. Every tab renders from this one
    // dossier, so putting the tab in the key made each click discard a good
    // result and refetch the dossier, the timeline, users, products and
    // companies - two serialised rounds of simulated latency to arrive back at
    // data already in hand. The tab is a render concern; it is not a dependency.
  }, `customer:${id}:${reads}`)

  if (loaded.isLoading && !loaded.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (!loaded.data) {
    return (
      <EmptyState
        variant="error"
        title="No customer answers to that address"
        explanation={`Nothing is stored under ${id}. The link may be wrong, or the record may belong to a book this account cannot see.`}
        action={
          <Button variant="primary">
            <Link to="/customers">Back to customers</Link>
          </Button>
        }
      />
    )
  }

  const { dossier, events, users, products, companies, referred, checklist, templates } =
    loaded.data
  const { customer, household, members, policies, documents, tasks, collections, consent } = dossier

  const productName = (productId: string) =>
    products.find((product) => product.id === productId)?.name ?? productId
  const companyName = (companyId: string) =>
    companies.find((company) => company.id === companyId)?.name ?? companyId
  const staffName = (userId: string | null) =>
    userId === null ? 'Unassigned' : (users.find((user) => user.id === userId)?.name ?? userId)

  const live = activePolicies(policies)

  /*
   * The header used to render `customer.kycState`, a column somebody wrote,
   * while the Documents tab below rendered the vault. Two sources of truth on
   * one screen, so the badge could read "KYC complete" above a checklist showing
   * nothing on file and neither half was wrong. It is one source now, and the
   * badge carries the sentence that justifies it.
   */
  const derived = derivedStateFor(dossier, checklist.checklist?.items ?? [], now)

  const panels: Readonly<Record<CustomerTab, ReactNode>> = {
    household: (
      <>
        <Panel
          title="Household"
        >
          {household ? (
            <KeyValueList
              items={[
                { key: 'name', label: 'Household', value: household.name },
                { key: 'city', label: 'City', value: household.city },
                {
                  key: 'head',
                  label: 'Head of household',
                  value: household.headCustomerId === customer.id ? customer.fullName : household.headCustomerId,
                },
                { key: 'people', label: 'People on file', value: String(members.length) },
              ]}
              columns={2}
            />
          ) : (
            <p className={styles.none}>
              This customer is not grouped into a household.
            </p>
          )}
        </Panel>

        <Panel
          title="Leads they sent us"
          level={3}
        >
          {referred.length === 0 ? (
            <p className={styles.none}>
              Nobody has been referred by this customer.
            </p>
          ) : (
            <ul className={styles.rows}>
              {referred.map((lead) => (
                <li key={lead.id} className={styles.row} data-referred={lead.id}>
                  <div className={styles.rowHead}>
                    <RecordId systemNo={lead.systemNo} />
                    <StatusPill tone={INQUIRY_TONE[lead.status]}>
                      {INQUIRY_LABEL[lead.status]}
                    </StatusPill>
                  </div>
                  <KeyValueList
                    dense
                    columns={2}
                    items={[
                      { key: 'who', label: 'Who', value: lead.contactName },
                      { key: 'owner', label: 'Owner', value: staffName(lead.ownerId) },
                      {
                        key: 'when',
                        label: 'Referred',
                        value: <DateTime value={lead.createdAt} mode="date" />,
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Members and relationships" level={3}>
          {members.length === 0 ? (
            <p className={styles.none}>No covered members are recorded against this customer.</p>
          ) : (
            <ul className={styles.members}>
              {members.map((member) => (
                <li key={member.id} className={styles.member} data-member={member.id}>
                  <div className={styles.memberHead}>
                    <span className={styles.memberName}>{member.fullName}</span>
                    <Badge caps>{RELATIONSHIP_LABEL[member.relationship]}</Badge>
                  </div>
                  <KeyValueList
                    dense
                    columns={2}
                    items={[
                      {
                        key: 'dob',
                        label: 'Date of birth',
                        value: member.dateOfBirth ? (
                          <DateTime value={member.dateOfBirth} mode="date" />
                        ) : null,
                      },
                      { key: 'gender', label: 'Gender', value: member.gender },
                      {
                        key: 'aadhaar',
                        label: 'Aadhaar',
                        value: <MaskedField label="Last four" last4={member.aadhaarLast4} />,
                      },
                      {
                        key: 'cover',
                        label: 'Covered under',
                        value: member.coveredUnderPolicyIds.length === 0
                          ? null
                          : member.coveredUnderPolicyIds
                              .map((policyId) =>
                                policies.find((policy) => policy.id === policyId)?.systemNo ?? policyId,
                              )
                              .join(', '),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </>
    ),

    policies: (
      <Panel
        title="Policies"
      >
        {policies.length === 0 ? (
          <p className={styles.none}>
            No policy has been entered for this customer yet.
          </p>
        ) : (
          <ul className={styles.rows}>
            {policies.map((policy) => (
              <li key={policy.id} className={styles.row} data-policy={policy.id}>
                <div className={styles.rowHead}>
                  <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
                  <StatusPill tone={policy.status === 'lapsed' ? 'bad' : 'ok'}>
                    {policy.status.replace(/_/g, ' ')}
                  </StatusPill>
                </div>
                <KeyValueList
                  dense
                  columns={2}
                  items={[
                    { key: 'product', label: 'Product', value: productName(policy.productId) },
                    { key: 'company', label: 'Company', value: companyName(policy.companyId) },
                    {
                      key: 'period',
                      label: 'Period',
                      value:
                        policy.startDate && policy.expiryDate ? (
                          <>
                            <DateTime value={policy.startDate} mode="date" /> to{' '}
                            <DateTime value={policy.expiryDate} mode="date" />
                          </>
                        ) : null,
                    },
                    {
                      key: 'premium',
                      label: 'Final premium',
                      value: <Money paise={policy.finalPremium?.paise ?? null} />,
                    },
                    {
                      key: 'sum',
                      label: 'Sum insured',
                      value: <Money paise={policy.sumInsured?.paise ?? null} />,
                    },
                    {
                      key: 'nominee',
                      label: 'Nominee Aadhaar',
                      value: <MaskedField label="Last four" last4={policy.nomineeAadhaarLast4} />,
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),

    documents: (
      <Panel
        title="Documents"
        description="Metadata only. This screen can say a document exists, who sent it and whether it has been verified; it never shows a word of what it says."
      >
        {documents.length === 0 ? (
          <p className={styles.none}>Nothing has been filed against this customer yet.</p>
        ) : (
          <ul className={styles.rows}>
            {documents.map((document) => (
              <li key={document.id} className={styles.row} data-document={document.id}>
                <div className={styles.rowHead}>
                  <RecordId systemNo={document.systemNo} showInsurer={false} />
                  <Badge caps>{DOCUMENT_TYPE_LABEL[document.docType]}</Badge>
                  <StatusPill tone={document.reviewState === 'verified' ? 'ok' : 'attn'}>
                    {document.reviewState}
                  </StatusPill>
                </div>
                <KeyValueList
                  dense
                  columns={2}
                  items={[
                    { key: 'from', label: 'Supplied by', value: document.uploadedByName },
                    {
                      key: 'submitted',
                      label: 'Received',
                      value: document.submittedAt ? (
                        <DateTime value={document.submittedAt} mode="datetime" />
                      ) : null,
                    },
                    {
                      key: 'verified',
                      label: 'Verified',
                      value: document.verifiedAt ? (
                        <>
                          <DateTime value={document.verifiedAt} mode="datetime" /> by{' '}
                          {staffName(document.verifiedBy)}
                        </>
                      ) : null,
                    },
                    { key: 'retention', label: 'Retention class', value: document.retentionClass },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),

    transactions: (
      <Panel
        title="Transactions"
        description="Recorded, never computed. The platform issues no receipt; this is the agency's own record of what arrived."
      >
        {collections.length === 0 ? (
          <p className={styles.none}>
            No collection has been recorded against this customer's policies.
          </p>
        ) : (
          <ul className={styles.rows}>
            {collections.map((entry) => (
              <li key={entry.id} className={styles.row} data-collection={entry.id}>
                <div className={styles.rowHead}>
                  <Badge caps>{entry.instrument}</Badge>
                  <StatusPill tone={entry.state === 'bounced' ? 'bad' : 'ok'}>
                    {entry.state.replace(/_/g, ' ')}
                  </StatusPill>
                  <Money paise={entry.amount?.paise ?? null} emphasis="strong" />
                </div>
                <KeyValueList
                  dense
                  columns={2}
                  items={[
                    { key: 'route', label: 'Route', value: entry.route.replace(/_/g, ' ') },
                    { key: 'reference', label: 'Reference', value: entry.reference },
                    {
                      key: 'collected',
                      label: 'Collected',
                      value: entry.collectedAt ? (
                        <>
                          <DateTime value={entry.collectedAt} mode="date" /> by{' '}
                          {staffName(entry.collectedBy)}
                        </>
                      ) : null,
                    },
                    {
                      key: 'verified',
                      label: 'Verified',
                      value: entry.verifiedAt ? (
                        <DateTime value={entry.verifiedAt} mode="date" />
                      ) : null,
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),

    requests: (
      <Panel
        title="Change requests and open work"
      >
        {tasks.length === 0 ? (
          <p className={styles.none}>Nothing is outstanding on this customer.</p>
        ) : (
          <ul className={styles.rows}>
            {tasks.map((task) => (
              <li key={task.id} className={styles.row} data-task={task.id}>
                <div className={styles.rowHead}>
                  <RecordId systemNo={task.systemNo} showInsurer={false} />
                  <StatusPill tone={task.state === 'done' ? 'ok' : 'attn'}>{task.state}</StatusPill>
                  <span className={styles.rowTitle}>{task.title}</span>
                </div>
                <KeyValueList
                  dense
                  columns={2}
                  items={[
                    { key: 'kind', label: 'Kind', value: task.kind.replace(/_/g, ' ') },
                    { key: 'owner', label: 'Owner', value: staffName(task.ownerId) },
                    { key: 'due', label: 'Due', value: <RelativeTime value={task.dueAt} now={now} /> },
                    { key: 'raised', label: 'Raised by', value: task.raisedBy },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),

    kyc: <KycFile customerId={customer.id} />,

    consent: (
      <CustomerConsent
        dossier={dossier}
        templates={templates}
        now={now}
        actorId={user?.id ?? ''}
        canAct={user !== null && (can(user, 'edit', 'customers') || can(user, 'edit', 'backOffice'))}
        desk={desk}
        onChanged={() => setReads((count) => count + 1)}
      />
    ),

    timeline: (
      <Panel
        title="Everything that has happened"
        description="The record's own event log — who did what, and when. A line appears here because an event was emitted, never because a screen remembered to add one."
      >
        <RecordTimeline
          events={events}
          options={timelineOptions(users, customer)}
          label={`Timeline for ${customer.fullName}`}
        />
      </Panel>
    ),
  }

  return (
    <>
      <PageHeader
        backTo={{ to: '/customers', label: 'Customers' }}
        title={customer.fullName}
        meta={
          <>
            <RecordId systemNo={customer.systemNo} showInsurer={false} />
            <StatusPill tone={CUSTOMER_STATUS_TONE[customer.status]}>
              {CUSTOMER_STATUS_LABEL[customer.status]}
            </StatusPill>
            <StatusPill tone={KYC_TONE[derived.kycState]} title={kycStateReason(derived)}>
              {KYC_LABEL[derived.kycState]}
            </StatusPill>
            <ConsentBadge
              state={customer.consentState}
              now={now}
              expiresAt={consent?.expiresAt ?? null}
              submittedAt={consent?.submittedAt ?? null}
            />
            <span>{`${live.length} live ${live.length === 1 ? 'policy' : 'policies'} · on the books since ${new Date(customer.createdAt).getFullYear()}`}</span>
          </>
        }
        actions={
          /*
           * The customer's own view of their file, as they see it.
           *
           * A plain anchor rather than a `<Link>`, and that is the point: the
           * portal is a separate shell registered outside this one (§11.1, D-I),
           * and a router navigation would carry this session across a boundary
           * the whole design exists to keep. A document navigation leaves the
           * staff app, which is what opening the customer's app means. The `as`
           * parameter is written literally for the same reason - importing the
           * portal's helper would pull the portal into the staff bundle and
           * undo the chunk split that enforces the separation.
           */
          <a
            className={styles.portalLink}
            href={`/portal?as=${encodeURIComponent(customer.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open their portal view
          </a>
        }
      />

      <div className={styles.screen}>
        {/*
          * Correction, and the honest answer to the question this screen gets
          * asked most: why can I not delete this customer.
          *
          * There is no discard on a customer and no delete behind it — the file
          * carries retention that outlives anybody's preference, and the type
          * system refuses the attempt rather than the runtime. What is offered
          * instead is the regulated path: a data-principal erasure request,
          * answered by reading what the platform actually holds and naming the
          * obligation where one exists (FR-20.2).
          */}
        <RecordCorrection
          entity="Customer"
          resource="customers"
          record={customer}
          subject={customer.systemNo}
          noun="customer file"
          amend={(command) => repositories.customers.amend(customer.id, command)}
          erase={{ subjectEntity: 'Customer', subjectId: customer.id }}
          onWritten={() => setReads((previous) => previous + 1)}
        />

        <Panel title="Contact" level={3}>
          <KeyValueList
            columns={2}
            items={[
              { key: 'mobile', label: 'Mobile', value: customer.mobile },
              { key: 'email', label: 'Email', value: customer.email },
              {
                key: 'address',
                label: 'Address',
                value: [customer.addressLine, customer.city, customer.state, customer.pincode]
                  .filter((part): part is string => part !== null && part !== '')
                  .join(', '),
              },
              {
                key: 'dob',
                label: 'Date of birth',
                value: customer.dateOfBirth ? (
                  <DateTime value={customer.dateOfBirth} mode="date" />
                ) : null,
              },
              {
                key: 'aadhaar',
                label: 'Aadhaar',
                value: (
                  <MaskedField
                    label="Last four"
                    last4={customer.aadhaarLast4}
                    note="The last four digits are the whole record."
                  />
                ),
              },
              {
                key: 'pan',
                label: 'PAN',
                value: <MaskedField label="Masked" value={customer.panNumber} kind="pan" />,
              },
            ]}
          />
        </Panel>

        <Tabs
          label="Customer 360"
          value={tab}
          onChange={(next) => void navigate(customerTabHref(customer.id, next as CustomerTab))}
          tabs={[
            { id: CUSTOMER_TABS.household, label: 'Household', count: members.length },
            { id: CUSTOMER_TABS.policies, label: 'Policies', count: policies.length },
            { id: CUSTOMER_TABS.documents, label: 'Documents', count: documents.length },
            { id: CUSTOMER_TABS.transactions, label: 'Transactions', count: collections.length },
            { id: CUSTOMER_TABS.requests, label: 'Requests', count: tasks.length },
            { id: CUSTOMER_TABS.kyc, label: 'KYC file' },
            { id: CUSTOMER_TABS.consent, label: 'Consent', count: dossier.withdrawals.length || undefined },
            { id: CUSTOMER_TABS.timeline, label: 'Timeline', count: events.length },
          ]}
        >
          {(activeId) => (
            <div className={styles.tabPanel}>{panels[activeId as CustomerTab] ?? panels.household}</div>
          )}
        </Tabs>
      </div>
    </>
  )
}

export default Customer360Screen
