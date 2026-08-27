import { useState } from 'react'
import { AGENCY_TYPES, INSURANCE_LINES } from '../../../data/repo'
import type { AgencyType, InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Checkbox, Field, FormSection, Input, RadioGroup, Select } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import {
  AGENCY_TYPE_LABELS,
  GatedAction,
  LINE_LABELS,
  companyById,
  individualAgencyHoldsOneCompany,
  placementOptionsFor,
  useMarketStore,
} from '../shared'
import type { ConfigAgency } from '../shared'
import { AgencyScopeEditor } from './AgencyScopeEditor'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * One agency — FR-07, canvas 6.3.
 *
 * The Individual lock is enforced three times over, and deliberately so. The
 * store refuses the write; this panel calls the same guard as the boxes are
 * ticked and shows the refusal it would have carried; and the Save gate stays
 * shut while the refusal stands. A person therefore learns *why* a second
 * company is impossible on an Individual agency at the moment they try it,
 * rather than meeting a disabled control with no explanation — and no path
 * around the rule exists, because the store is the only way in.
 *
 * The code is generated at creation and shown read-only afterwards: it is what
 * the insurer issued and what every policy already carries.
 */
export function AgencyDrawer({ agency }: { agency: ConfigAgency }) {
  const companies = useMarketStore((state) => state.companies)
  const products = useMarketStore((state) => state.products)
  const scopes = useMarketStore((state) => state.scopes)
  const agents = useMarketStore((state) => state.agents)
  const saveAgency = useMarketStore((state) => state.saveAgency)
  const setAgencyActive = useMarketStore((state) => state.setAgencyActive)

  const [name, setName] = useState(agency.name)
  const [type, setType] = useState<AgencyType>(agency.type)
  const [city, setCity] = useState(agency.city)
  const [companyIds, setCompanyIds] = useState<readonly string[]>(agency.companyIds)
  const [lineFilter, setLineFilter] = useState('')

  const appointment = individualAgencyHoldsOneCompany({ type, companyIds, agencyName: name })
  const offered = placementOptionsFor(scopes, agency.id)
  const writing = agents.filter((agent) => agent.agencyId === agency.id)

  const companiesChanged =
    companyIds.length !== agency.companyIds.length ||
    companyIds.some((companyId) => !agency.companyIds.includes(companyId))
  const changed =
    name.trim() !== agency.name ||
    type !== agency.type ||
    city.trim() !== agency.city ||
    companiesChanged

  const shown = companies.filter(
    (company) => lineFilter === '' || company.lines.includes(lineFilter as InsuranceLine),
  )

  function nameOf(companyId: string): string {
    return companyById(companies, companyId)?.shortName ?? 'A company no longer on file'
  }

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The agency"
        description="One appointment. The code was generated when it was created and is what the insurer issued against it."
      >
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Type" control="group">
          <RadioGroup
            name={`agency-type-${agency.id}`}
            value={type}
            orientation="horizontal"
            options={[
              {
                value: AGENCY_TYPES.individual,
                label: AGENCY_TYPE_LABELS.individual,
                description: 'Locks to exactly one company.',
              },
              {
                value: AGENCY_TYPES.broker,
                label: AGENCY_TYPE_LABELS.broker,
                description: 'Carries as many companies as it is appointed to.',
              },
            ]}
            onValueChange={(value) => setType(value as AgencyType)}
          />
        </Field>

        <Field label="City">
          <Input value={city} onChange={(event) => setCity(event.target.value)} />
        </Field>

        <Field
          label="Filter companies by line"
          hint="Narrows the list below. It does not change the appointment."
        >
          <Select
            value={lineFilter}
            placeholder="Every line"
            options={Object.values(INSURANCE_LINES).map((line) => ({
              value: line,
              label: LINE_LABELS[line],
            }))}
            onChange={(event) => setLineFilter(event.target.value)}
          />
        </Field>

        <Field label="Appointed companies" control="group" required>
          <ul className={styles.choices}>
            {shown.map((company) => (
              <li key={company.id}>
                <Checkbox
                  label={company.name}
                  description={company.lines.map((line) => LINE_LABELS[line]).join(', ')}
                  checked={companyIds.includes(company.id)}
                  onChange={(event) =>
                    setCompanyIds((current) =>
                      event.target.checked
                        ? [...current, company.id]
                        : current.filter((candidate) => candidate !== company.id),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </Field>

        {appointment.ok ? null : (
          <p role="alert" className={styles.refusal}>
            {reasonOf(appointment)}
          </p>
        )}

        <p className={layout.mono}>
          {agency.code} · {writing.length} agent{writing.length === 1 ? '' : 's'} writing
        </p>

        <GatedAction
          label="Save agency"
          variant="primary"
          title={`Save "${agency.name}"`}
          disabled={!changed || !appointment.ok}
          changes={[
            ...(name.trim() !== agency.name
              ? [{ key: 'name', label: 'Name', from: agency.name, to: name.trim() }]
              : []),
            ...(type !== agency.type
              ? [
                  {
                    key: 'type',
                    label: 'Type',
                    from: AGENCY_TYPE_LABELS[agency.type],
                    to: AGENCY_TYPE_LABELS[type],
                  },
                ]
              : []),
            ...(city.trim() !== agency.city
              ? [{ key: 'city', label: 'City', from: agency.city, to: city.trim() }]
              : []),
            ...(companiesChanged
              ? [
                  {
                    key: 'companies',
                    label: 'Appointed companies',
                    from: agency.companyIds.map(nameOf).join(', ') || 'None',
                    to: companyIds.map(nameOf).join(', ') || 'None',
                  },
                ]
              : []),
          ]}
          note="Any policy in scope for a company this agency is no longer appointed to is dropped from the scope, because placement would otherwise keep offering it."
          confirmLabel="Save"
          toast={{ title: `"${name.trim()}" saved` }}
          onConfirm={() => saveAgency(agency.id, { name, type, companyIds, city })}
        />
      </FormSection>

      <FormSection
        title="Policies in scope"
        description="Which of the appointed companies’ policies this agency may place, and the commission percentage agreed for each."
      >
        <AgencyScopeEditor agency={agency} />
      </FormSection>

      <FormSection
        title="Placement offers"
        description="What a deal placed through this agency may choose — FR-07.4. Read-only: it is the scope above, resolved."
      >
        {offered.productIds.length === 0 ? (
          <p className={styles.hint}>
            Nothing. A deal on this agency has no company and no product to place with until a
            policy is in scope.
          </p>
        ) : (
          <ul className={styles.rows}>
            {offered.productIds.map((productId) => {
              const product = products.find((candidate) => candidate.id === productId)
              return (
                <li key={productId} className={styles.row} data-placement-product={productId}>
                  <div className={styles.rowHead}>
                    <span className={styles.rowName}>{product?.name ?? productId}</span>
                    <Badge tone="neutral">{product ? nameOf(product.companyId) : 'Unknown'}</Badge>
                  </div>
                  <div className={styles.rowMeta}>
                    <span className={layout.mono}>{product?.code ?? productId}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Availability"
        description="A deactivated agency keeps every policy already placed through it and takes no new placement."
      >
        <div className={styles.chips}>
          <StatusPill tone={agency.active ? 'ok' : 'idle'}>
            {agency.active ? 'Active' : 'Deactivated'}
          </StatusPill>

          <GatedAction
            label={agency.active ? 'Deactivate' : 'Reactivate'}
            title={`${agency.active ? 'Deactivate' : 'Reactivate'} "${agency.name}"`}
            changes={[
              {
                key: 'active',
                label: agency.name,
                from: agency.active ? 'Placeable' : 'Deactivated',
                to: agency.active ? 'Deactivated' : 'Placeable',
              },
            ]}
            note={`${writing.length} agent${writing.length === 1 ? '' : 's'} write under this agency. Their existing business is untouched.`}
            confirmLabel={agency.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `"${agency.name}" is ${agency.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setAgencyActive(agency.id, !agency.active)}
          />
        </div>
      </FormSection>
    </div>
  )
}
