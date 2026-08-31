import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { can } from '../../domain/permissions'
import {
  KYC_STATES,
  POLICY_ENTRY_PATHS,
  PREMIUM_MODES,
  dealHasLineItems,
  finalPremiumPresentAndTyped,
  reasonOf,
} from '../../domain/workflows'
import type { PolicyEntryPath, PremiumMode } from '../../domain/workflows'
import { browserDraftStore, SchemaForm } from '../../components/SchemaForm'
import type { SchemaFormSubmission } from '../../components/SchemaForm'
import { ConfirmGate } from '../../components/guardrails'
import type { ConfirmChange } from '../../components/guardrails'
import { PageHeader } from '../../components/AppShell'
import { decodeDraft, draftKey, readMoney } from '../../domain/forms'
import type { FormSchema, FormValues } from '../../domain/forms'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Field, RadioGroup, Select } from '../../ui/form'
import { Panel, useToaster } from '../../ui/surface'
import { KeyValueList, Money as AmountText } from '../../ui/type'
import type { KeyValueItem } from '../../ui/type'
import { placementOptionsFor, useEnsureMarket, useMarketStore } from '../config/shared'
import { PremiumBlock } from './PremiumBlock'
import { policyDesk } from './data/policy-desk'
import { TYPED_PREMIUM_SOURCES, premiumShapeOf } from './entry-types'
import type { PremiumEntry } from './entry-types'
import {
  fieldLabelsFrom,
  loadEntryContext,
  missingKeysOf,
  retentionClassFor,
  schemaForProduct,
} from './entry-data'
import { ENTRY_PATH_LABEL, ENTRY_PATH_SERIES } from './policy-view'
import styles from './PolicyEntryScreen.module.css'
import { appointedCompanyIds, appointedProductIds } from '../../domain/workflows'

/**
 * `/policies/new` — policy entry, plan §5's "Policy entry (schema-driven)" row,
 * §9's policy machine, canvas 3.6.
 *
 * The screen is an arrangement of things that already exist, and each of the
 * four is load-bearing:
 *
 *   **The form is `<SchemaForm>`.** Every question a policy asks is a schema an
 *   admin publishes, and the schema is chosen by the product — health, motor and
 *   life each have their own, and a product configured with a form of its own
 *   beats both. There is no bespoke policy form here and there must never be
 *   one: the moment entry is hand-written, canvas 6.2's promise that a new
 *   product is configuration stops being true.
 *
 *   **Placement is filtered by the agency's scope, not by a rule restated here.**
 *   `placementOptionsFor` reads what an admin ticked on `/config/agencies`, and
 *   this screen offers exactly that and nothing else. FR-07.4 is kept by the
 *   options a person is given rather than by a check after they choose, which is
 *   also why switching the agency changes what is on offer rather than leaving a
 *   stale product selected — a chosen product outside the new scope is cleared.
 *
 *   **A deal pre-populates, and an empty deal is refused in words.** The refusal
 *   is `dealHasLineItems`' own sentence, the same one `deals.setLineItems` would
 *   have returned, because §9 is explicit that the message is the requirement. A
 *   greyed-out button with nothing beside it fails that bullet.
 *
 *   **Nothing computes an amount.** The typed components go into `<PremiumBlock>`
 *   and its roll-up renders the only arithmetic the product allows; the Final
 *   Premium below it is typed off the insurer's document. This file imports no
 *   money constructor and contains no arithmetic, and the figures handed to
 *   `desk.enter` are exactly the ones a person put into a `<RecordOnlyAmount>`.
 *
 * The two ways out are both deliberate acts behind `<ConfirmGate>`. Recording
 * the entry writes the policy; saving what is there writes the same policy with
 * its missing fields listed, so it lands on canvas 3.7's completion queue rather
 * than being lost in a form somebody had to leave. Cancel writes nothing.
 */
