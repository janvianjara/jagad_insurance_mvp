import { useState } from 'react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/surface'
import type { DiscardableEntity, DiscardCommand } from '../../domain/amend'
import type { MutationResult } from '../../data/repo'
import { DiscardPanel } from './DiscardPanel'

export type RowDiscardActionProps<T extends object> = {
  readonly entity: DiscardableEntity
  /** The record's number, so the dialog names what is being removed. */
  readonly subject: string
  readonly actorId: string
  readonly onDiscard: (command: DiscardCommand) => Promise<MutationResult<T>>
  /** Refreshes the queue. The row is about to leave it. */
  readonly onDiscarded: () => void
}

/**
 * Discard, from the row itself.
 *
 * The queue already offers this two other ways — inside a record's correction
 * drawer, and across a ticked selection — and this is the third because it
 * answers a question neither of those does well: one row, in front of me, that
 * should not be here. Ticking a single checkbox to reach a bulk action is a
 * detour, and opening the record to delete it means opening a record precisely
 * because it should not exist.
 *
 * It is a modal rather than a drawer, unlike the correction path. The drawer is
 * for work you do beside the record you are reading; this is a decision taken
 * about a row in a list, with nothing behind it worth keeping visible, and a
 * modal is what stops the list scrolling out from under the question.
 *
 * The panel inside is the same `<DiscardPanel>` the drawer uses, so the reason
 * list, the wording and the confirmation are one implementation. Three routes
 * to discarding a record, one definition of what discarding means.
 */
export function RowDiscardAction<T extends object>({
  entity,
  subject,
  actorId,
  onDiscard,
  onDiscarded,
}: RowDiscardActionProps<T>) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        icon="close"
        // The row already carries the customer's name; the button must still say
        // which record it removes, because a screen reader meets it alone.
        aria-label={`Discard ${subject}`}
        onClick={() => setOpen(true)}
      >
        Discard
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Discard ${subject}`}
        description="Reversible. The record leaves the queues and stays in the book."
        // The reason is a choice somebody is part-way through making. Losing it
        // to a stray click on the scrim is a small thing that feels like a bug.
        dismissOnScrimClick={false}
        size="sm"
      >
        <DiscardPanel
          entity={entity}
          subject={subject}
          actorId={actorId}
          onDiscard={onDiscard}
          onDiscarded={() => {
            setOpen(false)
            onDiscarded()
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}
