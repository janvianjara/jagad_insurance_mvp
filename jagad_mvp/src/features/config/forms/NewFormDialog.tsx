import { useState } from 'react'
import { Button } from '../../../ui/Button'
import { Field, Input, Select } from '../../../ui/form'
import { Modal, useToaster } from '../../../ui/surface'
import { reservedFieldsFor } from '../../../domain/forms'
import { useFormsStore } from './forms-store'
import layout from '../shared/config-layout.module.css'

/**
 * Authoring a new form.
 *
 * D1 makes the whole system configuration rather than code, and that promise was
 * only half kept: the builder could edit a form somebody else had seeded but
 * offered no way to author one.
 *
 * The object key is the important choice, so it is made explicitly rather than
 * derived from a label. It is what records store, what `resolveFormSchema` looks
 * up, and what decides which fields are reserved - and this dialog says which
 * ones the choice brings with it, before the form exists.
 */
const OBJECTS: readonly { value: string; label: string }[] = [
  { value: 'policy_entry', label: 'Policy entry - all products' },
  { value: 'policy_entry_health', label: 'Policy entry - health' },
  { value: 'policy_entry_motor', label: 'Policy entry - motor' },
  { value: 'policy_entry_life', label: 'Policy entry - life' },
  { value: 'inquiry', label: 'Inquiry capture' },
  { value: 'kyc', label: 'KYC' },
]

export function NewFormDialog() {
  const createSchema = useFormsStore((state) => state.createSchema)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [objectKey, setObjectKey] = useState(OBJECTS[0].value)
  const [productId, setProductId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reserved = reservedFieldsFor(objectKey)

  function close() {
    setOpen(false)
    setObjectKey(OBJECTS[0].value)
    setProductId('')
    setError(null)
  }

  function create() {
    const outcome = createSchema({
      objectKey,
      productId: productId.trim() === '' ? null : productId.trim(),
    })
    if (!outcome.ok) {
      setError(outcome.reason)
      return
    }
    toaster.notify({
      tone: 'ok',
      title: `${objectKey} form created at version 1`,
      detail: 'Open it to add stages and fields. Nothing renders against it until it is published.',
    })
    close()
  }

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        New form
      </Button>

      <Modal open={open} onClose={close} title="New form" size="md">
        <div className={layout.dialogBody}>
          <Field label="What it captures" hint="Records store this key and pin the version they were captured under.">
            <Select
              value={objectKey}
              options={OBJECTS}
              onChange={(event) => {
                setObjectKey(event.target.value)
                setError(null)
              }}
            />
          </Field>

          <Field
            label="For one product only"
            hint="Leave empty for every product. A product-specific form wins over the fallback."
          >
            <Input
              value={productId}
              placeholder="Product id, or leave empty"
              onChange={(event) => setProductId(event.target.value)}
            />
          </Field>

          {reserved.length > 0 ? (
            <p className={layout.dialogNote}>
              {reserved.length} reserved{' '}
              {reserved.length === 1 ? 'field comes' : 'fields come'} with this object and cannot be
              removed later: {reserved.map((field) => field.key).join(', ')}. The form opens with
              them already in place.
            </p>
          ) : null}

          {error ? (
            <p className={layout.dialogError} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className={layout.dialogActions}>
          <Button variant="quiet" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create}>
            Create the form
          </Button>
        </div>
      </Modal>
    </>
  )
}
