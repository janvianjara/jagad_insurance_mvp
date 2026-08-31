import { useState } from 'react'
import { Button } from '../../ui/Button'
import type { ButtonSize } from '../../ui/Button'
import { ImportWizard } from './ImportWizard'

export type ImportActionProps = {
  /** Which `ImportSpec` this button opens. */
  readonly specKey: string
  readonly label?: string
  readonly size?: ButtonSize
  /** Called after a commit created something — a queue behind should reload. */
  readonly onCommitted?: () => void
}

/**
 * The door into the wizard, from wherever the operator already is.
 *
 * The wizard is mounted only while it is open, which is the point rather than an
 * optimisation: a closed-and-reopened import starts clean, with no file, no
 * mapping and no half-finished decision from last time waiting to be committed
 * by somebody who thought they were starting over.
 */
export function ImportAction({ specKey, label, size, onCommitted }: ImportActionProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button icon="upload" size={size} onClick={() => setOpen(true)}>
        {label ?? 'Import from Excel'}
      </Button>
      {open ? (
        <ImportWizard
          specKey={specKey}
          onClose={() => setOpen(false)}
          {...(onCommitted === undefined ? {} : { onCommitted })}
        />
      ) : null}
    </>
  )
}
