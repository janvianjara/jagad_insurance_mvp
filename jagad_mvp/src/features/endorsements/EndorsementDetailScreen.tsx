import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { PageHeader } from '../../components/AppShell'
import { MachineActions } from '../../components/MachineActions'
import type { MachineAction } from '../../components/MachineActions'
import { RecordTimeline } from '../../components/RecordTimeline'
import { RecordOnlyAmount } from '../../components/guardrails'
import { endorsementMachine, noClaimInPeriod } from '../../domain/workflows'
import type { EndorsementContext, EndorsementState } from '../../domain/workflows'
import type { DomainEvent } from '../../domain/events'
import type { Money } from '../../domain/money'
import { can } from '../../domain/permissions'
import type { Endorsement, MutationResult, PolicyVersion } from '../../data/repo'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, Input, Textarea } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { Badge, StatusPill } from '../../ui/signal'
import { Panel, useToaster } from '../../ui/surface'
import { DateTime, KeyValueList, Money as AmountText, RecordId } from '../../ui/type'
import {
  ENDORSEMENT_LABEL,
  ENDORSEMENT_TONE,
  ENDORSEMENT_TYPE_LABEL,
  figureOf,
} from './endorsement-view'
import { shapeFor } from './form-shape'
import styles from './Endorsements.module.css'

/** Where the type sends a record off `type_selected`. §9, not the caller. */
const PATH_FOR: Readonly<Record<Endorsement['type'], EndorsementState>> = {
  non_financial: 'non_financial',
  financial: 'delta_entry',
  cancellation: 'claims_check',
}

/**
 * `/endorsements/:id` — plan §5 ("Endorsement"), §9, canvas n51–n56.
 *
 * The screen is §9's endorsement machine with a face on it. Every control below
 * is one edge of `endorsementMachine`, asked before it is drawn, so a move the
 * machine will refuse is disabled with the machine's own sentence under it
 * instead of failing after a write.
 *
 * Three §9 bullets are visible rather than merely enforced:
 *
 *   - the body reshapes with the type, and a non-financial endorsement renders
 *     no premium field and no amount anywhere on the page;
 *   - the claims-in-period check is read from the platform's own claim data and
 *     shown before anybody presses anything, with the claim named when there is
 *     one;
 *   - approval writes an immutable policy version carrying both endorsement
 *     numbers, and the versions panel shows them side by side afterwards.
 *
 * Every figure on this screen was typed by a person off an insurer's document.
 * Nothing here subtracts one premium from another and nothing pro-rates a refund.
 */
