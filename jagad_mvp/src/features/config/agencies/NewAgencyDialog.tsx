import { useState } from 'react'
import { AGENCY_TYPES } from '../../../data/repo'
import type { AgencyType } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Checkbox, Field, Input, RadioGroup } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import {
  AGENCY_TYPE_LABELS,
  individualAgencyHoldsOneCompany,
  nextAgencyCode,
  useMarketStore,
} from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * Adding an agency — FR-07.1.
 *
 * The code is shown before the agency exists and never typed: it is generated
 * from the type and whatever names the appointment, and it is the reference every
 * policy written under it will carry. The Individual lock is checked as the boxes
 * are ticked, so the rule is met at the moment it applies.
 */
export function NewAgencyDialog() {
  const companies = useMarketStore((state) => state.companies)
  const agencies = useMarketStore((state) => state.agencies)
  const addAgency = useMarketStore((state) => state.addAgency)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AgencyType>(AGENCY_TYPES.individual)
  const [city, setCity] = useState('')
  const [companyIds, setCompanyIds] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  const appointment = individualAgencyHoldsOneCompany({ type, companyIds, agencyName: name })

  const seed =
    type === AGENCY_TYPES.individual
      ? (companies.find((company) => company.id === companyIds[0])?.shortName ?? name)
      : name
  const code =
    name.trim() === '' ? '' : nextAgencyCode(type, seed, agencies.map((agency) => agency.code))

  function close() {
    setOpen(false)
    setName('')
    setType(AGENCY_TYPES.individual)
    setCity('')
    setCompanyIds([])
    setError(null)
  }

  function create() {
    const verdict = addAgency({ name, type, companyIds, city })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }
    toaster.notify({ title: `"${name.trim()}" was added`, tone: 'ok' })
    close()
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New agency
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New agency"
        description="One appointment: its type, the companies it covers, and the code this system will issue it."
        dismissOnScrimClick={false}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create agency
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field
            label="Name"
            required
            hint={code === '' ? undefined : `It will be issued the code ${code}.`}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Type" control="group">
            <RadioGroup
              name="new-agency-type"
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

          <Field label="Appointed companies" control="group" required>
            <ul className={styles.choices}>
              {companies.map((company) => (
                <li key={company.id}>
                  <Checkbox
                    label={company.name}
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

          {error ? (
            <p role="alert" className={styles.refusal}>
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
