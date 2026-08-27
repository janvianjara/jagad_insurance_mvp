import { useState } from 'react'
import { INSURANCE_LINES } from '../../../data/repo'
import type { InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Checkbox, Field, FormSection, Input, Select } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import {
  GatedAction,
  LINE_LABELS,
  companyLinesFormOneLicence,
  useConfigStore,
  useMarketStore,
} from '../shared'
import type { ConfigCompany } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

const ALL_LINES = Object.values(INSURANCE_LINES)

/**
 * One company — FR-04, canvas 6.1.
 *
 * The lines are checkboxes rather than a free list because the set is the
 * platform's own, and the licence rule is checked as they are ticked: life and
 * general are separately licensed, so a row holding both is refused here with
 * the sentence the store would have refused with. That refusal is the whole
 * reason HDFC Life and HDFC Ergo General are two rows in this screen.
 *
 * Contacts are filed per category because the desk that needs the name is the
 * desk holding the record — a health claim wants the health contact.
 */
export function CompanyDrawer({ company }: { company: ConfigCompany }) {
  const categories = useConfigStore((state) => state.categories)
  const contacts = useMarketStore((state) => state.contacts)
  const products = useMarketStore((state) => state.products)
  const saveCompany = useMarketStore((state) => state.saveCompany)
  const setCompanyActive = useMarketStore((state) => state.setCompanyActive)
  const addContact = useMarketStore((state) => state.addContact)
  const removeContact = useMarketStore((state) => state.removeContact)

  const [name, setName] = useState(company.name)
  const [shortName, setShortName] = useState(company.shortName)
  const [claimsEmail, setClaimsEmail] = useState(company.claimsEmail)
  const [lines, setLines] = useState<readonly InsuranceLine[]>(company.lines)

  const [contactName, setContactName] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [contactMobile, setContactMobile] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactCategory, setContactCategory] = useState('')

  const own = contacts.filter((contact) => contact.companyId === company.id)
  const written = products.filter((product) => product.companyId === company.id)
  const licence = companyLinesFormOneLicence(lines)

  const linesChanged =
    lines.length !== company.lines.length || lines.some((line) => !company.lines.includes(line))
  const changed =
    name.trim() !== company.name ||
    shortName.trim() !== company.shortName ||
    claimsEmail.trim() !== company.claimsEmail ||
    linesChanged

  function toggleLine(line: InsuranceLine, on: boolean) {
    setLines((current) =>
      on ? [...current, line] : current.filter((candidate) => candidate !== line),
    )
  }

  function categoryLabel(categoryId: string | null): string {
    if (!categoryId) return 'Every category'
    return categories.find((category) => category.id === categoryId)?.label ?? 'Unknown category'
  }

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The company"
        description="One licensed insurer. Its lines decide where it is offered — quotation, placement and claims all read them from here."
      >
        <Field label="Registered name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Short name" hint="What the queues and the comparison sheet print.">
          <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
        </Field>

        <Field label="Claims desk email" hint="Where a claim intimation is sent.">
          <Input
            type="email"
            value={claimsEmail}
            onChange={(event) => setClaimsEmail(event.target.value)}
          />
        </Field>

        <Field label="Lines appointed for" control="group" required>
          <ul className={styles.choices}>
            {ALL_LINES.map((line) => (
              <li key={line}>
                <Checkbox
                  label={LINE_LABELS[line]}
                  checked={lines.includes(line)}
                  onChange={(event) => toggleLine(line, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        </Field>

        {licence.ok ? null : (
          <p role="alert" className={styles.refusal}>
            {reasonOf(licence)}
          </p>
        )}

        <p className={layout.mono}>
          {company.key} · {written.length} product{written.length === 1 ? '' : 's'}
        </p>

        <GatedAction
          label="Save company"
          variant="primary"
          title={`Save "${company.name}"`}
          disabled={!changed || !licence.ok}
          changes={[
            ...(name.trim() !== company.name
              ? [{ key: 'name', label: 'Registered name', from: company.name, to: name.trim() }]
              : []),
            ...(shortName.trim() !== company.shortName
              ? [
                  {
                    key: 'shortName',
                    label: 'Short name',
                    from: company.shortName,
                    to: shortName.trim(),
                  },
                ]
              : []),
            ...(claimsEmail.trim() !== company.claimsEmail
              ? [
                  {
                    key: 'claimsEmail',
                    label: 'Claims desk',
                    from: company.claimsEmail,
                    to: claimsEmail.trim(),
                  },
                ]
              : []),
            ...(linesChanged
              ? [
                  {
                    key: 'lines',
                    label: 'Lines',
                    from: company.lines.map((line) => LINE_LABELS[line]).join(', '),
                    to: lines.map((line) => LINE_LABELS[line]).join(', ') || 'None',
                  },
                ]
              : []),
          ]}
          note="Quotation, placement and claims all offer this company by its lines. Changing them changes what every one of them offers."
          confirmLabel="Save"
          toast={{ title: `"${name.trim()}" saved` }}
          onConfirm={() =>
            saveCompany(company.id, {
              name,
              shortName,
              lines,
              claimsEmail,
            })
          }
        />
      </FormSection>

      <FormSection
        title="Availability"
        description="A deactivated company stays on every record that already names it and is offered on no new one."
      >
        <div className={styles.chips}>
          <StatusPill tone={company.active ? 'ok' : 'idle'}>
            {company.active ? 'Active' : 'Deactivated'}
          </StatusPill>

          <GatedAction
            label={company.active ? 'Deactivate' : 'Reactivate'}
            title={`${company.active ? 'Deactivate' : 'Reactivate'} "${company.name}"`}
            changes={[
              {
                key: 'active',
                label: company.name,
                from: company.active ? 'Offered' : 'Deactivated',
                to: company.active ? 'Deactivated' : 'Offered',
              },
            ]}
            note={
              company.active
                ? 'Existing policies and claims keep the company. No new quotation can place with it.'
                : 'Quotation and placement offer it again from now on.'
            }
            confirmLabel={company.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `"${company.name}" is ${company.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setCompanyActive(company.id, !company.active)}
          />
        </div>
      </FormSection>

      <FormSection
        title={`Contacts (${own.length})`}
        description="Per category, so the desk holding the record has the name to call. A contact with no category answers for every one."
      >
        {own.length === 0 ? (
          <p className={styles.hint}>
            No contact on file. The claims desk has an email address and nobody to phone.
          </p>
        ) : (
          <ul className={styles.rows}>
            {own.map((contact) => (
              <li key={contact.id} className={styles.row} data-contact-id={contact.id}>
                <div className={styles.rowHead}>
                  <span className={styles.rowName}>{contact.name}</span>
                  <Badge tone="neutral">{categoryLabel(contact.categoryId)}</Badge>
                </div>
                <div className={styles.rowMeta}>
                  <span>{contact.role}</span>
                  <span className={layout.mono}>{contact.mobile}</span>
                  <span>{contact.email}</span>
                </div>
                <div className={styles.rowActions}>
                  <GatedAction
                    label="Remove"
                    variant="danger"
                    title={`Remove ${contact.name}`}
                    changes={[
                      {
                        key: 'contact',
                        label: categoryLabel(contact.categoryId),
                        from: `${contact.name}, ${contact.role}`,
                        to: 'No contact on file',
                      },
                    ]}
                    note="Anything already sent keeps the name it was sent to."
                    confirmLabel="Remove"
                    toast={{ title: `${contact.name} removed` }}
                    onConfirm={() => removeContact(contact.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={layout.tight}>
          <div className={styles.inline}>
            <Field label="Contact name" className={styles.grow}>
              <Input value={contactName} onChange={(event) => setContactName(event.target.value)} />
            </Field>
            <Field label="Role" className={styles.grow}>
              <Input value={contactRole} onChange={(event) => setContactRole(event.target.value)} />
            </Field>
          </div>

          <div className={styles.inline}>
            <Field label="Category" className={styles.grow} hint="Leave empty for every category.">
              <Select
                value={contactCategory}
                placeholder="Every category"
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.label,
                }))}
                onChange={(event) => setContactCategory(event.target.value)}
              />
            </Field>
            <Field label="Mobile" className={styles.grow}>
              <Input
                value={contactMobile}
                onChange={(event) => setContactMobile(event.target.value)}
              />
            </Field>
            <Field label="Email" className={styles.grow}>
              <Input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </Field>
          </div>

          <div className={styles.rowActions}>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              icon="plus"
              disabled={contactName.trim() === ''}
              onClick={() => {
                addContact({
                  companyId: company.id,
                  name: contactName,
                  role: contactRole,
                  mobile: contactMobile,
                  email: contactEmail,
                  categoryId: contactCategory === '' ? null : contactCategory,
                })
                setContactName('')
                setContactRole('')
                setContactMobile('')
                setContactEmail('')
                setContactCategory('')
              }}
            >
              Add contact
            </Button>
          </div>
        </div>
      </FormSection>
    </div>
  )
}
