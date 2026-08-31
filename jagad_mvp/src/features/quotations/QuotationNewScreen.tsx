import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRepositories } from '../../app/repositories-context'
import { useSessionStore } from '../../app/store'
import { PageHeader } from '../../components/AppShell'
import { useResource } from '../../lib/useResource'
import type { PremiumMode } from '../../domain/workflows'
import { PREMIUM_MODES, resolveSalesCredit } from '../../domain/workflows'
import { SEED_FORM_SCHEMAS, resolveFormSchema } from '../../domain/forms'
import type {
  Company,
  Customer,
  InsuranceLine,
  Product,
  RequirementRecord,
} from '../../data/repo'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, Skeleton } from '../../ui/data'
import { Checkbox, Combobox, Field, Input, Select } from '../../ui/form'
import { Panel } from '../../ui/surface'
import { useToaster } from '../../ui/surface'
import styles from './QuotationNew.module.css'

const LINES: readonly InsuranceLine[] = ['health', 'motor', 'life', 'travel', 'property']

const LINE_LABEL: Readonly<Record<InsuranceLine, string>> = {
  health: 'Health',
  motor: 'Motor',
  life: 'Life',
  travel: 'Travel',
  property: 'Property',
}

const PREMIUM_MODE_LABEL: Readonly<Record<PremiumMode, string>> = {
  annual: 'Annual',
  half_yearly: 'Half-yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  single: 'Single premium',
}

/**
 * Opening a quotation — canvas 2.1's first half (plan §4 `/quotations/new`).
 *
 * Two decisions and nothing else: who it is for, and which company-and-product
 * columns are being compared. Both are facts; neither is an amount. The
 * quotation is created in `draft` with no columns and no figure — §8 is explicit
 * that the matrix arrives at `compose` — and the picked columns travel to the
 * composer in the address, so the opening state is reconstructible from the URL
 * rather than from something this screen remembered.
 *
 * A customer who is not on the books yet is added here through
 * `customers.create`, so the agent never has to leave the flow to start one.
 */
