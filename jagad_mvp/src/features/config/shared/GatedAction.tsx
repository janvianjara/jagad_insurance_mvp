import { useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmGate } from '../../../components/guardrails'
import type { ConfirmChange } from '../../../components/guardrails'
import { Button } from '../../../ui/Button'
import type { ButtonSize, ButtonVariant } from '../../../ui/Button'
import type { IconName } from '../../../ui/Icon'
import { Modal, useToaster } from '../../../ui/surface'
import type { Tone } from '../../../ui/tone'

export type GatedActionProps = {
  /** The trigger's wording. Also the confirm button's, unless overridden. */
  label: string
  /** What the gate is about to do, as a sentence. */
  title: string
  /** The intended change, spelled out. An empty list disables Confirm. */
  changes: readonly ConfirmChange[]
  onConfirm: () => void
  note?: ReactNode
  confirmLabel?: string
  receipt?: string
  toast?: { readonly title: string; readonly detail?: string; readonly tone?: Tone }
  icon?: IconName
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  className?: string
}

/**
 * One outward configuration change, gated — the constitution's "every outward
 * mutation goes through `<ConfirmGate>`; Cancel writes nothing".
 *
 * Configuration changes are outward even though nothing leaves the building:
 * assigning a template changes what a colleague can open, deactivating a master
 * value changes what every form offers, and both are felt by someone who is not
 * in the room. So they are previewed before they happen and receipted after.
 *
 * The shape follows `<BulkActionGate>` deliberately — trigger, modal, gate,
 * receipt, then Close — so a configuration confirmation and a queue confirmation
 * are the same three clicks. `onConfirm` is reachable from Confirm and from
 * nowhere else.
 */
export function GatedAction({
  label,
  title,
  changes,
  onConfirm,
  note,
  confirmLabel,
  receipt,
  toast,
  icon,
  variant = 'quiet',
  size = 'sm',
  disabled,
  className,
}: GatedActionProps) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const toaster = useToaster()

  function close() {
    setOpen(false)
    setDone(false)
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={icon}
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={title}
        dismissOnScrimClick={false}
        footer={
          done ? (
            <Button variant="primary" onClick={close}>
              Close
            </Button>
          ) : null
        }
      >
        <ConfirmGate
          title={title}
          changes={changes}
          note={note}
          confirmLabel={confirmLabel ?? label}
          receipt={receipt ?? 'Done. The change was recorded.'}
          onCancel={close}
          onConfirm={() => {
            setDone(true)
            onConfirm()
            if (toast) toaster.notify({ tone: 'ok', ...toast })
          }}
        />
      </Modal>
    </>
  )
}
