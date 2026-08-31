import { useState } from 'react'
import { INSURANCE_LINES } from '../../../data/repo'
import type { InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Field, Input, NumberInput, QuickAddForm, Select } from '../../../ui/form'
import { useToaster } from '../../../ui/surface'
import { useConfigStore } from './config-store'
import { bpFromPercent, percentFromBp } from './market-rules'
import { useMarketStore } from './market-store'
import type { ConfigAgency, ConfigAgent, ConfigCompany, ConfigProduct } from './market-types'
import { AGENCY_TYPE_LABELS, LINE_LABELS } from './market-types'
import { useEnsureMarket } from './use-market'
import { useEnsureConfig } from './use-config'

/**
 * The create rows that sit behind a `<QuickAdd>` plus, for the four channel and
 * market records a form is most often missing: an agent, a sub-agent, an agency,
 * an insurer, a product.
 *
 * Each one asks for the fewest fields that make the record real and refuses in
 * the store's own words — the same `addAgent`, `addAgency`, `addCompany` and
 * `addProduct` the configuration screens call, so a row created from an inquiry
 * form is the row the agents screen shows, checked by the same rules. Everything
 * else about the record is edited afterwards in configuration, where the rest of
 * its settings live.
 */

/** The row the store just made: the one id that was not there a moment ago. */
function created<T extends { readonly id: string }>(
  before: ReadonlySet<string>,
  after: readonly T[],
): T | null {
  return after.find((row) => !before.has(row.id)) ?? null
}

/* ------------------------------------------------------------------- agents */

export type AgentQuickAddProps = {
  /** A sub-agent is the same record with a reporting line, so it is one flag. */
  role?: 'agent' | 'sub_agent'
  /** The agent a new sub-agent reports to, when the form already knows it. */
  parentAgentId?: string | null
  /**
   * Set where the plus sits on a "reports to" picker: an agent created from
   * there is being made in order to have a team, and one without the grant would
   * not appear in the list that asked for them. It is stated on the form rather
   * than done quietly.
   */
  grantSubAgents?: boolean
  onCreated: (agent: ConfigAgent) => void
  onCancel: () => void
}

export function AgentQuickAdd({
  role = 'agent',
  parentAgentId = null,
  grantSubAgents = false,
  onCreated,
  onCancel,
}: AgentQuickAddProps) {
  const market = useEnsureMarket()
  const agencies = useMarketStore((state) => state.agencies)
  const agents = useMarketStore((state) => state.agents)
  const addAgent = useMarketStore((state) => state.addAgent)
  const toaster = useToaster()

  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [parentId, setParentId] = useState(parentAgentId ?? '')
  const [share, setShare] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parents = agents.filter((agent) => agent.parentAgentId === null && agent.canGrantSubAgents)
  const parent = agents.find((agent) => agent.id === parentId) ?? null
  // A sub-agent writes under the agency their agent writes under. Asking again
  // would offer a second answer to a question the reporting line has settled.
  const agency = role === 'sub_agent' ? (parent?.agencyId ?? '') : agencyId

  function submit() {
    if (role === 'sub_agent' && parentId === '') {
      setError('Name the agent this sub-agent reports to.')
      return
    }

    const before = new Set(useMarketStore.getState().agents.map((agent) => agent.id))
    const verdict = addAgent({
      name,
      mobile: mobile.trim(),
      email: '',
      agencyId: agency,
      city: '',
      parentAgentId: role === 'sub_agent' ? parentId : null,
      categoryIds: [],
      sharePercentBp: share,
      canGrantSubAgents: grantSubAgents,
      subAgentCapPercentBp: null,
      directUpdatesEnabled: false,
    })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }

    const row = created(before, useMarketStore.getState().agents)
    if (!row) return
    toaster.notify({ title: `"${row.name}" was added as ${row.code}`, tone: 'ok' })
    onCreated(row)
  }

  return (
    <QuickAddForm
      error={error}
      note={market.ready ? undefined : 'Reading the channel list…'}
      busy={!market.ready}
      submitLabel={role === 'sub_agent' ? 'Add sub-agent' : 'Add agent'}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <Field label="Name" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      {role === 'sub_agent' ? (
        <Field
          label="Reports to"
          required
          hint={
            parent
              ? `They write under ${agencies.find((row) => row.id === parent.agencyId)?.name ?? 'their agent’s agency'}.`
              : 'Only agents granted a sub-agent team are offered.'
          }
        >
          <Select
            value={parentId}
            placeholder="Choose their agent"
            options={parents.map((agent) => ({ value: agent.id, label: agent.name }))}
            onChange={(event) => {
              setParentId(event.target.value)
              setError(null)
            }}
          />
        </Field>
      ) : (
        <Field label="Agency" required>
          <Select
            value={agencyId}
            placeholder="Choose an agency"
            options={agencies
              .filter((row) => row.active)
              .map((row) => ({ value: row.id, label: row.name }))}
            onChange={(event) => {
              setAgencyId(event.target.value)
              setError(null)
            }}
          />
        </Field>
      )}

      <Field label="Mobile">
        <Input value={mobile} onChange={(event) => setMobile(event.target.value)} />
      </Field>

      <Field
        label="Own percentage"
        required
        hint={
          grantSubAgents
            ? 'What they are paid on business they source. They are granted a sub-agent team, uncapped until configuration sets a ceiling.'
            : 'What they are paid on business they source. The rest of their settings live in configuration.'
        }
      >
        <NumberInput
          unit="%"
          min={0}
          max={100}
          step={0.01}
          value={percentFromBp(share)}
          onValueChange={(value) => {
            setShare(bpFromPercent(value))
            setError(null)
          }}
        />
      </Field>
    </QuickAddForm>
  )
}

