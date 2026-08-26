import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from '../../ui/Icon'
import type { ConfirmPhase } from './confirm-phase'
import { cx } from './cx'
import styles from './ConfirmGate.module.css'

export type ConfirmChange = {
  key: string
  label: ReactNode
  /** What the record says now. Omit when the change creates rather than replaces. */
  from?: ReactNode
  /** What it will say once this is confirmed. */
  to: ReactNode
}

export type ConfirmGateProps = {
  title: ReactNode
  /** The intended change, spelled out. An empty list disables the gate entirely. */
  changes: readonly ConfirmChange[]
  /** The mutation. Called once, only from Confirm, never from Cancel. */
  onConfirm: () => void
  /** Told that the user backed out. Nothing else happens on cancel. */
  onCancel?: () => void
  /** Extra context above the buttons — who gets notified, what cannot be undone. */
  note?: ReactNode
  /** What the done-state receipt says. */
  receipt?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  className?: string
}

const EMPTY_PREVIEW = 'Nothing to preview, so there is nothing to confirm.'

/**
 * The prototype boundary made physical: nothing sends or saves without first
 * showing what it will do, and Cancel writes nothing.
 *
 * Every outward mutation goes through here — a bulk send, an escalation, a
 * status change the insurer or the customer will see, and every Assistant Act
 * (FR-22.4). The component owns three promises, and each has a test against it:
 *
 *   1. The preview is real. A gate with nothing to show refuses to confirm,
 *      because a confirm button over an empty box trains people to click through.
 *   2. Cancel invokes nothing. It does not call the mutation, it does not write,
 *      it does not close anything behind the caller's back. It reports and stops.
 *   3. Confirm emits once, then the preview is replaced by a receipt — so the
 *      screen says what happened rather than sitting there re-offering the button.
 */
export function ConfirmGate({
  title,
  changes,
  onConfirm,
  onCancel,
  note,
  receipt = 'Done. The change was recorded.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  className,
}: ConfirmGateProps) {
  const [phase, setPhase] = useState<ConfirmPhase>('preview')
  const receiptRef = useRef<HTMLDivElement>(null)

  const empty = changes.length === 0

  useEffect(() => {
    if (phase === 'done') receiptRef.current?.focus()
  }, [phase])

  function handleCancel() {
    // Deliberately the whole implementation. Cancel tells the caller and stops;
    // anything else here would be a write the user declined.
    if (phase !== 'preview') return
    onCancel?.()
  }

  function handleConfirm() {
    if (phase !== 'preview' || empty) return
    setPhase('done')
    onConfirm()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || phase !== 'preview') return
    event.stopPropagation()
    handleCancel()
  }

  const preview = (
    <dl className={styles.changes}>
      {changes.map((change) => (
        <div className={styles.change} key={change.key} data-change={change.key}>
          <dt className={styles.label}>{change.label}</dt>
          <dd className={styles.values}>
            {change.from === undefined ? null : (
              <>
                <span className={styles.from}>{change.from}</span>
                <Icon name="chevron-right" size="sm" className={styles.arrow} />
              </>
            )}
            <span className={styles.to}>{change.to}</span>
          </dd>
        </div>
      ))}
    </dl>
  )

  return (
    <section
      className={cx(styles.gate, className)}
      data-confirm-gate="true"
      data-phase={phase}
      onKeyDown={handleKeyDown}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {phase === 'done' ? (
        <div className={styles.receipt} role="status" tabIndex={-1} ref={receiptRef}>
          <p className={styles.receiptHead}>
            <Icon name="check" size="sm" />
            {receipt}
          </p>
          {preview}
        </div>
      ) : (
        <>
          <h3 className={styles.title}>{title}</h3>
          {empty ? (
            <p className={styles.empty} role="alert">
              {EMPTY_PREVIEW}
            </p>
          ) : (
            preview
          )}
          {note ? <p className={styles.note}>{note}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={handleCancel}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={styles.confirm}
              onClick={handleConfirm}
              disabled={empty}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
