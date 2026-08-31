import { useState } from 'react'
import { INSURANCE_LINES } from '../../../data/repo'
import type { InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Field, Input, QuickAdd, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { CompanyQuickAdd, LINE_LABELS, useConfigStore, useMarketStore } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/** Adding a product. Its checklist and its benefit sheet are built on the row itself. */
export function NewProductDialog() {
  const categories = useConfigStore((state) => state.categories)
  const companies = useMarketStore((state) => state.companies)
  const addProduct = useMarketStore((state) => state.addProduct)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [line, setLine] = useState<InsuranceLine>('health')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setName('')
    setCode('')
    setCompanyId('')
    setLine('health')
    setCategoryId('')
    setError(null)
  }

  function create() {
    if (categoryId === '') {
      setError('Choose the inquiry category this product answers, so routing and the catalogue agree.')
      return
    }

    const verdict = addProduct({ companyId, code, name, line, categoryId })
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
        New product
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New product"
        description="One company’s named policy, quotable once it carries a benefit or two."
        dismissOnScrimClick={false}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create product
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field label="Company" required>
            <QuickAdd
              label="New company"
              form={(dismiss) => (
                <CompanyQuickAdd
                  onCancel={dismiss}
                  onCreated={(created) => {
                    setCompanyId(created.id)
                    dismiss()
                  }}
                />
              )}
            >
              <Select
                value={companyId}
                placeholder="Choose a company"
                options={companies.map((company) => ({ value: company.id, label: company.name }))}
                onChange={(event) => setCompanyId(event.target.value)}
              />
            </QuickAdd>
          </Field>

          <Field label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Code" required hint="What the insurer files the policy under. It never changes.">
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
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
              placeholder="Choose a category"
              options={categories.map((category) => ({
                value: category.id,
                label: category.label,
              }))}
              onChange={(event) => setCategoryId(event.target.value)}
            />
          </Field>

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
