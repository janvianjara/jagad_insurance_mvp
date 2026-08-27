import { useState } from 'react'
import { BENEFIT_VALUE_KINDS, INSURANCE_LINES } from '../../../data/repo'
import type { BenefitValueKind, InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { BENEFIT_KIND_LABELS, LINE_LABELS, useMarketStore } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

/** Adding a catalogue benefit. Options and readings are edited on the row itself. */
export function NewBenefitDialog() {
  const addBenefitItem = useMarketStore((state) => state.addBenefitItem)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [line, setLine] = useState<InsuranceLine>('health')
  const [valueKind, setValueKind] = useState<BenefitValueKind>('text')
  const [section, setSection] = useState('')
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setLabel('')
    setLine('health')
    setValueKind('text')
    setSection('')
    setError(null)
  }

  function create() {
    const verdict = addBenefitItem({
      label,
      line,
      valueKind,
      section,
      options: [],
      defaultValue: '',
    })
    if (!verdict.ok) {
      setError(reasonOf(verdict))
      return
    }
    toaster.notify({ title: `"${label.trim()}" was added`, tone: 'ok' })
    close()
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New benefit
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New benefit"
        description="One row of a comparison sheet, offered to every product of its line."
        dismissOnScrimClick={false}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create benefit
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field label="Label" required>
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

          <Field label="Field type">
            <Select
              value={valueKind}
              options={Object.values(BENEFIT_VALUE_KINDS).map((value) => ({
                value,
                label: BENEFIT_KIND_LABELS[value],
              }))}
              onChange={(event) => setValueKind(event.target.value as BenefitValueKind)}
            />
          </Field>

          <Field label="Section" hint="Leave empty to file it under the line itself.">
            <Input value={section} onChange={(event) => setSection(event.target.value)} />
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
