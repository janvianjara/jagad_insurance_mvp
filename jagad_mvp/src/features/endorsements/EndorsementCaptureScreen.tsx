import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { PageHeader } from '../../components/AppShell'
import { ConfirmGate, RecordOnlyAmount } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { changeFitsEndorsementScope, nonFinancialRendersNoPremiumFields } from '../../domain/workflows'
import type { EndorsementType, TransitionResult } from '../../domain/workflows'
import type { Money } from '../../domain/money'
import type { Customer, Policy } from '../../data/repo'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { Skeleton } from '../../ui/data'
import { Checkbox, Combobox, DatePicker, Field, FormRow, FormSection, Input, RadioGroup, Textarea } from '../../ui/form'
import { Icon } from '../../ui/Icon'
import { Money as AmountText } from '../../ui/type'
import { useToaster } from '../../ui/surface'
import { ENDORSEMENT_TYPE_LABEL } from './endorsement-view'
import { renderedFieldsOf, shapeFor } from './form-shape'
import styles from './Endorsements.module.css'

const TYPE_ORDER: readonly EndorsementType[] = ['non_financial', 'financial', 'cancellation']

function isEndorsementType(value: string | null): value is EndorsementType {
  return value !== null && (TYPE_ORDER as readonly string[]).includes(value)
}

/**
 * `/endorsements/new?policyId=&type=` — plan §4 ("the form reshapes by
 * endorsement type"), §9, canvas n51.
 *
 * The reshape is the screen. `shapeFor(type)` decides which change fields are
 * offered, what the section says, and — the §9 bullet that matters most —
 * whether a premium field exists on the page at all. A correction renders none:
 * not a disabled one, not a hidden one, none. The form then reports exactly what
 * it drew to `selectType`, and `nonFinancialRendersNoPremiumFields` checks the
 * claim against the report, so the rule is asserted by the machine as well as by
 * the layout.
 *
 * The scope guard is called here, before anything is written, with the same
 * arguments the transition will use. A change that replaces the insured person
 * or asset outright is refused with the machine's own sentence and a way to do
 * what the sentence suggests — issue a fresh policy — rather than a dead button.
 */
