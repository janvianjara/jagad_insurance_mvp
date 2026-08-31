import { useState } from 'react'
import { useRepositories } from '../../app/repositories-context'
import { ConfirmGate } from '../../components/guardrails'
import { Button } from '../../ui/Button'
import { Field, Select, Textarea } from '../../ui/form'
import { Modal } from '../../ui/surface'
import { GRIEVANCE_CATEGORIES, grievanceDesk } from './data/grievance-desk'
import type { Grievance, GrievanceCategory } from './data/grievance-desk'
import styles from './Portal.module.css'

/**
 * The grievance channel — plan §12, DPDP and the Consumer Protection Act 2019.
 *
 * §12 asks for a route by which a customer can raise a complaint and be given
 * something to quote. It is in the footer of every portal page rather than on a
 * page of its own for the reason the IA rules give: this is an action, not a
 * section, and a complaint channel a person has to go looking for is not a
 * channel. It is reachable from wherever they were when they got annoyed.
 *
 * Filing is an outward mutation — something leaves the customer and reaches the
 * agency — so it goes through `<ConfirmGate>` like every other one, and Cancel
 * writes nothing. The receipt carries the reference, and the modal says plainly
 * where that reference currently lives.
 */
export function PortalGrievance({ customerId }: { customerId: string | null }) {
  const repositories = useRepositories()
  const desk = grievanceDesk(repositories)

  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<GrievanceCategory>('service')
  const [description, setDescription] = useState('')
  const [armed, setArmed] = useState(false)
  const [filed, setFiled] = useState<Grievance | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const said = description.trim()
  const categoryLabel =
    GRIEVANCE_CATEGORIES.find((option) => option.value === category)?.label ?? category

  function close() {
    setOpen(false)
    setArmed(false)
    setProblem(null)
  }

  async function commit() {
    if (!customerId) return
    try {
      const record = await desk.file({ customerId, category, description: said })
      setFiled(record)
      setDescription('')
      setArmed(false)
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Nothing was recorded.')
      setArmed(false)
    }
  }

  return (
    <>
      <Button
        variant="quiet"
        icon="msg"
        disabled={customerId === null}
        onClick={() => {
          setFiled(null)
          setOpen(true)
        }}
      >
        Raise a grievance
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Raise a grievance"
        description="Tell us what went wrong. You will get a reference you can quote when you follow it up."
        dismissOnScrimClick={false}
        footer={
          filed ? (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          ) : armed ? null : (
            <>
              <Button variant="quiet" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={said === '' || customerId === null}
                onClick={() => setArmed(true)}
              >
                Review and send
              </Button>
            </>
          )
        }
      >
        {filed ? (
          <div className={styles.receipt} role="status">
            <p className={styles.footerTitle}>Your grievance has been recorded.</p>
            <p className={styles.reference}>{filed.reference}</p>
            <p className={styles.footerText}>
              Quote that reference when you follow this up. Jagad Insurance must acknowledge a
              grievance and tell you what happened to it; a data-protection grievance can also be
              taken to the Data Protection Board if you are not satisfied with the answer.
            </p>
            <p className={styles.note}>
              In this preview the grievance is held for the length of your session. The
              case-management record behind it is not built yet, and this page will not pretend
              otherwise.
            </p>
          </div>
        ) : (
          <div className={styles.form}>
            {problem ? (
              <p className={styles.problem} role="alert">
                {problem}
              </p>
            ) : null}

            <Field label="What is this about" required>
              <Select
                options={GRIEVANCE_CATEGORIES.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={category}
                onChange={(event) => {
                  setArmed(false)
                  setCategory(event.target.value as GrievanceCategory)
                }}
              />
            </Field>

            <Field
              label="What happened"
              required
              hint="In your own words. Please do not include your full Aadhaar number, a card number or a password."
            >
              <Textarea
                rows={5}
                value={description}
                onChange={(event) => {
                  setArmed(false)
                  setDescription(event.target.value)
                }}
              />
            </Field>

            {armed ? (
              <ConfirmGate
                title="Send this grievance to Jagad Insurance"
                changes={[
                  { key: 'category', label: 'About', to: categoryLabel },
                  { key: 'words', label: 'What you told us', to: said },
                ]}
                note="Sending records the grievance and gives you a reference. Nothing is recorded if you go back."
                confirmLabel="Yes, send it"
                cancelLabel="Go back and edit"
                receipt="Sent. Your reference is below."
                onCancel={() => setArmed(false)}
                onConfirm={() => void commit()}
              />
            ) : null}
          </div>
        )}
      </Modal>
    </>
  )
}

export default PortalGrievance