export function PolicyEntryScreen() {
  const [searchParams] = useSearchParams()
  const dealId = searchParams.get('dealId')

  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)

  const market = useEnsureMarket()
  const agencies = useMarketStore((state) => state.agencies)
  const companies = useMarketStore((state) => state.companies)
  const products = useMarketStore((state) => state.products)
  const scopes = useMarketStore((state) => state.scopes)

  const loaded = useResource(
    () => loadEntryContext(repositories, dealId),
    `policy-entry:${dealId ?? 'none'}`,
  )

  const [entryPath, setEntryPath] = useState<PolicyEntryPath>(POLICY_ENTRY_PATHS.proposal)
  const [agencyId, setAgencyId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [productId, setProductId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [seed, setSeed] = useState('')
  const [submitted, setSubmitted] = useState<SchemaFormSubmission | null>(null)
  const [premium, setPremium] = useState<PremiumEntry>(NOTHING_RECORDED)
  const [pending, setPending] = useState<PendingDraft | null>(null)
  const [armed, setArmed] = useState<Armed>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  const context = loaded.data

  // Adopting the deal is a render-phase decision keyed on the deal itself, not
  // an effect: an effect would flash an unplaced screen first, and a person who
  // has since changed the agency must not have their choice overwritten when
  // something else re-renders.
  if (context) {
    const key = `deal:${context.deal?.id ?? 'none'}`
    if (seed !== key) {
      setSeed(key)
      setCustomerId(context.deal?.customerId ?? '')
      setAgencyId(context.deal?.agencyId ?? '')
      const first = context.deal?.lineItems[0]
      setCompanyId(first?.companyId ?? '')
      setProductId(first?.productId ?? '')
    }
  }

  if (loaded.error || market.error) {
    return (
      <EmptyState
        variant="error"
        title="Policy entry could not be opened"
        explanation={(loaded.error ?? market.error)?.message ?? 'The read did not complete.'}
        action={
          <Button variant="primary" size="sm" onClick={loaded.reload}>
            Try again
          </Button>
        }
      />
    )
  }

  if (!user || !context || !market.ready || (dealId !== null && context.deal === null)) {
    if (loaded.status === 'ready' && dealId !== null && context?.deal == null) {
      return (
        <EmptyState
          variant="error"
          title="No deal answers to that address"
          explanation={`Nothing is stored under ${dealId ?? 'that reference'}.`}
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
        <Skeleton width="100%" height="18rem" />
      </div>
    )
  }

  const { deal, dealCustomer, customers, catalogue, retentionClasses } = context
  const actorId = user.id
  const mayEnter = can(user, 'create', 'policies')

  /* ------------------------------------------------------------- the block */

  // §9's own sentence, asked of the machine rather than written again here. A
  // deal that carries nothing cannot be taken forward, and the refusal is what
  // this screen shows instead of a form.
  const dealVerdict = deal === null ? null : dealHasLineItems({ lineItems: deal.lineItems })

  if (deal !== null && dealVerdict !== null && !dealVerdict.ok) {
    return (
      <>
        <PageHeader
          breadcrumb={<Link to={`/deals/${deal.id}`}>{deal.systemNo}</Link>}
          title="Policy entry"
        />
        <div className={styles.screen}>
          <Panel title="This deal cannot be entered">
            <p className={styles.blocked} role="alert" data-deal-blocked="">
              <Icon name="alert" size="sm" />
              {reasonOf(dealVerdict)}
            </p>
            <div className={styles.actions}>
              <Button variant="primary" onClick={() => void navigate(`/deals/${deal.id}`)}>
                Open the deal
              </Button>
            </div>
          </Panel>
        </div>
      </>
    )
  }

  /* --------------------------------------------------------- the placement */

  // FR-07.4, in the only form that keeps it: the options themselves. Nothing
  // below re-states the rule, and nothing checks it afterwards.
  const offered = agencyId === '' ? null : placementOptionsFor(scopes, agencyId)

  const companyOptions = companies
    .filter(
      (company) =>
        company.active && (offered ? appointedCompanyIds(offered).includes(company.id) : false),
    )
    .map((company) => ({ value: company.id, label: company.name }))

  const productOptions = products
    .filter(
      (product) =>
        product.active &&
        // Scoped to the chosen company, so the picker can only offer a pair the
        // agency is actually appointed for rather than a product that happens to
        // appear under some other appointment.
        (offered
          ? appointedProductIds(offered, {
              companyId: companyId === '' ? undefined : companyId,
            }).includes(product.id)
          : false),
    )
    .map((product) => ({ value: product.id, label: `${product.name} (${product.code})` }))

  // A choice the new agency is not appointed for is not left sitting in the
  // control looking valid. It is dropped, and the person chooses again.
  const companyInScope = companyId !== '' && companyOptions.some((row) => row.value === companyId)
  const productInScope = productId !== '' && productOptions.some((row) => row.value === productId)

  const product = productInScope ? (products.find((row) => row.id === productId) ?? null) : null
  const schema = product === null ? null : schemaForProduct(catalogue, product)
  const shape = schema === null ? null : premiumShapeOf(schema)
  const labels = schema === null ? {} : fieldLabelsFrom([schema])

  const customer = dealCustomer ?? customers.find((row) => row.id === customerId) ?? null
  const entityId = deal?.id ?? 'new-policy'
  const ready = customer !== null && schema !== null && companyInScope && productInScope

  /* ------------------------------------------------------------ the record */

  function beginReview(submission: SchemaFormSubmission) {
    setRefusal(null)
    setSubmitted(submission)
    if (shape === null) {
      setPremium(NOTHING_RECORDED)
      return
    }
    // Carried, not derived: each of these is the figure the person typed into
    // the premium stage a moment ago, shown again beside the roll-up so the
    // insurer's document can be held against it.
    setPremium({
      components: shape.componentKeys.map((key) => ({
        key,
        label: labels[key] ?? key,
        amount: readMoney(submission.values[key]),
      })),
      gst: shape.gstKey === null ? null : readMoney(submission.values[shape.gstKey]),
      finalPremium: null,
      finalPremiumSource: TYPED_PREMIUM_SOURCES.typed,
    })
  }

  function armDraftSave() {
    if (schema === null) return
    setRefusal(null)
    // `<SchemaForm>` has been writing this all along (U6). Reading it back is
    // what turns "your typing survived" into "the entry is on a queue somebody
    // can pick up", which is the half canvas 3.7 asks for.
    const values = draftValuesOf(schema, entityId)
    setPending({ values, missing: missingKeysOf(schema, values) })
    setArmed('draft')
  }

  async function write(values: FormValues, missingFields: readonly string[]) {
    if (schema === null || customer === null || product === null) return

    const typedFinal =
      shape === null ? readMoney(values.finalPremium) : premium.finalPremium
    const typedGst = shape === null ? readMoney(values.gstAmount) : premium.gst
    // Net is only ever a recorded figure. On a schema that rolls up there is no
    // net to record — the roll-up derives one for the eye and returns nothing.
    const typedNet = shape === null ? readMoney(values.netPremium) : null
    const typedSum = readMoney(values.sumInsured)
    const startDate = dateOf(values.startDate)
    const expiryDate = dateOf(values.expiryDate)

    const outcome = await policyDesk(repositories).enter({
      actorId,
      customerId: customer.id,
      companyId: product.companyId,
      productId: product.id,
      agencyId,
      entryPath,
      // The deal is named once, on the provenance, and the entry draft's own
      // `dealId` is written from it. An entry with no deal behind it says so in
      // words rather than leaving a null for a reader to interpret.
      provenance:
        deal === null
          ? {
              origin: 'captured',
              reason: 'Entered against the customer; no quotation was raised.',
            }
          : { origin: 'deal', dealId: deal.id },
      formSchemaId: schema.id,
      schemaVersion: schema.version,
      missingFields,
      savedBy: actorId,
      premiumMode: premiumModeOf(values),
      retentionClass: retentionClassFor(retentionClasses, product.line),
      // Spread rather than assigned: an absent amount stays absent instead of
      // becoming a null the command would have to interpret.
      ...(typedSum === null ? {} : { sumInsured: typedSum }),
      ...(typedNet === null ? {} : { netPremium: typedNet }),
      ...(typedGst === null ? {} : { gstAmount: typedGst }),
      ...(typedFinal === null ? {} : { finalPremium: typedFinal }),
      // The typed parts travel with the record instead of being dropped at the
      // repository boundary. They are passed exactly as the block holds them —
      // an unrecorded component keeps its `null` rather than being filtered out,
      // because "nobody typed this" is worth keeping.
      ...(shape === null
        ? {}
        : {
            components: premium.components.map((component) => ({
              key: component.key,
              label: component.label,
              amount: component.amount,
            })),
          }),
      ...(startDate === null ? {} : { startDate }),
      ...(expiryDate === null ? {} : { expiryDate }),
    })

    setArmed(null)

    if (!outcome.ok) {
      setRefusal(outcome.reason)
      toaster.notify({ title: 'Nothing was written', detail: outcome.reason, tone: 'bad' })
      return
    }

    const record = outcome.record
    if (missingFields.length > 0) {
      toaster.notify({
        title: `${record.systemNo} saved with ${missingFields.length} still to record`,
        detail: 'It is on the completion queue until the last field is in.',
        tone: 'warn',
      })
      void navigate('/back-office/drafts')
      return
    }

    toaster.notify({ title: `${record.systemNo} recorded`, tone: 'ok' })
    void navigate(`/policies/${record.id}`)
  }

  /* ------------------------------------------------------------ the render */

  const typedFinal = shape === null ? readMoney(submitted?.values.finalPremium) : premium.finalPremium

  // Asked of the machine so the screen and the later refusal cannot diverge. It
  // does not block entry — §9 gates issue on this figure, not capture — so it is
  // rendered as what will stop issuance rather than as an error here.
  const premiumStop = finalPremiumPresentAndTyped({
    now: new Date(),
    entryPath,
    kycState: KYC_STATES.complete,
    ...(typedFinal === null ? {} : { finalPremium: typedFinal }),
  })

  const missingOnRecord =
    submitted === null || schema === null
      ? []
      : [
          ...missingKeysOf(schema, submitted.values),
          ...(typedFinal === null ? ['finalPremium'] : []),
        ]

  return (
    <>
      <PageHeader
        breadcrumb={
          deal ? <Link to={`/deals/${deal.id}`}>{deal.systemNo}</Link> : <Link to="/policies">Policies</Link>
        }
        title="Policy entry"
      />

      <div className={styles.screen}>
        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        {deal ? (
          <Panel
            title="From this deal"
            description="What the customer accepted. Entry starts from one of these; the rest stay on the deal."
          >
            <ul className={styles.items}>
              {deal.lineItems.map((item) => (
                <li key={item.id} className={styles.item} data-line-item={item.id}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <Button
                    size="sm"
                    variant={item.productId === productId ? 'primary' : 'quiet'}
                    onClick={() => {
                      setCompanyId(item.companyId)
                      setProductId(item.productId)
                      setSubmitted(null)
                    }}
                  >
                    {item.productId === productId ? 'Being entered' : 'Enter this one'}
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel
          title="Placement"
          description="Placement offers only the companies and products the selected agency is appointed for."
        >
          <div className={styles.grid}>
            <Field label="Agency" required>
              <Select
                options={agencies
                  .filter((agency) => agency.active)
                  .map((agency) => ({ value: agency.id, label: agency.name }))}
                value={agencyId}
                placeholder="Choose the placing agency"
                onChange={(event) => {
                  setAgencyId(event.target.value)
                  setSubmitted(null)
                }}
              />
            </Field>

            <Field
              label="Company"
              required
              hint={agencyId === '' ? 'Choose an agency first: the scope decides what is on offer.' : undefined}
            >
              <Select
                options={companyOptions}
                value={companyInScope ? companyId : ''}
                placeholder="Choose the company"
                disabled={agencyId === ''}
                onChange={(event) => {
                  setCompanyId(event.target.value)
                  setProductId('')
                  setSubmitted(null)
                }}
              />
            </Field>

            <Field label="Product" required>
              <Select
                options={productOptions}
                value={productInScope ? productId : ''}
                placeholder="Choose the product"
                disabled={companyId === ''}
                onChange={(event) => {
                  setProductId(event.target.value)
                  setSubmitted(null)
                }}
              />
            </Field>

            {deal ? null : (
              <Field label="Customer" required>
                <Select
                  options={customers.map((row) => ({ value: row.id, label: row.fullName }))}
                  value={customerId}
                  placeholder="Choose the customer"
                  onChange={(event) => setCustomerId(event.target.value)}
                />
              </Field>
            )}
          </div>
        </Panel>

        <Panel
          title="How this policy is being entered"
          description="A direct entry is a policy the insurer has already issued, so it skips the proposal entirely."
        >
          <Field label="Entry path" control="group" required>
            <RadioGroup
              name="entryPath"
              value={entryPath}
              options={[
                {
                  value: POLICY_ENTRY_PATHS.proposal,
                  label: ENTRY_PATH_LABEL.proposal,
                  description: `Numbered ${ENTRY_PATH_SERIES.proposal} until the insurer issues it. It goes draft, proposal, sent, issued.`,
                },
                {
                  value: POLICY_ENTRY_PATHS.direct,
                  label: ENTRY_PATH_LABEL.direct,
                  description: `Numbered ${ENTRY_PATH_SERIES.direct} from the start, because the policy already exists at the insurer.`,
                },
              ]}
              onValueChange={(value) => {
                setEntryPath(value === POLICY_ENTRY_PATHS.direct ? POLICY_ENTRY_PATHS.direct : POLICY_ENTRY_PATHS.proposal)
                setSubmitted(null)
              }}
            />
          </Field>
        </Panel>

        {!ready ? (
          <Panel title="The form">
            <p className={styles.stop} role="status" data-entry-stop="">
              <Icon name="alert" size="sm" />
              {schema === null && productInScope
                ? 'No entry form is published for this product. Publish one in configuration before entering a policy against it.'
                : 'Choose the agency, the company, the product and the customer. The form is the one published for that product.'}
            </p>
          </Panel>
        ) : submitted === null ? (
          <Panel
            title={schema.title ?? 'The form'}
            description={`Version ${schema.version} of ${schema.objectKey}, as published. Every answer is recorded against this version.`}
          >
            <SchemaForm
              schema={schema}
              entityId={entityId}
              masterOptions={context.masterOptions}
              submitLabel="Review the premium"
              onSubmit={beginReview}
            />

            <div className={styles.draftRow}>
              <p className={styles.draftNote}>
                Nothing here has to be finished in one sitting. Saving what is recorded puts the
                entry on the completion queue with the fields that are still empty named on it.
              </p>
              <Button icon="doc" disabled={!mayEnter} onClick={armDraftSave}>
                Save what is recorded
              </Button>
            </div>

            {armed === 'draft' && pending !== null ? (
              <ConfirmGate
                title="Save this entry part-finished"
                changes={[
                  { key: 'customer', label: 'Customer', to: customer.fullName },
                  { key: 'product', label: 'Product', to: product?.name ?? productId },
                  { key: 'path', label: 'Entry path', to: ENTRY_PATH_LABEL[entryPath] },
                  {
                    key: 'series',
                    label: 'Numbered',
                    to: `${ENTRY_PATH_SERIES[entryPath]} series`,
                  },
                  {
                    key: 'missing',
                    label: 'Still to record',
                    to:
                      pending.missing.length === 0
                        ? 'Nothing'
                        : pending.missing.map((key) => labels[key] ?? key).join(', '),
                  },
                ]}
                note="The policy record is created now so the entry can be found and finished. Nothing goes to the insurer or the customer."
                confirmLabel="Save the entry"
                receipt="Saved. The entry is on the completion queue."
                onCancel={() => {
                  setArmed(null)
                  setPending(null)
                }}
                onConfirm={() => void write(pending.values, pending.missing)}
              />
            ) : null}
          </Panel>
        ) : (
          <Panel
            title="The premium, and then the record"
            description="The derived total is a cross-check against the insurer document. The Final Premium is the figure printed on it, and it is typed."
          >
            {shape === null ? (
              <KeyValueList
                columns={2}
                items={premiumSummary(submitted.values, labels)}
              />
            ) : (
              <PremiumBlock
                value={premium}
                onChange={setPremium}
                gstLabel={shape.gstKey === null ? 'GST' : (labels[shape.gstKey] ?? 'GST')}
              />
            )}

            {premiumStop.ok ? null : (
              <p className={styles.stop} role="status" data-premium-stop="">
                <Icon name="alert" size="sm" />
                {reasonOf(premiumStop)} The entry can still be saved; it will sit on the completion
                queue until the figure is in.
              </p>
            )}

            <div className={styles.actions}>
              <Button onClick={() => setSubmitted(null)}>Back to the form</Button>
              <Button
                variant="primary"
                icon="check"
                disabled={!mayEnter}
                onClick={() => {
                  setRefusal(null)
                  setArmed('enter')
                }}
              >
                Record this policy
              </Button>
            </div>

            {armed === 'enter' ? (
              <ConfirmGate
                title="Record this policy"
                changes={recordPreview({
                  customerName: customer.fullName,
                  productName: product?.name ?? productId,
                  agencyName: agencies.find((row) => row.id === agencyId)?.name ?? agencyId,
                  entryPath,
                  premiumLabel:
                    typedFinal === null ? (
                      'Not recorded yet'
                    ) : (
                      <AmountText paise={typedFinal.paise} currency={typedFinal.currency} />
                    ),
                  missing: missingOnRecord.map((key) => labels[key] ?? key),
                })}
                note="The policy is created against the schema version above. Nothing is sent to the insurer or the customer by this step."
                confirmLabel="Record it"
                receipt="Recorded."
                onCancel={() => setArmed(null)}
                onConfirm={() => void write(submitted.values, missingOnRecord)}
              />
            ) : null}
          </Panel>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ helpers */

type Armed = 'enter' | 'draft' | null

type PendingDraft = {
  readonly values: FormValues
  readonly missing: readonly string[]
}

/** An empty block. Every field is `null`, which is unrecorded and not zero. */
const NOTHING_RECORDED: PremiumEntry = {
  components: [],
  gst: null,
  finalPremium: null,
  finalPremiumSource: TYPED_PREMIUM_SOURCES.typed,
}

/** A date as the record carries it, or null. Never today, never a guess. */
function dateOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The mode the schema asked for.
 *
 * `annual` when the form did not ask: `PremiumMode` is not optional on the
 * command, and annual is what an unscheduled policy is. It is a schedule, not an
 * amount, so nothing about D3 is at stake — and the schedule screen in P-16 is
 * where an instalment plan is actually recorded.
 */
function premiumModeOf(values: FormValues): PremiumMode {
  const raw = values.premiumMode
  const known = Object.values(PREMIUM_MODES) as readonly string[]
  return typeof raw === 'string' && known.includes(raw) ? (raw as PremiumMode) : PREMIUM_MODES.annual
}

/** What `<SchemaForm>` has already written for this entity, read back. */
function draftValuesOf(schema: FormSchema, entityId: string): FormValues {
  const text = browserDraftStore.read(draftKey(schema.objectKey, entityId))
  if (text === null) return {}
  try {
    return decodeDraft(schema, entityId, JSON.parse(text))?.values ?? {}
  } catch {
    // A draft that cannot be parsed cannot help, and must not stop the save.
    return {}
  }
}

/**
 * The recorded figures on a schema that asks for the Final Premium directly.
 *
 * Read-only, and formatted only at the render edge by `<Money>`: every one of
 * these came out of a `<RecordOnlyAmount>` on the stage before this one.
 */
function premiumSummary(
  values: FormValues,
  labels: Readonly<Record<string, string>>,
): readonly KeyValueItem[] {
  return RECORDED_PREMIUM_KEYS.map((key) => {
    const amount = readMoney(values[key])
    return {
      key,
      label: labels[key] ?? key,
      value: <AmountText paise={amount === null ? null : amount.paise} />,
    }
  })
}

const RECORDED_PREMIUM_KEYS = ['netPremium', 'gstAmount', 'finalPremium'] as const

function recordPreview(input: {
  customerName: string
  productName: string
  agencyName: string
  entryPath: PolicyEntryPath
  premiumLabel: ReactNode
  missing: readonly string[]
}): readonly ConfirmChange[] {
  const changes: ConfirmChange[] = [
    { key: 'customer', label: 'Customer', to: input.customerName },
    { key: 'product', label: 'Product', to: input.productName },
    { key: 'agency', label: 'Agency', to: input.agencyName },
    { key: 'path', label: 'Entry path', to: ENTRY_PATH_LABEL[input.entryPath] },
    { key: 'series', label: 'Numbered', to: `${ENTRY_PATH_SERIES[input.entryPath]} series` },
    { key: 'premium', label: 'Final premium', to: input.premiumLabel },
  ]
  if (input.missing.length > 0) {
    changes.push({ key: 'missing', label: 'Still to record', to: input.missing.join(', ') })
  }
  return changes
}

export default PolicyEntryScreen
