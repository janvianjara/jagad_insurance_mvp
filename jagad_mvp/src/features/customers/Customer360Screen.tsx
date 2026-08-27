import { Link, useParams, useSearchParams } from 'react-router'
import type { ReactNode } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { ConsentBadge } from '../../components/ConsentBadge'
import { MaskedField } from '../../components/MaskedField'
import { RecordTimeline } from '../../components/RecordTimeline'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, Tabs } from '../../ui/surface'
import { DateTime, KeyValueList, Money, RecordId, RelativeTime } from '../../ui/type'
import { KycFile } from '../kyc'
import { useCustomerNow } from './clock'
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

const TAB_KEYS = [
  'household',
  'policies',
  'documents',
  'transactions',
  'requests',
  'kyc',
  'timeline',
] as const

type TabKey = (typeof TAB_KEYS)[number]

function readTab(value: string | null): TabKey {
  return TAB_KEYS.includes((value ?? '') as TabKey) ? ((value ?? '') as TabKey) : 'household'
}

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
 * their timeline (§7, "URL owns list state").
 */
export function Customer360Screen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const desk = customerDesk(repositories)
  const now = useCustomerNow()
  const [params, setParams] = useSearchParams()
  const tab = readTab(params.get('tab'))

  const loaded = useResource(async () => {
    const dossier = await desk.dossier(id)
    if (!dossier) return null
    const [events, users, products, companies] = await Promise.all([
      desk.timeline(id),
      repositories.config.users(),
      repositories.products.list({ page: 1, pageSize: 500 }),
      repositories.companies.list({ page: 1, pageSize: 500 }),
    ])
    return { dossier, events, users, products: products.rows, companies: companies.rows }
  }, `customer:${id}:${tab}`)

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

  const { dossier, events, users, products, companies } = loaded.data
  const { customer, household, members, policies, documents, tasks, collections, consent } = dossier

  const productName = (productId: string) =>
    products.find((product) => product.id === productId)?.name ?? productId
  const companyName = (companyId: string) =>
    companies.find((company) => company.id === companyId)?.name ?? companyId
  const staffName = (userId: string | null) =>
    userId === null ? 'Unassigned' : (users.find((user) => user.id === userId)?.name ?? userId)

  const live = activePolicies(policies)

  const panels: Readonly<Record<TabKey, ReactNode>> = {
    household: (
      <>
        <Panel
          title="Household"
          description="A floater covers a family, so the household is the unit a coverage gap is spotted on."
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
              This customer is not grouped into a household. Grouping is what lets a floater's
              covered lives and a coverage gap be seen together.
            </p>
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
        description="Both numbers on every row: ours always, the insurer's once it has arrived."
      >
        {policies.length === 0 ? (
          <p className={styles.none}>
            No policy has been entered for this customer yet. A won deal feeds policy entry with its
            line items already filled in.
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
            No collection has been recorded against this customer's policies. A payment made direct
            to the company appears as a reference rather than as money on the agency's books.
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
        description="Everything raised against this customer that somebody still owes an answer on. Customer-raised change requests arrive with the portal in P1; until then this is the work the agency raised itself."
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
        breadcrumb={<Link to="/customers">Customers</Link>}
        title={customer.fullName}
        meta={
          <>
            <RecordId systemNo={customer.systemNo} showInsurer={false} />
            <StatusPill tone={CUSTOMER_STATUS_TONE[customer.status]}>
              {CUSTOMER_STATUS_LABEL[customer.status]}
            </StatusPill>
            <StatusPill tone={KYC_TONE[customer.kycState]}>{KYC_LABEL[customer.kycState]}</StatusPill>
            <ConsentBadge
              state={customer.consentState}
              now={now}
              expiresAt={consent?.expiresAt ?? null}
              submittedAt={consent?.submittedAt ?? null}
            />
          </>
        }
        description={`${live.length} live ${live.length === 1 ? 'policy' : 'policies'} · on the books since ${new Date(customer.createdAt).getFullYear()}`}
      />

      <div className={styles.screen}>
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
          onChange={(next) => {
            const nextParams = new URLSearchParams(params)
            nextParams.set('tab', next)
            setParams(nextParams)
          }}
          tabs={[
            { id: 'household', label: 'Household', count: members.length },
            { id: 'policies', label: 'Policies', count: policies.length },
            { id: 'documents', label: 'Documents', count: documents.length },
            { id: 'transactions', label: 'Transactions', count: collections.length },
            { id: 'requests', label: 'Requests', count: tasks.length },
            { id: 'kyc', label: 'KYC and consent' },
            { id: 'timeline', label: 'Timeline', count: events.length },
          ]}
        >
          {(activeId) => <div className={styles.tabPanel}>{panels[readTab(activeId)]}</div>}
        </Tabs>
      </div>
    </>
  )
}

export default Customer360Screen
