import { useState } from 'react'
import { ConfirmGate } from '../../../components/guardrails'
import { Button } from '../../../ui/Button'
import { Modal, useToaster } from '../../../ui/surface'
import { DELETION_OFFERS, deletionVerdict, describeUsage, useConfigStore } from '../shared'
import type { ConfigMasterType, ConfigMasterValue, MasterUsage } from '../shared'
import styles from './masters.module.css'

export type DeleteValueActionProps = {
  type: ConfigMasterType
  value: ConfigMasterValue
  usage: MasterUsage
  /** Values that cascade from this one, which deleting would orphan. */
  childCount: number
}

/**
 * **Deactivate, never delete, when a value is in use** — FR-02, and the rule
 * P-10a names as its second acceptance criterion.
 *
 * The Delete button stays enabled and the refusal happens after it is pressed.
 * That is not a detail: a greyed-out button says "no" and nothing else, and the
 * thing a person needs to know here is *why* — that fourteen inquiries are
 * holding this source, and that deactivating does the job they actually wanted
 * without breaking those fourteen records.
 *
 * So the modal either offers the deletion, previewed, or refuses it in a
 * sentence and offers deactivation in its place. Both paths go through
 * `<ConfirmGate>`, and Cancel writes nothing on either.
 */
export function DeleteValueAction({ type, value, usage, childCount }: DeleteValueActionProps) {
  const deleteMasterValue = useConfigStore((state) => state.deleteMasterValue)
  const setMasterValueActive = useConfigStore((state) => state.setMasterValueActive)
  const toaster = useToaster()

  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  const verdict = deletionVerdict({ type, value, usage, childCount })

  function close() {
    setOpen(false)
    setDone(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={`Delete "${value.label}"`}
        dismissOnScrimClick={false}
        footer={
          done ? (
            <Button variant="primary" onClick={close}>
              Close
            </Button>
          ) : null
        }
      >
        {verdict.allowed ? (
          <ConfirmGate
            title={`Delete "${value.label}" from ${type.label}`}
            changes={[
              { key: 'value', label: type.label, from: value.label, to: 'Removed' },
              { key: 'key', label: 'Stored key', from: value.key, to: 'Removed' },
            ]}
            note={verdict.reason}
            confirmLabel="Delete"
            receipt={`"${value.label}" was removed from ${type.label}.`}
            onCancel={close}
            onConfirm={() => {
              setDone(true)
              deleteMasterValue(value.id)
              toaster.notify({ title: `"${value.label}" was deleted`, tone: 'bad' })
            }}
          />
        ) : (
          <>
            <p role="alert" className={styles.refusal}>
              {verdict.reason} It cannot be deleted.
            </p>

            {verdict.offer === DELETION_OFFERS.deactivate && value.active ? (
              <ConfirmGate
                title={`Deactivate "${value.label}" instead`}
                changes={[
                  { key: 'active', label: type.label, from: 'Offered on forms', to: 'Deactivated' },
                  {
                    key: 'records',
                    label: 'Records already holding it',
                    from: describeUsage(usage),
                    to: 'Untouched, and still readable',
                  },
                ]}
                note="No new record can choose it from tomorrow; every record that already did keeps it, and the value can be reactivated at any time."
                confirmLabel="Deactivate instead"
                receipt={`"${value.label}" is deactivated. Forms no longer offer it.`}
                onCancel={close}
                onConfirm={() => {
                  setDone(true)
                  setMasterValueActive(value.id, false)
                  toaster.notify({ title: `"${value.label}" was deactivated`, tone: 'ok' })
                }}
              />
            ) : (
              <p>
                {value.active
                  ? 'Nothing else can be done to this value here.'
                  : 'It is already deactivated, so no form offers it.'}
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