export function EndorsementCaptureScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const [params] = useSearchParams()

  const askedPolicyId = params.get('policyId') ?? ''
  const askedType = params.get('type')

  const context = useResource(async () => {
    const [policies, customers] = await Promise.all([
      repositories.policies.list({ page: 1, pageSize: 500 }),
      repositories.customers.list({ page: 1, pageSize: 500 }),
    ])
    return { policies: policies.rows, customers: customers.rows }
  }, 'endorsements:capture-context')

  const [policyId, setPolicyId] = useState<string | null>(askedPolicyId === '' ? null : askedPolicyId)
  const [type, setType] = useState<EndorsementType>(isEndorsementType(askedType) ? askedType : 'non_financial')
  const [reason, setReason] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [changed, setChanged] = useState<readonly string[]>([])
  const [replacesInsuredEntity, setReplacesInsuredEntity] = useState(false)
  const [delta, setDelta] = useState<Money | null>(null)
  const [insurerReference, setInsurerReference] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  const { policies, customers } = context.data
  const shape = shapeFor(type)
  const policy: Policy | null = policies.find((row) => row.id === policyId) ?? null
  const customer: Customer | null =
    policy === null ? null : (customers.find((row) => row.id === policy.customerId) ?? null)

  /**
   * The form is reshaping, so a field the new type does not offer is dropped
   * rather than carried silently into a command it does not belong in.
   */
  function chooseType(next: EndorsementType) {
    const nextShape = shapeFor(next)
    setType(next)
    setChanged((held) => held.filter((key) => nextShape.permittedFields.includes(key)))
    if (nextShape.premiumFields.length === 0) {
      setDelta(null)
      setInsurerReference('')
    }
    setRefusal(null)
  }

  function toggleField(key: string, on: boolean) {
    setChanged((held) => (on ? [...held, key] : held.filter((name) => name !== key)))
  }

  const renderedFields = renderedFieldsOf(shape)

  // The same functions the transition will call, called here so a refusal reads
  // as prose beside the control rather than as a failure after a write.
  const scopeVerdict: TransitionResult = changeFitsEndorsementScope({
    type,
    changedFields: changed,
    scope: { permittedFields: shape.permittedFields },
    replacesInsuredEntity,
  })
  const premiumVerdict: TransitionResult = nonFinancialRendersNoPremiumFields({
    type,
    renderedFields,
    ...(delta === null ? {} : { delta: { amount: delta } }),
  })

  const complete = policy !== null && reason.trim() !== '' && changed.length > 0
  const ready = complete && scopeVerdict.ok && premiumVerdict.ok

  const changes: readonly ConfirmChange[] = ready
    ? [
        { key: 'policy', label: 'Policy', to: policy ? policy.systemNo : '' },
        { key: 'customer', label: 'Customer', to: customer?.fullName ?? 'Customer not on file' },
        { key: 'type', label: 'Endorsement type', to: ENDORSEMENT_TYPE_LABEL[type] },
        {
          key: 'fields',
          label: 'Changing',
          to: shape.changeFields
            .filter((field) => changed.includes(field.key))
            .map((field) => field.label)
            .join(', '),
        },
        {
          key: 'effective',
          label: 'Effective from',
          to: effectiveFrom === '' ? 'not set yet' : effectiveFrom,
        },
        ...(delta === null
          ? []
          : [
              {
                key: 'delta',
                label: 'Premium delta, as typed',
                to: (
                  <span className={styles.figure}>
                    <AmountText paise={delta.paise} currency={delta.currency} />
                    <span className={styles.figureSource}>
                      {insurerReference === ''
                        ? 'from the insurer endorsement advice'
                        : `insurer advice ${insurerReference}`}
                    </span>
                  </span>
                ),
              } satisfies ConfirmChange,
            ]),
      ]
    : []

  async function raise() {
    if (!user || policy === null) return

    const created = await repositories.endorsements.create({
      actorId: user.id,
      policyId: policy.id,
      customerId: policy.customerId,
      type,
      ownerId: user.id,
      reason: reason.trim(),
      ...(effectiveFrom === '' ? {} : { effectiveFrom }),
      changedFields: changed,
      replacesInsuredEntity,
    })

    if (!created.ok) {
      setRefusal(created.reason)
      toaster.notify({ title: 'Nothing was recorded', detail: created.reason, tone: 'bad' })
      return
    }

    // The type decides the edge; the caller never names a target state. What it
    // does hand over is what the form actually drew.
    const typed = await repositories.endorsements.selectType(created.record.id, {
      actorId: user.id,
      renderedFields,
      changedFields: changed,
      permittedFields: shape.permittedFields,
      replacesInsuredEntity,
    })

    if (!typed.ok) {
      setRefusal(typed.reason)
      toaster.notify({ title: 'The endorsement was not typed', detail: typed.reason, tone: 'bad' })
      void navigate(`/endorsements/${created.record.id}`)
      return
    }

    if (delta !== null) {
      const recorded = await repositories.endorsements.recordDelta(created.record.id, {
        actorId: user.id,
        delta,
        source: 'typed_from_insurer',
        ...(insurerReference === '' ? {} : { insurerReference }),
      })
      if (!recorded.ok) {
        setRefusal(recorded.reason)
        toaster.notify({ title: 'The delta was not recorded', detail: recorded.reason, tone: 'bad' })
        void navigate(`/endorsements/${created.record.id}`)
        return
      }
    }

    toaster.notify({ title: `${created.record.systemNo} raised`, tone: 'ok' })
    void navigate(`/endorsements/${created.record.id}`)
  }

  return (
    <>
      <PageHeader
        title="New endorsement"
        backTo={{ to: '/endorsements', label: 'Endorsements' }}
        actions={
          <Button variant="quiet" onClick={() => void navigate('/endorsements')}>
            Cancel
          </Button>
        }
      />

      <div className={styles.page}>
        <FormSection
          title="What is being endorsed"
        >
          <FormRow columns={2}>
            <Field label="Policy" required>
              <Combobox
                options={policies.map((row) => ({
                  value: row.id,
                  label: row.systemNo,
                  hint: customers.find((person) => person.id === row.customerId)?.fullName ?? '',
                }))}
                value={policyId}
                onValueChange={setPolicyId}
                placeholder="Search by our policy number"
                emptyText="No policy answers to that number"
              />
            </Field>

            <Field label="Effective from" optional hint="The date the change takes effect on the cover.">
              <DatePicker
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>
          </FormRow>

          <Field label="Endorsement type" control="group" required>
            <RadioGroup
              name="endorsement-type"
              value={type}
              onValueChange={(next) => chooseType(next as EndorsementType)}
              options={TYPE_ORDER.map((candidate) => ({
                value: candidate,
                label: ENDORSEMENT_TYPE_LABEL[candidate],
                description: shapeFor(candidate).summary,
              }))}
            />
          </Field>
        </FormSection>

        <FormSection title={shape.heading} description={shape.explanation}>
          <Field label="What is changing" control="group" required>
            <ul className={styles.checkList}>
              {shape.changeFields.map((field) => (
                <li key={field.key}>
                  <Checkbox
                    label={field.label}
                    description={field.hint}
                    checked={changed.includes(field.key)}
                    onChange={(event) => toggleField(field.key, event.target.checked)}
                  />
                </li>
              ))}
            </ul>
          </Field>

          <Field label="Why it is being raised" required hint="In the words of whoever raised it.">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
          </Field>

          <Checkbox
            label="This change swaps the insured person or asset outright"
            checked={replacesInsuredEntity}
            onChange={(event) => setReplacesInsuredEntity(event.target.checked)}
          />
        </FormSection>

        {/*
          The premium block, and the whole of §9's non-financial rule in one
          condition: a correction has no premium fields, so this section is not
          rendered for one. There is no disabled variant of it.
        */}
        {shape.premiumFields.includes('premiumDelta') ? (
          <FormSection
            title="Premium delta"
            description="Typed from the insurer endorsement advice. This platform records the figure; it never works one out from the old and the new premium."
          >
            <FormRow columns={2}>
              <RecordOnlyAmount
                label="Premium delta"
                value={delta}
                onValueChange={setDelta}
                hint="Positive where the insurer charges more, negative where it refunds."
              />
              <Field label="Insurer advice reference" hint="Which document the figure was read off.">
                <Input
                  value={insurerReference}
                  onChange={(event) => setInsurerReference(event.target.value)}
                  autoComplete="off"
                />
              </Field>
            </FormRow>
          </FormSection>
        ) : null}

        {shape.runsClaimsCheck ? (
          <div className={styles.needsPerson} role="note">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>The claims-in-period check runs next</p>
              <p className={styles.blockedReason}>
                Once this cancellation is raised, the platform checks its own claim data for the
                policy period and answers straight away. A claim inside the period means no refund
                is due; a clear period means the insurer’s refund figure is typed on the record.
                Nothing is pro-rated here.
              </p>
            </div>
          </div>
        ) : null}

        {scopeVerdict.ok ? null : (
          <div className={styles.blocked} role="alert">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>This is more than an endorsement can carry</p>
              <p className={styles.blockedReason}>{scopeVerdict.reason}</p>
              <p>
                <Link to="/policies/new">Start a fresh policy instead</Link>
              </p>
            </div>
          </div>
        )}

        {premiumVerdict.ok ? null : (
          <div className={styles.blocked} role="alert">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>A correction carries no money</p>
              <p className={styles.blockedReason}>{premiumVerdict.reason}</p>
            </div>
          </div>
        )}

        {refusal === null ? null : (
          <div className={styles.blocked} role="alert">
            <Icon name="alert" size="md" />
            <div className={styles.blockedBody}>
              <p className={styles.blockedTitle}>Nothing was changed</p>
              <p className={styles.blockedReason}>{refusal}</p>
            </div>
          </div>
        )}

        <ConfirmGate
          title="Raise this endorsement"
          changes={changes}
          confirmLabel="Raise endorsement"
          receipt="Raised. The endorsement is open on the policy."
          note={
            complete
              ? 'The endorsement is recorded against the policy and takes its type’s own path. Nothing goes to the insurer from this screen.'
              : 'Pick a policy, say what is changing and why, and the preview will fill in.'
          }
          onCancel={() => void navigate('/endorsements')}
          onConfirm={() => void raise()}
        />
      </div>
    </>
  )
}

export default EndorsementCaptureScreen
