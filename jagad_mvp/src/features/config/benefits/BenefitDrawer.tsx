import { useState } from 'react'
import { BENEFIT_VALUE_KINDS, INSURANCE_LINES } from '../../../data/repo'
import type { BenefitValueKind, InsuranceLine } from '../../../data/repo'
import { Button } from '../../../ui/Button'
import { Field, FormSection, Input, Select } from '../../../ui/form'
import { Badge, StatusPill } from '../../../ui/signal'
import {
  BENEFIT_KIND_LABELS,
  GatedAction,
  LINE_LABELS,
  useMarketStore,
} from '../shared'
import type { ConfigBenefitItem } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/**
 * One catalogue benefit — FR-06.4's six fields, each editable.
 *
 * `options` are readings a configurator lifted off a brochure and wants offered
 * again: they are suggestions on the product map, never a computed value, and a
 * benefit with none is simply typed free. `default` is what a newly mapped
 * product row starts on, and blank is a real answer — the sheet says nothing
 * rather than guessing.
 */
export function BenefitDrawer({ item }: { item: ConfigBenefitItem }) {
  const benefitMaps = useMarketStore((state) => state.benefitMaps)
  const products = useMarketStore((state) => state.products)
  const saveBenefitItem = useMarketStore((state) => state.saveBenefitItem)
  const setBenefitItemActive = useMarketStore((state) => state.setBenefitItemActive)
  const moveBenefitItem = useMarketStore((state) => state.moveBenefitItem)

  const [label, setLabel] = useState(item.label)
  const [line, setLine] = useState<InsuranceLine>(item.line)
  const [valueKind, setValueKind] = useState<BenefitValueKind>(item.valueKind)
  const [section, setSection] = useState(item.section)
  const [defaultValue, setDefaultValue] = useState(item.defaultValue)
  const [options, setOptions] = useState<readonly string[]>(item.options)
  const [optionDraft, setOptionDraft] = useState('')

  const carriedBy = products.filter((product) =>
    benefitMaps.some((row) => row.benefitItemId === item.id && row.productId === product.id),
  )

  const optionsChanged =
    options.length !== item.options.length ||
    options.some((option, index) => option !== item.options[index])
  const changed =
    label.trim() !== item.label ||
    line !== item.line ||
    valueKind !== item.valueKind ||
    section.trim() !== item.section ||
    defaultValue !== item.defaultValue ||
    optionsChanged

  return (
    <div className={styles.drawer}>
      <FormSection
        title="The benefit"
        description="One row of a comparison sheet. Its line decides which products may carry it."
      >
        <Field label="Label" required hint="What the sheet prints in the row header.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
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

        <Field label="Field type" hint="How the value reads on the matrix. Never how it is derived.">
          <Select
            value={valueKind}
            options={Object.values(BENEFIT_VALUE_KINDS).map((value) => ({
              value,
              label: BENEFIT_KIND_LABELS[value],
            }))}
            onChange={(event) => setValueKind(event.target.value as BenefitValueKind)}
          />
        </Field>

        <Field label="Section" hint="The heading this benefit sits under on the sheet.">
          <Input value={section} onChange={(event) => setSection(event.target.value)} />
        </Field>

        <Field
          label="Default reading"
          hint="What a newly mapped product starts on. Leave empty to pre-fill nothing."
        >
          <Input
            value={defaultValue}
            onChange={(event) => setDefaultValue(event.target.value)}
          />
        </Field>

        <Field label="Options" control="group" hint="Readings offered on the product map. None means free text.">
          {options.length === 0 ? (
            <p className={styles.hint}>No options. The reading is typed off the brochure.</p>
          ) : (
            <ul className={styles.rows}>
              {options.map((option) => (
                <li key={option} className={styles.row} data-option={option}>
                  <div className={styles.rowHead}>
                    <span className={styles.rowName}>{option}</span>
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() =>
                        setOptions((current) => current.filter((entry) => entry !== option))
                      }
                    >
                      Remove option
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.inline}>
            <Field label={`New option for ${item.label}`} className={styles.grow}>
              <Input
                value={optionDraft}
                onChange={(event) => setOptionDraft(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              icon="plus"
              disabled={optionDraft.trim() === '' || options.includes(optionDraft.trim())}
              onClick={() => {
                setOptions((current) => [...current, optionDraft.trim()])
                setOptionDraft('')
              }}
            >
              Add option
            </Button>
          </div>
        </Field>

        <p className={layout.mono}>
          {item.key} · position {item.sortOrder}
        </p>

        <GatedAction
          label="Save benefit"
          variant="primary"
          title={`Save "${item.label}"`}
          disabled={!changed}
          changes={[
            ...(label.trim() !== item.label
              ? [{ key: 'label', label: 'Label', from: item.label, to: label.trim() }]
              : []),
            ...(line !== item.line
              ? [{ key: 'line', label: 'Line', from: LINE_LABELS[item.line], to: LINE_LABELS[line] }]
              : []),
            ...(valueKind !== item.valueKind
              ? [
                  {
                    key: 'kind',
                    label: 'Field type',
                    from: BENEFIT_KIND_LABELS[item.valueKind],
                    to: BENEFIT_KIND_LABELS[valueKind],
                  },
                ]
              : []),
            ...(section.trim() !== item.section
              ? [{ key: 'section', label: 'Section', from: item.section, to: section.trim() }]
              : []),
            ...(defaultValue !== item.defaultValue
              ? [
                  {
                    key: 'default',
                    label: 'Default reading',
                    from: item.defaultValue === '' ? 'Nothing pre-filled' : item.defaultValue,
                    to: defaultValue === '' ? 'Nothing pre-filled' : defaultValue,
                  },
                ]
              : []),
            ...(optionsChanged
              ? [
                  {
                    key: 'options',
                    label: 'Options',
                    from: `${item.options.length} offered`,
                    to: `${options.length} offered`,
                  },
                ]
              : []),
          ]}
          note={`${carriedBy.length} product${carriedBy.length === 1 ? '' : 's'} carry this benefit. Their recorded readings are untouched; only what the sheet offers next changes.`}
          confirmLabel="Save"
          toast={{ title: `"${label.trim()}" saved` }}
          onConfirm={() =>
            saveBenefitItem(item.id, {
              label,
              line,
              valueKind,
              section,
              options,
              defaultValue,
            })
          }
        />
      </FormSection>

      <FormSection
        title="Display order"
        description="The order the comparison sheet prints this line's benefits in."
      >
        <div className={styles.rowActions}>
          <Button type="button" variant="quiet" size="sm" onClick={() => moveBenefitItem(item.id, -1)}>
            Move up
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={() => moveBenefitItem(item.id, 1)}>
            Move down
          </Button>
          <span className={styles.section}>position {item.sortOrder}</span>
        </div>
      </FormSection>

      <FormSection
        title="Availability"
        description="A deactivated benefit stays on every sheet that already prints it and is offered on no new product."
      >
        <div className={styles.chips}>
          <StatusPill tone={item.active ? 'ok' : 'idle'}>
            {item.active ? 'Active' : 'Deactivated'}
          </StatusPill>
          {carriedBy.slice(0, 4).map((product) => (
            <Badge key={product.id} tone="neutral">
              {product.code}
            </Badge>
          ))}

          <GatedAction
            label={item.active ? 'Deactivate' : 'Reactivate'}
            title={`${item.active ? 'Deactivate' : 'Reactivate'} "${item.label}"`}
            changes={[
              {
                key: 'active',
                label: item.label,
                from: item.active ? 'Offered on new products' : 'Deactivated',
                to: item.active ? 'Deactivated' : 'Offered on new products',
              },
            ]}
            note={
              item.active
                ? `The ${carriedBy.length} product${carriedBy.length === 1 ? '' : 's'} already carrying it keep it.`
                : 'Products may map it again from now on.'
            }
            confirmLabel={item.active ? 'Deactivate' : 'Reactivate'}
            toast={{ title: `"${item.label}" is ${item.active ? 'deactivated' : 'active'}` }}
            onConfirm={() => setBenefitItemActive(item.id, !item.active)}
          />
        </div>
      </FormSection>
    </div>
  )
}