/* ----------------------------------------------------------------- agencies */

export type AgencyQuickAddProps = {
  onCreated: (agency: ConfigAgency) => void
  onCancel: () => void
}

export function AgencyQuickAdd({ onCreated, onCancel }: AgencyQuickAddProps) {
  const market = useEnsureMarket()
  const companies = useMarketStore((state) => state.companies)
  const addAgency = useMarketStore((state) => state.addAgency)
  const toaster = useToaster()

  const [name, setName] = useState('')
  const [type, setType] = useState<'individual' | 'broker'>('broker')
  const [companyId, setCompanyId] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const before = new Set(useMarketStore.getState().agencies.map((row) => row.id))
    const verdict = addAgency({
      name,
      type,
      // An Individual appointment is one company's, and the store enforces it;
      // a Broker's panel is built on the agency itself, afterwards.
      companyIds: type === 'individual' && companyId !== '' ? [companyId] : [],
      city,
    })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }

    const row = created(before, useMarketStore.getState().agencies)
    if (!row) return
    toaster.notify({ title: `"${row.name}" was added as ${row.code}`, tone: 'ok' })
    onCreated(row)
  }

  return (
    <QuickAddForm
      error={error}
      note={market.ready ? undefined : 'Reading the market list…'}
      busy={!market.ready}
      submitLabel="Add agency"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <Field label="Name" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Type" required>
        <Select
          value={type}
          options={Object.entries(AGENCY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(event) => {
            setType(event.target.value === 'individual' ? 'individual' : 'broker')
            setError(null)
          }}
        />
      </Field>

      {type === 'individual' ? (
        <Field
          label="Appointed by"
          required
          hint="An Individual agency writes for exactly one company."
        >
          <Select
            value={companyId}
            placeholder="Choose the company"
            options={companies
              .filter((row) => row.active)
              .map((row) => ({ value: row.id, label: row.name }))}
            onChange={(event) => {
              setCompanyId(event.target.value)
              setError(null)
            }}
          />
        </Field>
      ) : null}

      <Field label="City">
        <Input value={city} onChange={(event) => setCity(event.target.value)} />
      </Field>
    </QuickAddForm>
  )
}

/* ---------------------------------------------------------------- companies */

