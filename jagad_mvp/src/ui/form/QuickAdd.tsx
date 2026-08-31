import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from '../Button'
import { cx } from './cx'
import styles from './QuickAdd.module.css'

export type QuickAddProps = {
  /** The control this stands beside — a Select, a Combobox. */
  children: ReactNode
  /** Names the trigger and titles the panel: "New agent", "New customer". */
  label: string
  /** The create row, rendered under the control. Call `close` when done. */
  form: (close: () => void) => ReactNode
  /** No create path from here yet — the plus is shown, and says why not. */
  disabled?: boolean
  /** The sentence the disabled plus carries: "Choose an agent first." */
  disabledReason?: string
  className?: string
}

/**
 * Add the missing option without leaving the form.
 *
 * The dropdown that does not hold the one name somebody needs is the most
 * common dead end in this product: an agent signed up this morning, a customer
 * who called ten minutes ago, an insurer added to the panel last week. The
 * detour — save nothing, navigate to configuration, create the record, come
 * back and retype the form — is why people keep a notebook instead.
 *
 * So the plus sits beside the control, and pressing it expands one row *under*
 * that control. It never navigates, never opens a modal over the work, and
 * never unmounts the form around it, which is the same bargain
 * `<InlineMasterAdd>` struck for master values in FR-02.2 — this is that
 * pattern generalised to every dropdown that names a record.
 *
 * Escape closes the row and stops there rather than bubbling: inside a drawer
 * or a dialog, an Escape meant for the add row must not also throw away the
 * form it was opened from.
 */
export function QuickAdd({
  children,
  label,
  form,
  disabled = false,
  disabledReason,
  className,
}: QuickAddProps) {
  const panelId = `${useId()}-quick-add`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  /**
   * Bumped by every close, and read by the effect that puts focus back on the
   * plus. A counter rather than the ref itself: `close` is handed to the form
   * during render, so it must not touch a ref on the way there.
   */
  const [closes, setCloses] = useState(0)

  useEffect(() => {
    if (closes === 0) return
    triggerRef.current?.focus()
  }, [closes])

  function close() {
    setOpen(false)
    setCloses((count) => count + 1)
  }

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.row}>
        <div className={styles.control}>{children}</div>
        <Button
          ref={triggerRef}
          icon="plus"
          label={label}
          title={disabled && disabledReason ? disabledReason : label}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className={styles.trigger}
          onClick={() => (open ? close() : setOpen(true))}
        />
      </div>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={styles.panel}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            close()
          }}
        >
          <p className={styles.title}>{label}</p>
          {form(close)}
        </div>
      ) : null}
    </div>
  )
}

export type QuickAddFormProps = {
  /** The fields this record needs — the fewest that make it real. */
  children: ReactNode
  /** The store's or repository's own refusal, rendered as written. */
  error?: string | null
  /** Shown instead of the error while the backing list is still being read. */
  note?: ReactNode
  busy?: boolean
  submitLabel?: string
  onCancel: () => void
  onSubmit: () => void
}

/**
 * The inside of a quick-add row: fields, the refusal, and the two buttons.
 *
 * Not a `<form>` element, because every one of these opens inside a form that
 * already exists and nesting the two would submit the outer one. Enter still
 * works, and is intercepted here for the same reason.
 */
export function QuickAddForm({
  children,
  error = null,
  note,
  busy = false,
  submitLabel = 'Add',
  onCancel,
  onSubmit,
}: QuickAddFormProps) {
  return (
    <div
      className={styles.fields}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter') return
        if (event.target instanceof HTMLTextAreaElement) return
        event.preventDefault()
        if (!busy) onSubmit()
      }}
    >
      {children}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : note ? (
        <p className={styles.note}>{note}</p>
      ) : null}
      <div className={styles.actions}>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={onSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