export function QuotationNewScreen() {
  const repositories = useRepositories()
  const navigate = useNavigate()
  const toaster = useToaster()
  const user = useSessionStore((state) => state.user)
  const [searchParams] = useSearchParams()
  const inquiryId = searchParams.get('inquiry')

  const context = useResource(async () => {
    const [customers, companies, products, inquiry, requirement, categories] =
      await Promise.all([
        repositories.customers.list({ page: 1, pageSize: 500 }),
        repositories.companies.list({ page: 1, pageSize: 200 }),
        repositories.products.list({ page: 1, pageSize: 500 }),
        inquiryId ? repositories.inquiries.get(inquiryId) : Promise.resolve(null),
        inquiryId ? repositories.requirements.forInquiry(inquiryId) : Promise.resolve(null),
        repositories.config.categories(),
      ])
    return {
      customers: customers.rows,
      companies: companies.rows,
      products: products.rows.filter((product) => product.active),
      inquiry,
      requirement,
      categories,
    }
  }, `quotations:new:${inquiryId ?? 'none'}`)

  const [customerId, setCustomerId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] = useState('Gujarat')
  const [line, setLine] = useState<InsuranceLine>('health')
  const [picked, setPicked] = useState<readonly string[]>([])
  const [premiumMode, setPremiumMode] = useState<PremiumMode>(PREMIUM_MODES.annual)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  // The inquiry this came out of already names its customer, and its category
  // already names the line. Adopt both once, so a later change by the person on
  // the screen is not overwritten on re-render.
  if (context.data && !seeded) {
    setSeeded(true)
    const fromInquiry = context.data.inquiry?.customerId ?? null
    if (fromInquiry) setCustomerId(fromInquiry)
    const categoryId = context.data.inquiry?.categoryId ?? null
    const category = context.data.categories.find((row) => row.id === categoryId)
    if (category) setLine(category.line as InsuranceLine)
  }

  if (!user || !context.data) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton width="30%" height="2rem" />
        <Skeleton width="100%" height="16rem" />
      </div>
    )
  }

  const { customers, companies, products, inquiry, requirement } = context.data
  const actorId = user.id
  const agentId = user.agentId ?? null
  const chosen = customers.find((candidate) => candidate.id === customerId) ?? null
  /*
   * The sale's credit, recorded on the quotation at birth so the deal has a rung
   * to read it off later. The composing agent states the agent; the customer
   * record can complete the sub-agent, but only where it names the same agent —
   * `resolveSalesCredit` is what enforces that, rather than a rule restated here.
   */
  const credit = resolveSalesCredit({
    stated: { agentId, subAgentId: null },
    customer: chosen ? { agentId: chosen.agentId, subAgentId: chosen.subAgentId } : null,
  })
  const pickedProducts = products.filter((product) => picked.includes(product.id))

  async function addCustomer() {
    setRefusal(null)
    const outcome = await repositories.customers.create({
      actorId,
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      source: inquiry ? inquiry.source : 'walk_in',
      ownerId: actorId,
      city: city.trim(),
      state: stateName.trim(),
    })
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }
    context.reload()
    setCustomerId(outcome.record.id)
    setAdding(false)
    toaster.notify({ title: `${outcome.record.fullName} is on the books`, tone: 'ok' })
  }

  async function openComposer() {
    if (!customerId || picked.length === 0) return
    setRefusal(null)
    setBusy(true)
    const outcome = await repositories.quotations.create({
      actorId,
      customerId,
      ownerId: actorId,
      inquiryId,
      agentId: credit.agentId,
      subAgentId: credit.subAgentId,
      premiumMode,
    })
    setBusy(false)
    if (!outcome.ok) {
      setRefusal(outcome.reason)
      return
    }
    void navigate(`/quotations/${outcome.record.id}?cols=${picked.join(',')}`)
  }

  const stop = blockingReason(chosen, pickedProducts)

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/quotations">Quotations</Link>}
        title="New quotation"
      />

      <div className={styles.screen}>
        {refusal ? (
          <p className={styles.refusal} role="alert">
            <Icon name="alert" size="sm" />
            {refusal}
          </p>
        ) : null}

        {requirement === null ? null : (
          <Panel
            title="What they said they need"
            description="Captured on the inquiry. This is the conversation the composer used to assume you remembered."
          >
            <dl className={styles.requirement}>
              {answeredRequirement(requirement).map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        <Panel
          title="Customer"
          description="Somebody already on the books, or a new record started here."
        >
          <Field label="Customer" required>
            <Combobox
              options={customers.map((candidate) => ({
                value: candidate.id,
                label: candidate.fullName,
                hint: candidate.mobile,
              }))}
              value={customerId}
              onValueChange={setCustomerId}
              placeholder="Search by name"
              emptyText="Nobody on the books matches that."
            />
          </Field>

          {adding ? (
            <div className={styles.newCustomer} data-new-customer="">
              <Field label="Full name" required>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Mobile" required>
                <Input
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                  inputMode="tel"
                  autoComplete="off"
                />
              </Field>
              <Field label="City" required>
                <Input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="State" required>
                <Input
                  value={stateName}
                  onChange={(event) => setStateName(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <div className={styles.newCustomerActions}>
                <Button variant="quiet" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    fullName.trim() === '' ||
                    mobile.trim() === '' ||
                    city.trim() === '' ||
                    stateName.trim() === ''
                  }
                  onClick={() => void addCustomer()}
                >
                  Add customer
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" icon="plus" onClick={() => setAdding(true)}>
              Add a customer
            </Button>
          )}
        </Panel>

        <Panel
          title="Policies to compare"
          description="One column per company and product. Pick as many as the customer is being shown."
          actions={
            <Field label="Line" className={styles.lineField}>
              <Select
                options={LINES.map((value) => ({ value, label: LINE_LABEL[value] }))}
                value={line}
                onChange={(event) => setLine(event.target.value as InsuranceLine)}
              />
            </Field>
          }
        >
          <ProductPicker
            companies={companies}
            products={products.filter((product) => product.line === line)}
            picked={picked}
            onToggle={(productId) =>
              setPicked((current) =>
                current.includes(productId)
                  ? current.filter((value) => value !== productId)
                  : [...current, productId],
              )
            }
          />

          {picked.length > 0 ? (
            <p className={styles.pickedNote} data-picked-count={picked.length}>
              {picked.length === 1
                ? '1 column will be compared.'
                : `${picked.length} columns will be compared.`}
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Premium mode"
          description="Stated on the document for information. It scales no figure — every premium is typed as the insurer quoted it."
        >
          <Field label="Premium mode">
            <Select
              options={Object.values(PREMIUM_MODES).map((value) => ({
                value,
                label: PREMIUM_MODE_LABEL[value],
              }))}
              value={premiumMode}
              onChange={(event) => setPremiumMode(event.target.value as PremiumMode)}
            />
          </Field>
        </Panel>

        <div className={styles.footer}>
          {stop ? (
            <p className={styles.stop} role="status" id="new-quotation-stop">
              <Icon name="alert" size="sm" />
              {stop}
            </p>
          ) : null}
          <Button
            variant="primary"
            disabled={stop !== null || busy}
            aria-describedby={stop ? 'new-quotation-stop' : undefined}
            onClick={() => void openComposer()}
          >
            Open the composer
          </Button>
        </div>
      </div>
    </>
  )
}

function blockingReason(
  customer: Customer | null,
  pickedProducts: readonly Product[],
): string | null {
  if (!customer) return 'Choose the customer this quotation is for, or add them to the books.'
  if (pickedProducts.length === 0) {
    return 'Pick at least one company and product. A quotation with no columns has nothing to compare.'
  }
  return null
}

type ProductPickerProps = {
  companies: readonly Company[]
  products: readonly Product[]
  picked: readonly string[]
  onToggle: (productId: string) => void
}

/** Products grouped under the company that sells them, which is how an agent reads them. */
function ProductPicker({ companies, products, picked, onToggle }: ProductPickerProps) {
  const grouped = companies
    .map((company) => ({
      company,
      products: products.filter((product) => product.companyId === company.id),
    }))
    .filter((group) => group.products.length > 0)

  if (grouped.length === 0) {
    return (
      <EmptyState
        title="No products are configured for this line"
        explanation="Products come from configuration. Add the company’s policies under Configuration, and they appear here."
      />
    )
  }

  return (
    <ul className={styles.companies}>
      {grouped.map(({ company, products: forCompany }) => (
        <li key={company.id} className={styles.company} data-company={company.id}>
          <p className={styles.companyName}>{company.name}</p>
          <ul className={styles.products}>
            {forCompany.map((product) => (
              <li key={product.id}>
                <Checkbox
                  label={product.name}
                  description={product.code}
                  checked={picked.includes(product.id)}
                  onChange={() => onToggle(product.id)}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export default QuotationNewScreen

/**
 * The captured answers, read back in the words they were asked in.
 *
 * The labels come off the schema the record pinned, not off today's — a
 * requirement taken in March reads in March's words, which is the promise the
 * form engine already makes for every other captured record. Anything the
 * schema no longer asks falls out rather than being shown under its raw key: a
 * row reading `vehicleType` is a leak of the storage format into somebody's
 * afternoon.
 */
function answeredRequirement(
  requirement: RequirementRecord,
): readonly { key: string; label: string; text: string }[] {
  const schema = resolveFormSchema(SEED_FORM_SCHEMAS, {
    objectKey: requirement.objectKey,
    version: requirement.schemaVersion,
  })
  if (!schema) return []

  return schema.stages
    .flatMap((stage) => stage.fields)
    .map((field) => ({ key: field.key, label: field.label, value: requirement.values[field.key] }))
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== '')
    .map((row) => ({
      key: row.key,
      label: row.label,
      text:
        typeof row.value === 'boolean'
          ? row.value
            ? 'Yes'
            : 'No'
          : Array.isArray(row.value)
            ? row.value.map((item) => String(item)).join(', ')
            : String(row.value),
    }))
}