export type CompanyQuickAddProps = {
  onCreated: (company: ConfigCompany) => void
  onCancel: () => void
}

export function CompanyQuickAdd({ onCreated, onCancel }: CompanyQuickAddProps) {
  const market = useEnsureMarket()
  const addCompany = useMarketStore((state) => state.addCompany)
  const toaster = useToaster()

  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [lines, setLines] = useState<readonly InsuranceLine[]>(['health'])
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const before = new Set(useMarketStore.getState().companies.map((row) => row.id))
    const verdict = addCompany({ name, shortName, lines, claimsEmail: '' })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }

    const row = created(before, useMarketStore.getState().companies)
    if (!row) return
    toaster.notify({ title: `"${row.name}" is on the panel`, tone: 'ok' })
    onCreated(row)
  }

  return (
    <QuickAddForm
      error={error}
      note={market.ready ? undefined : 'Reading the market list…'}
      busy={!market.ready}
      submitLabel="Add company"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <Field label="Registered name" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Short name" hint="How it reads in a list. Left empty, the full name stands in.">
        <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
      </Field>

      <Field
        label="Writes"
        required
        hint="One licensed entity writes life or it writes general lines, never both. The rest of the panel is set in configuration."
      >
        <Select
          value={lines[0] ?? 'health'}
          options={Object.values(INSURANCE_LINES).map((value) => ({
            value,
            label: LINE_LABELS[value],
          }))}
          onChange={(event) => {
            setLines([event.target.value as InsuranceLine])
            setError(null)
          }}
        />
      </Field>
    </QuickAddForm>
  )
}

/* ----------------------------------------------------------------- products */

export type ProductQuickAddProps = {
  /** The company whose product this is, when the form already knows it. */
  companyId?: string | null
  onCreated: (product: ConfigProduct) => void
  onCancel: () => void
}

export function ProductQuickAdd({
  companyId = null,
  onCreated,
  onCancel,
}: ProductQuickAddProps) {
  const market = useEnsureMarket()
  const config = useEnsureConfig()
  const companies = useMarketStore((state) => state.companies)
  const categories = useConfigStore((state) => state.categories)
  const addProduct = useMarketStore((state) => state.addProduct)
  const toaster = useToaster()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [company, setCompany] = useState(companyId ?? '')
  const [line, setLine] = useState<InsuranceLine>('health')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (categoryId === '') {
      setError('Choose the inquiry category this product answers, so routing and the catalogue agree.')
      return
    }

    const before = new Set(useMarketStore.getState().products.map((row) => row.id))
    const verdict = addProduct({ companyId: company, code, name, line, categoryId })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }

    const row = created(before, useMarketStore.getState().products)
    if (!row) return
    toaster.notify({ title: `"${row.name}" was added`, tone: 'ok' })
    onCreated(row)
  }

  const ready = market.ready && config.ready

  return (
    <QuickAddForm
      error={error}
      note={ready ? undefined : 'Reading the catalogue…'}
      busy={!ready}
      submitLabel="Add product"
      onCancel={onCancel}
      onSubmit={submit}
    >
      <Field label="Name" required>
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Code" required hint="The code the insurer files it under.">
        <Input
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Company" required>
        <Select
          value={company}
          placeholder="Choose the company"
          options={companies
            .filter((row) => row.active)
            .map((row) => ({ value: row.id, label: row.name }))}
          onChange={(event) => {
            setCompany(event.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="Line">
        <Select
          value={line}
          options={Object.values(INSURANCE_LINES).map((value) => ({
            value,
            label: LINE_LABELS[value],
          }))}
          onChange={(event) => setLine(event.target.value as InsuranceLine)}
        />
      </Field>

      <Field label="Inquiry category" required>
        <Select
          value={categoryId}
          placeholder="Choose the category"
          options={categories.map((category) => ({ value: category.id, label: category.label }))}
          onChange={(event) => {
            setCategoryId(event.target.value)
            setError(null)
          }}
        />
      </Field>
    </QuickAddForm>
  )
}
