import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { masterKeyFrom, useConfigStore } from '../shared'
import layout from '../shared/config-layout.module.css'

/**
 * Creating a master.
 *
 * The key is derived from the name and shown before the master exists, because
 * the key is the part records will store and the part that can never change
 * afterwards. Naming it out loud at the one moment it is decided is cheaper than
 * explaining later why "Vehicle Make" is stored as `vehicle_make`.
 *
 * "Cascades from" is where Make to Model is set up: choose Vehicle make as the
 * parent and every model value belongs to one make.
 */
export function NewMasterTypeDialog() {
  const masterTypes = useConfigStore((state) => state.masterTypes)
  const saveMasterType = useConfigStore((state) => state.saveMasterType)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [parentTypeId, setParentTypeId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const key = masterKeyFrom(label)

  function close() {
    setOpen(false)
    setLabel('')
    setParentTypeId('')
    setError(null)
  }

  function create() {
    if (label.trim() === '') {
      setError('Give the master a name.')
      return
    }
    if (masterTypes.some((type) => type.key === key)) {
      setError(`"${key}" is already a master.`)
      return
    }

    saveMasterType({
      label: label.trim(),
      key,
      parentTypeId: parentTypeId === '' ? null : parentTypeId,
    })
    toaster.notify({ title: `"${label.trim()}" was added`, tone: 'ok' })
    close()
  }

  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        New master
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New master"
        description="A list every form can offer. Its values are added on the master itself, or inline from any form that uses it."
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create}>
              Create master
            </Button>
          </>
        }
      >
        <div className={layout.stack}>
          <Field
            label="Name"
            required
            hint={key === '' ? undefined : `Records will store the key ${key}.`}
          >
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </Field>

          <Field
            label="Cascades from"
            hint="Leave empty for a flat list. Vehicle model cascades from Vehicle make."
          >
            <Select
              value={parentTypeId}
              placeholder="A flat list, no parent"
              options={masterTypes
                .filter((type) => type.parentTypeId === null)
                .map((type) => ({ value: type.id, label: type.label }))}
              onChange={(event) => setParentTypeId(event.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className={layout.muted}>
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
