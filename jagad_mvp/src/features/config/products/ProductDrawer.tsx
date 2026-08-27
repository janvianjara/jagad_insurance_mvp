import { useState } from 'react'
import { CHECKLIST_PURPOSES, INSURANCE_LINES } from '../../../data/repo'
import type { InsuranceLine } from '../../../data/repo'
import { Field, FormSection, Input, Select } from '../../../ui/form'
import { StatusPill } from '../../../ui/signal'
import {
  GatedAction,
  LINE_LABELS,
  companyById,
  useConfigStore,
  useMarketStore,
} from '../shared'
import type { ConfigProduct } from '../shared'
import { BenefitSheetEditor } from './BenefitSheetEditor'
import { ChecklistEditor } from './ChecklistEditor'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

const PURPOSES = Object.values(CHECKLIST_PURPOSES)

/**
 * One product — FR-05, with the two things the plan hangs off this screen: the
 * per-product document checklist, and the policy-to-benefit map (FR-05.7).
 *
 * The code is shown and never edited. It is what the insurer files the policy
 * under and what every record already stores, exactly like a master value's key.
 */
export function ProductDrawer({ product }: { product: ConfigProduct }) {
  const categories = useConfigStore((state) => state.categories)
  const companies = useMarketStore((state) => state.companies)
  const saveProduct = useMarketStore((state) => state.saveProduct)
  const setProductActive = useMarketStore((state) => state.setProductActive)

  const [name, setName] = useState(product.name)
  const [companyId, setCompanyId] = useState(product.companyId)
  const [line, setLine] = useState<InsuranceLine>(product.line)
  const [categoryId, setCategoryId] = useState(product.categoryId)

  const company = companyById(companies, product.companyId)
  const changed =
    name.trim() !== product.name ||
    companyId !== product.companyId ||
    line !== product.line ||
    categoryId !== product.categoryId

  function companyName(id: string): string {
    return companyById(companies, id)?.shortName ?? 'A company no longer on file'
  }

  function categoryLabel(id: string): string {
    return categories.find((category) => category.id === id)?.label ?? id
  }

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The product"
        description="One company’s named policy. Its line decides which benefits it may carry and which category its demand arrives under."
      >
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="Company" required>
          <Select
            value={companyId}
            options={companies.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
            }))}
            onChange={(event) => setCompanyId(event.target.value)}
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

        <Field
          label="Inquiry category"
          hint="What routing sends this demand to, so the catalogue and the queues agree."
        >
          <Select
            value={categoryId}
            options={categories.map((category) => ({
              value: category.id,
              label: category.label,
            }))}
            onChange={(event) => setCategoryId(event.target.value)}
          />
        </Field>

        <p className={layout.mono}>
          {product.code} · {company?.name ?? 'No company on file'}
        </p>

        <GatedAction
          label="Save product"
          variant="primary"
          title={`Save "${product.name}"`}
          disabled={!changed}
          changes={[
            ...(name.trim() !== product.name
              ? [{ key: 'name', label: 'Name', from: product.name, to: name.trim() }]
              : []),
            ...(companyId !== product.companyId
              ? [
                  {
                    key: 'company',
                    label: 'Company',
                    from: companyName(product.companyId),
                    to: companyName(companyId),
                  },
                ]
              : []),
            ...(line !== product.line
              ? [
                  {
                    key: 'line',
                    label: 'Line',
                    from: LINE_LABELS[product.line],
                    to: LINE_LABELS[line],
                  },
                ]
              : []),
            ...(categoryId !== product.categoryId
              ? [
                  {
                    key: 'category',
                    label: 'Inquiry category',
                    from: categoryLabel(product.categoryId),
                    to: categoryLabel(categoryId),
                  },
                ]
              : []),
          ]}
          note={
            line === product.line
              ? 'The code stays: it is what the insurer files the policy under and what every record already stores.'
              : `Changing the line drops any benefit row that is not a ${LINE_LABELS[line]} benefit. Policies already written keep everything they were written with.`
          }
          confirmLabel="Save"
          toast={{ title: `"${name.trim()}" saved` }}
          onConfirm={() =>
            saveProduct(product.id, {
              companyId,
              code: product.code,
              name,
              line,
              categoryId,
            })
          }
        />
      </FormSection>

      <FormSection
        title="Document checklist"
        description="What this product asks for at each step. A company-wide list is inherited until this product is given its own."
      >
        {PURPOSES.map((purpose) => (
          <ChecklistEditor key={purpose} product={product} purpose={purpose} />
        ))}
      </FormSection>

      <FormSection
        title="Policy to benefit map"
        description="The rows this product contributes to a comparison, and the reading each one opens on. FR-05.7."
      >
        <BenefitSheetEditor product={product} />
      </FormSection>

      <FormSection
        title="Availability"
        description="A deactivated product stays on every policy that already names it and is quotable on none."
      >
        <div className={styles.chips}>
          <StatusPill tone={product.active ? 'ok' : 'idle'}>
            {product.active ? 'Active' : 'Deactivated'}
          </StatusPill>

          <GatedAction
            label={product.active ? 'Deactivate' : 'Reactivate'}
            title={`${product.active ? 'Deactivate' : 'Reactivate'} "${product.name}"`}
            changes={[
              {
                key: 'active',
                label: product.name,
                from: product.active ? 'Quotable' : 'Deactivated',
                to: product.active ? 'Deactivated' : 'Quotable',
              },
            ]}
            note={
              product.active
                ? 'Existing policies and renewals keep it. No new quotation can carry it.'
                : 'Quotation offers it again from now on.'
            }
            confirmLabel={product.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `"${product.name}" is ${product.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setProductActive(product.id, !product.active)}
          />
        </div>
      </FormSection>
    </div>
  )
}
