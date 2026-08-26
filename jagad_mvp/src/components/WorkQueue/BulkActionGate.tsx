import { useState } from 'react'
import type { RowData } from '@tanstack/react-table'
import { ConfirmGate } from '../guardrails'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/surface'
import { useToaster } from '../../ui/surface'
import type { QueueActionOutcome, QueueBulkAction, QueueSelection } from './queue-config'
import styles from './WorkQueue.module.css'

/**
 * A bulk action, gated.
 *
 * Bulk actions are outward mutations — they send, assign, escalate — so the
 * constitution puts every one of them behind `<ConfirmGate>`. This component is
 * the only path from the selection bar to `action.run`, which means Cancel
 * cannot write: it closes a dialog that never called anything.
 *
 * The receipt stays on screen after Confirm rather than the dialog vanishing.
 * A bulk send that closes instantly leaves someone unsure whether forty
 * messages went; the receipt, and then the toast, say so.
 */
export function BulkActionGate<Row extends RowData>({
  action,
  selection,
  onDone,
}: {
  action: QueueBulkAction<Row>
  selection: QueueSelection<Row>
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<QueueActionOutcome | null>(null)
  const toaster = useToaster()

  function close() {
    const ran = outcome !== null
    setOpen(false)
    setOutcome(null)
    if (ran) onDone()
  }

  return (
    <>
      <Button
        size="sm"
        variant={action.variant ?? 'quiet'}
        icon={action.icon}
        onClick={() => setOpen(true)}
      >
        {action.label}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={action.confirmTitle(selection)}
        dismissOnScrimClick={false}
        footer={outcome ? <Button variant="primary" onClick={close}>Close</Button> : null}
      >
        <ConfirmGate
          title={action.confirmTitle(selection)}
          changes={action.preview(selection)}
          note={action.note?.(selection)}
          confirmLabel={action.confirmLabel ?? action.label}
          onCancel={close}
          onConfirm={() => {
            void action.run(selection).then((result) => {
              setOutcome(result)
              toaster.notify({
                title: result.message,
                tone: result.ok ? 'ok' : 'bad',
                detail: result.ok
                  ? `${selection.ids.length} selected`
                  : 'Nothing was changed.',
              })
            })
          }}
          receipt={outcome ? outcome.message : 'Sent. Waiting for the receipt.'}
          className={styles.gate}
        />
      </Modal>
    </>
  )
}
