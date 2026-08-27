import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import { canHardDeletePolicy, retentionWindowElapsed } from '../../domain/workflows'
import type { KycState } from '../../domain/workflows'
import { useResource } from '../../lib/useResource'
import { PageHeader } from '../../components/AppShell'
import { RollUp } from '../../components/guardrails'
import type { RollUpComponent } from '../../components/guardrails'
import type { Customer, Product, Repositories, RetentionClass } from '../../data/repo'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { StatusPill } from '../../ui/signal'
import { Panel } from '../../ui/surface'
import { KeyValueList, Money, RecordId } from '../../ui/type'
import { IssuancePanel } from './IssuancePanel'
import { PaymentFork } from './PaymentFork'
import { policyDesk } from './data/policy-desk'
import type { PolicyDossier } from './data/policy-desk'
import {
  ENTRY_PATH_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  POLICY_LABEL,
  POLICY_TONE,
  PREMIUM_MODE_LABEL,
} from './policy-view'
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
 */

type DetailData = {
  readonly dossier: PolicyDossier
  readonly customer: Customer | null
  readonly product: Product | null
  readonly retention: RetentionClass | null
}

async function loadDetail(
  repositories: Repositories,
  policyId: string,
): Promise<DetailData | null> {
  const desk = policyDesk(repositories)
  const dossier = await desk.dossier(policyId)
  if (!dossier) return null

  const [customer, product, classes] = await Promise.all([
    repositories.customers.get(dossier.policy.customerId),
    repositories.products.get(dossier.policy.productId),
    repositories.config.retentionClasses(),
  ])

  return {
    dossier,
    customer,
    product,
    retention: classes.find((entry) => entry.key === dossier.policy.retentionClass) ?? null,
  }
}

/**
 * The typed components this record carries, for the derived cross-check.
 *
 * `Policy` stores Net and GST as they were typed and stores Final separately, so
 * the roll-up here has exactly one component — the recorded Net. It is not the
 * sum of anything this screen worked out; it is the figure somebody entered,
 * handed to `<RollUp>` so the same relationship the entry screen showed is
 * visible on the record afterwards.
 */
function recordedComponents(net: RollUpComponent['amount'] | null): readonly RollUpComponent[] {
  if (net === null) return []
  return [{ key: 'netPremium', label: 'Net premium, as recorded', amount: net }]
}

export function PolicyDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const user = useSessionStore((state) => state.user)

  const [reads, setReads] = useState(0)
  const loaded = useResource(() => loadDetail(repositories, id), `policy:${id}:${reads}`)

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

  const { dossier, customer, product, retention } = loaded.data
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

  return (
    <div className={styles.screen}>
      <PageHeader
        title={customer?.fullName ?? 'Policy'}
        meta={
          <>
            <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
            {product ? <span>{product.name}</span> : null}
          </>
        }
        actions={<StatusPill tone={POLICY_TONE[policy.status]}>{POLICY_LABEL[policy.status]}</StatusPill>}
      />

      <Panel title="The record" description="What this policy is, as it stands.">
        <KeyValueList
          items={[
            { key: 'state', label: 'State', value: POLICY_LABEL[policy.status] },
            {
              key: 'entry',
              label: 'How it was entered',
              value: ENTRY_PATH_LABEL[draft?.entryPath ?? 'proposal'],
            },
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
        <RollUp
          components={recordedComponents(policy.netPremium)}
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

      <Panel title="Versions" description="Immutable. A version is written, never edited.">
        {dossier.versions.length === 0 ? (
          <p className={styles.quiet}>No endorsement has been written against this policy.</p>
        ) : (
          <ul className={styles.versions}>
            {dossier.versions.map((version) => (
              <li key={version.id}>
                <RecordId
                  systemNo={version.endorsementNo ?? `v${version.version}`}
                  insurerNo={version.insurerEndorsementNo}
                />
                <span className={styles.quiet}>{version.note}</span>
              </li>
            ))}
          </ul>
        )}
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
    </div>
  )
}

export default PolicyDetailScreen
