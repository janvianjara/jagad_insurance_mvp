import { useState } from 'react'
import { INSURANCE_LINES } from '../../../data/repo'
import type { InsuranceLine } from '../../../data/repo'
import { reasonOf } from '../../../domain/workflows'
import { Button } from '../../../ui/Button'
import { Checkbox, Field, Input } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { LINE_LABELS, useMarketStore } from '../shared'
import layout from '../shared/config-layout.module.css'
import styles from '../shared/market-panels.module.css'

const ALL_LINES = Object.values(INSURANCE_LINES)

/**
 * Adding an insurer partnership — canvas 6.1.
 *
 * The lines are asked for at creation because they are what makes this row a
 * company rather than a brand: the life arm and the general arm of the same
 * group are two appointments, two commission schedules and two claims desks, so
 * they are two rows here. The store refuses a row that tries to be both, and the
 * refusal is shown in the dialog rather than swallowed.
 */
export function NewCompanyDialog() {
  const addCompany = useMarketStore((state) => state.addCompany)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [claimsEmail, setClaimsEmail] = useState('')
  const [lines, setLines] = useState<readonly InsuranceLine[]>([])
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setName('')
    setShortName('')
    setClaimsEmail('')
    setLines([])
    setError(null)
  }

  function create() {
    const verdict = addCompany({ name, shortName, lines, claimsEmail })
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
        New company
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New company"
        description="One licensed insurer, appointed for the lines it writes."
        dismissOnScrimClick={false}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create company
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field label="Registered name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field label="Short name" hint="What the queues and the comparison sheet print.">
            <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
          </Field>

          <Field label="Claims desk email">
            <Input
              type="email"
              value={claimsEmail}
              onChange={(event) => setClaimsEmail(event.target.value)}
            />
          </Field>

          <Field
            label="Lines appointed for"
            control="group"
            required
            hint="A life company and a general company are two rows here, never one."
          >
            <ul className={styles.choices}>
              {ALL_LINES.map((line) => (
                <li key={line}>
                  <Checkbox
                    label={LINE_LABELS[line]}
                    checked={lines.includes(line)}
                    onChange={(event) =>
                      setLines((current) =>
                        event.target.checked
                          ? [...current, line]
                          : current.filter((candidate) => candidate !== line),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
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
