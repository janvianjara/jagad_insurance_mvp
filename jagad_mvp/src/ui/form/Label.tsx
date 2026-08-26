import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Label.module.css'

export type LabelProps = {
  children: ReactNode
  /** Id of the control this label names. Omit for a group label. */
  htmlFor?: string
  id?: string
  required?: boolean
  /** Marks a field the user may leave empty, where that is not obvious. */
  optional?: boolean
  className?: string
}

/**
 * A field's name. Renders a real `<label>` when it points at a control and a
 * plain span when it names a group (radio set, cascade, drop zone), which is
 * wired through `aria-labelledby` instead.
 */
export function Label({ children, htmlFor, id, required, optional, className }: LabelProps) {
  const content = (
    <>
      {children}
      {/* The marker is drawn by CSS, not written into the label: the control
          already carries `required`, and a literal asterisk in the label text
          would end up inside the control's accessible name. */}
      {required ? <span className={styles.required} aria-hidden="true" /> : null}
      {optional && !required ? <span className={styles.optional}>optional</span> : null}
    </>
  )

  if (htmlFor === undefined) {
    return (
      <span className={cx(styles.label, className)} id={id}>
        {content}
      </span>
    )
  }

  return (
    <label className={cx(styles.label, className)} id={id} htmlFor={htmlFor}>
      {content}
    </label>
  )
}