export function EndorsementDetailScreen() {
  const { id = '' } = useParams()
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const loaded = useResource(() => repositories.endorsements.get(id), `endorsement:${id}`)
  const verdict = useResource(() => repositories.endorsements.claimsInPeriod(id), `endorsement:claims:${id}`)

  const [written, setWritten] = useState<{
    id: string
    record: Endorsement
    events: DomainEvent[]
  } | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const [amount, setAmount] = useState<Money | null>(null)
  const [insurerReference, setInsurerReference] = useState('')
  const [insurerEndorsementNo, setInsurerEndorsementNo] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [note, setNote] = useState('')

  const fresh = written && written.id === id ? written : null
  const endorsement = fresh?.record ?? loaded.data ?? null
  const events = fresh?.events ?? []

  const context = useResource(async () => {
    if (endorsement === null) return null
    const [policy, customer, versions] = await Promise.all([
      repositories.policies.get(endorsement.policyId),
      repositories.customers.get(endorsement.customerId),
      repositories.policies.versions(endorsement.policyId),
    ])
    return { policy, customer, versions }
  }, `endorsement:context:${endorsement?.policyId ?? 'none'}:${endorsement?.policyVersionId ?? 'none'}`)

  if (!user || (loaded.isLoading && endorsement === null)) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  if (endorsement === null) {
    return (
      <EmptyState
        variant="error"
        title="No endorsement answers to that address"
        explanation={`Nothing is stored under ${id}. It may have been raised in another session, or the link may be wrong.`}
        action={
          <Button variant="primary" onClick={() => void navigate('/endorsements')}>
            Back to the queue
          </Button>
        }
      />
    )
  }

  const record = endorsement
  const shape = shapeFor(record.type)
  const reading = figureOf(record)
  // The verdict the record was decided on wins; the live read is for a record
  // that has not run the check yet. A claim raised since would otherwise argue
  // with a refund somebody already recorded.
  const claims = record.claimsVerdict ?? verdict.data ?? null
  const policy = context.data?.policy ?? null
  const customer = context.data?.customer ?? null
  const versions: readonly PolicyVersion[] = context.data?.versions ?? []
  // Read out here so the action builder below, which is a declaration rather
  // than a closure over a narrowed binding, still knows the session is present.
  const actorId = user.id
  const mayAct = can(user, 'edit', 'endorsements')
  const mayApprove = can(user, 'approve', 'endorsements')

  /**
   * The facts the guards read. The claims list is the platform's own verdict,
   * never something a control passed in.
   */
  function ctxFor(extra: Partial<EndorsementContext> = {}): EndorsementContext {
    return {
      type: record.type,
      renderedFields: extra.renderedFields ?? [],
      changedFields: record.changedFields,
      replacesInsuredEntity: record.replacesInsuredEntity,
      claimsInPeriod: (claims?.claimIds ?? []).map((claimId) => ({ claimId, occurredOn: '' })),
      endorsementNo: record.systemNo,
      ...extra,
    }
  }

  async function commit(receipt: string, run: () => Promise<MutationResult<Endorsement>>) {
    const outcome = await run()
    if (!outcome.ok) {
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
    setAmount(null)
    setInsurerReference('')
    toaster.notify({ title: receipt, tone: 'ok' })
    verdict.reload()
    context.reload()
  }

  const actions: readonly MachineAction[] = buildActions()

  function buildActions(): readonly MachineAction[] {
    const state = record.state
    const ask = (to: EndorsementState, extra?: Partial<EndorsementContext>) =>
      endorsementMachine.canTransition(state, to, ctxFor(extra))

    /**
     * A control's verdict answers "is this edge open for this record", not "is
     * what you have typed enough yet".
     *
     * The difference matters because the form a move needs lives inside the
     * gate: asking the machine about an empty draft would disable the control
     * that opens the form the draft is typed into, and nobody could ever fill
     * it. So an edge whose only guards read the draft is offered, and the gate
     * refuses to confirm an empty preview until the figures are there. The
     * repository then asks the machine again with what was actually typed, so
     * nothing is written on the strength of this leniency.
     */
    const draftDecides: MachineAction['verdict'] = { ok: true }

    if (state === 'type_selected') {
      const to = PATH_FOR[record.type]
      return [
        {
          key: 'select-type',
          label: `Take this onto the ${ENDORSEMENT_TYPE_LABEL[record.type].toLowerCase()} path`,
          variant: 'primary',
          verdict: ask(to),
          confirmTitle: `Type ${record.systemNo} as ${ENDORSEMENT_TYPE_LABEL[record.type].toLowerCase()}`,
          confirmLabel: 'Confirm the type',
          changes: [
            { key: 'state', label: 'Status', from: ENDORSEMENT_LABEL[state], to: ENDORSEMENT_LABEL[to] },
            { key: 'fields', label: 'Changing', to: record.changedFields.join(', ') || 'nothing recorded' },
          ],
          note: shape.explanation,
          run: () =>
            void commit('The endorsement is on its path', () =>
              repositories.endorsements.selectType(id, {
                actorId,
                // What this screen is drawing, reported honestly: at this point
                // it draws no premium field for any type.
                renderedFields: [],
                changedFields: record.changedFields,
                permittedFields: shape.permittedFields,
                replacesInsuredEntity: record.replacesInsuredEntity,
              }),
            ),
        },
      ]
    }

    if (state === 'delta_entry') {
      return [
        {
          key: 'record-delta',
          label: 'Record the premium delta',
          variant: 'primary',
          verdict: draftDecides,
          confirmTitle: `Record the delta on ${record.systemNo}`,
          confirmLabel: 'Record the delta',
          changes:
            amount === null
              ? []
              : [
                  {
                    key: 'delta',
                    label: 'Premium delta, as typed',
                    to: <AmountText paise={amount.paise} currency={amount.currency} />,
                  },
                  {
                    key: 'reference',
                    label: 'Insurer advice',
                    to: insurerReference === '' ? 'not recorded' : insurerReference,
                  },
                  { key: 'state', label: 'Status', from: ENDORSEMENT_LABEL[state], to: 'Submitted' },
                ],
          note: 'The figure is the insurer’s own, typed from its endorsement advice. Recording it submits the endorsement and books the commission delta.',
          form: (
            <div className={styles.fieldGrid}>
              <RecordOnlyAmount
                label="Premium delta"
                value={amount}
                onValueChange={setAmount}
                hint="Read off the insurer endorsement advice."
              />
              <Field label="Insurer advice reference">
                <Input
                  value={insurerReference}
                  onChange={(event) => setInsurerReference(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          ),
          run: () => {
            if (amount === null) return
            void commit('The delta is recorded and the endorsement submitted', () =>
              repositories.endorsements.recordDelta(id, {
                actorId,
                delta: amount,
                source: 'typed_from_insurer',
                ...(insurerReference === '' ? {} : { insurerReference }),
              }),
            )
          },
        },
      ]
    }

    if (state === 'claims_check') {
      return [
        {
          key: 'block-refund',
          label: 'Record that no refund is due',
          verdict: ask('refund_not_eligible'),
          confirmTitle: `No refund on ${record.systemNo}`,
          confirmLabel: 'Record no refund',
          changes: [
            { key: 'state', label: 'Status', from: ENDORSEMENT_LABEL[state], to: 'No refund due' },
            {
              key: 'claims',
              label: 'Claims inside the period',
              to: (claims?.claimIds ?? []).join(', ') || 'none',
            },
          ],
          note: 'The cancellation still goes through; the refund does not. The claim that decided it stays named on the record.',
          run: () =>
            void commit('Recorded: no refund is due', () =>
              repositories.endorsements.blockRefund(id, { actorId }),
            ),
        },
        {
          key: 'record-refund',
          label: 'Record the insurer’s refund',
          variant: 'primary',
          verdict: noClaimInPeriod(ctxFor()),
          confirmTitle: `Record the refund on ${record.systemNo}`,
          confirmLabel: 'Record the refund',
          changes:
            amount === null || insurerReference.trim() === ''
              ? []
              : [
                  {
                    key: 'refund',
                    label: 'Refund, as typed',
                    to: <AmountText paise={amount.paise} currency={amount.currency} />,
                  },
                  { key: 'reference', label: 'Insurer reference', to: insurerReference },
                  { key: 'state', label: 'Status', from: ENDORSEMENT_LABEL[state], to: 'Refund recorded' },
                ],
          note: 'The platform records the insurer’s figure. It does not pro-rate a refund across the unexpired term, and there is nowhere here for one that it worked out itself.',
          form: (
            <div className={styles.fieldGrid}>
              <RecordOnlyAmount
                label="Refund amount"
                value={amount}
                onValueChange={setAmount}
                hint="The insurer’s own figure."
              />
              <Field label="Insurer reference" required hint="§9 asks which document the figure came from.">
                <Input
                  value={insurerReference}
                  onChange={(event) => setInsurerReference(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          ),
          run: () => {
            if (amount === null) return
            void commit('The refund figure is recorded', () =>
              repositories.endorsements.recordRefund(id, {
                actorId,
                refund: amount,
                source: 'typed_from_insurer',
                insurerReference,
              }),
            )
          },
        },
      ]
    }

    if (state === 'non_financial' || state === 'refund_not_eligible' || state === 'refund_typed') {
      return [
        {
          key: 'submit',
          label: 'Submit to the insurer desk',
          variant: 'primary',
          verdict: ask('submitted'),
          confirmTitle: `Submit ${record.systemNo}`,
          confirmLabel: 'Submit the endorsement',
          changes: [
            { key: 'state', label: 'Status', from: ENDORSEMENT_LABEL[state], to: 'Submitted' },
          ],
          note: 'The endorsement goes to the desk that deals with this insurer. Nothing on the policy changes until it is approved and versioned.',
          run: () =>
            void commit('Submitted', () =>
              repositories.endorsements.submit(id, { actorId }),
            ),
        },
      ]
    }

    if (state === 'submitted') {
      return [
        {
          key: 'approve',
          label: 'Approve',
          variant: 'primary',
          verdict: mayApprove
            ? ask('approved')
            : { ok: false, reason: 'Your role can move this endorsement on but not approve it.' },
          confirmTitle: `Approve ${record.systemNo}`,
          confirmLabel: 'Approve the endorsement',
          changes: [{ key: 'state', label: 'Status', from: 'Submitted', to: 'Approved' }],
          note: 'Approval books the commission delta for a financial endorsement. The immutable policy version is written in the next step, with both endorsement numbers on it.',
          run: () =>
            void commit('Approved', () =>
              repositories.endorsements.approve(id, { actorId }),
            ),
        },
      ]
    }

    if (state === 'approved') {
      const nextVersion = versions.length + 1
      const ready =
        insurerEndorsementNo.trim() !== '' && effectiveFrom !== '' && note.trim() !== ''
      return [
        {
          key: 'version-policy',
          label: 'Write the policy version',
          variant: 'primary',
          verdict: draftDecides,
          confirmTitle: `Version ${policy?.systemNo ?? 'the policy'} at v${nextVersion}`,
          confirmLabel: 'Write the version',
          changes: ready
            ? [
                { key: 'version', label: 'New version', to: `v${nextVersion}` },
                { key: 'ours', label: 'Our endorsement number', to: record.systemNo },
                { key: 'theirs', label: 'Insurer endorsement number', to: insurerEndorsementNo.trim() },
                { key: 'effective', label: 'Effective from', to: effectiveFrom },
              ]
            : [],
          note: 'The new version is written, never edited over the old one. Both endorsement numbers go on it, because both get read aloud on the phone.',
          form: (
            <div className={styles.fieldGrid}>
              <Field label="Insurer endorsement number" required>
                <Input
                  value={insurerEndorsementNo}
                  onChange={(event) => setInsurerEndorsementNo(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Effective from" required>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </Field>
              <Field label="What this version records" required>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
              </Field>
            </div>
          ),
          run: () =>
            void commit('The policy version is written', () =>
              repositories.endorsements.versionPolicy(id, {
                actorId,
                insurerEndorsementNo: insurerEndorsementNo.trim(),
                effectiveFrom,
                note: note.trim(),
              }),
            ),
        },
      ]
    }

    return []
  }

  return (
    <>
      <PageHeader
        title={`${ENDORSEMENT_TYPE_LABEL[record.type]} endorsement`}
        backTo={{ to: '/endorsements', label: 'Endorsements' }}
        meta={
          <>
            <RecordId
              systemNo={record.systemNo}
              insurerNo={record.insurerEndorsementNo}
              awaitedText="insurer endorsement no. awaited"
            />
            <StatusPill tone={ENDORSEMENT_TONE[record.state]}>
              {ENDORSEMENT_LABEL[record.state]}
            </StatusPill>
            <Badge caps>{ENDORSEMENT_TYPE_LABEL[record.type]}</Badge>
          </>
        }
      />

      <div className={styles.page}>
        {refusal === null ? null : (
          <div className={styles.blocked} role="alert">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>Nothing was changed</p>
              <p className={styles.blockedReason}>{refusal}</p>
            </div>
          </div>
        )}

        <div className={styles.columns}>
          <div className={styles.stack}>
            <Panel title="The change" description={shape.explanation}>
              <KeyValueList
                columns={2}
                items={[
                  {
                    key: 'policy',
                    label: 'Policy',
                    value: policy ? (
                      <Link to={`/policies/${policy.id}`}>
                        <RecordId systemNo={policy.systemNo} insurerNo={policy.insurerNo} />
                      </Link>
                    ) : null,
                  },
                  {
                    key: 'customer',
                    label: 'Customer',
                    value: customer ? (
                      <Link to={`/customers/${customer.id}`}>{customer.fullName}</Link>
                    ) : null,
                  },
                  { key: 'reason', label: 'Why it was raised', value: record.reason },
                  {
                    key: 'fields',
                    label: 'What is changing',
                    value: record.changedFields
                      .map(
                        (key) =>
                          shape.changeFields.find((field) => field.key === key)?.label ?? key,
                      )
                      .join(', '),
                  },
                  {
                    key: 'effective',
                    label: 'Effective from',
                    value: record.effectiveFrom ? (
                      <DateTime value={record.effectiveFrom} mode="date" />
                    ) : null,
                  },
                  {
                    key: 'raised',
                    label: 'Raised',
                    value: <DateTime value={record.requestedAt} mode="datetime" />,
                  },
                ]}
              />
            </Panel>

            {/*
              The money block, and §9's rule made physical. `figureOf` returns
              nothing for a correction, so this panel does not exist on one:
              there is no disabled premium field, no zero and no empty slot.
            */}
            {reading === null ? (
              <Panel title="No money on this endorsement" level={2}>
                <p className={styles.prose}>
                  A correction changes what the schedule says about a person, not what the cover
                  costs. This endorsement carries no premium delta and no refund, and there is no
                  field on this screen to record one — §9 asks for no premium fields at all on a
                  non-financial endorsement, and a disabled one would still be one.
                </p>
              </Panel>
            ) : (
              <Panel
                title={reading.label}
                description="Typed from the insurer’s own document. The platform records this figure; it never calculates one."
              >
                {reading.figure.amount === null ? (
                  <p className={styles.prose}>
                    Not typed yet. It is read off the insurer’s advice and entered on this record —
                    nothing derives it from the premium already on the policy.
                  </p>
                ) : (
                  <div className={styles.figure}>
                    <span className={styles.figureValue}>
                      <AmountText
                        paise={reading.figure.amount.paise}
                        currency={reading.figure.amount.currency}
                        emphasis="strong"
                      />
                    </span>
                    <span className={styles.figureSource}>
                      {reading.figure.source === 'typed_from_insurer'
                        ? 'Typed from the insurer figure'
                        : 'Source not recorded'}
                    </span>
                    {reading.figure.insurerReference === null ? null : (
                      <span className={styles.reference}>{reading.figure.insurerReference}</span>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {record.type === 'cancellation' ? (
              <Panel
                title="Claims in the policy period"
              >
                {claims === null ? (
                  <p className={styles.prose}>The check has not been run on this record yet.</p>
                ) : claims.refundEligible ? (
                  <div className={styles.claims}>
                    <StatusPill tone="ok">No claim in the period</StatusPill>
                    <p className={styles.prose}>
                      Nothing was claimed inside this policy period, so the cancellation is
                      refund-eligible and the insurer’s refund figure is typed on the record.
                    </p>
                  </div>
                ) : (
                  <div className={styles.claims}>
                    <StatusPill tone="warn">A claim fell inside the period</StatusPill>
                    <p className={styles.prose}>
                      A claim was made inside this policy period, so no refund is due on
                      cancellation. The cancellation still goes through.
                    </p>
                    <p className={styles.claimIds}>{claims.claimIds.join(', ')}</p>
                  </div>
                )}
              </Panel>
            ) : null}

            <Panel
              title="Policy versions"
              description="Written, never edited. Each one carries our endorsement number and the insurer’s."
            >
              {versions.length === 0 ? (
                <p className={styles.prose}>
                  This policy has no endorsement version yet. Approving this endorsement writes one.
                </p>
              ) : (
                <ul className={styles.versionList}>
                  {[...versions]
                    .sort((a, b) => b.version - a.version)
                    .map((version) => (
                      <li key={version.id} className={styles.version}>
                        <span className={styles.versionHead}>
                          <span>v{version.version}</span>
                          <DateTime value={version.effectiveFrom} mode="date" />
                        </span>
                        <span className={styles.versionNumbers}>
                          <span>ours {version.endorsementNo ?? 'none'}</span>
                          <span>insurer {version.insurerEndorsementNo ?? 'none'}</span>
                        </span>
                        <p className={styles.versionNote}>{version.note}</p>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className={styles.stack}>
            <Panel title="What happens next" level={2}>
              <MachineActions
                actions={actions}
                armed={armed}
                onArm={setArmed}
                permitted={mayAct}
                permissionNote="Your role can read this endorsement but not move it on."
                emptyText="The policy is versioned and this endorsement is closed. Earlier versions stay exactly as they were issued."
              />
            </Panel>

            <Panel title="Timeline" level={2}>
              <RecordTimeline
                events={events}
                label={`${record.systemNo} timeline`}
                emptyText="Nothing has been done to this endorsement in this session. Every move made from here appears in this list, with who made it and when."
              />
            </Panel>
          </div>
        </div>
      </div>
    </>
  )
}

export default EndorsementDetailScreen
