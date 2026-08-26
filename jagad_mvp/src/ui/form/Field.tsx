import { useId } from 'react'
import type { ReactNode } from 'react'
import { FieldContext } from './field-context'
import type { FieldContextValue } from './field-context'
import { FieldError } from './FieldError'
import { Label } from './Label'
import { cx } from './cx'
import styles from './Field.module.css'

export type FieldProps = {
  label: ReactNode
  children: ReactNode
  /** Supply when the control needs a stable id from outside, e.g. a schema field key. */
  id?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  optional?: boolean
  disabled?: boolean
  /**
   * `group` for controls made of several inputs — RadioGroup, CascadeSelect,
   * FileDrop. Their label is a span wired by `aria-labelledby`, because a
   * `<label for>` can only point at one control and a group has many.
   */
  control?: 'input' | 'group'
  className?: string
}

/**
 * Label, control, hint and error as one unit.
 *
 * The field owns the ids and pushes them down through context, so no control in
 * this group can end up unlabelled or with an error message the screen reader
 * never announces.
 */
export function Field({
  label,
  children,
  id,
  hint,
  error,
  required = false,
  optional = false,
  disabled = false,
  control = 'input',
  className,
}: FieldProps) {
  const generated = useId()
  const controlId = id ?? `${generated}-control`
  const labelId = `${generated}-label`
  const hintId = hint ? `${generated}-hint` : undefined
  const hasError = Boolean(error)
  const errorId = hasError ? `${generated}-error` : undefined

  const value: FieldContextValue = {
    controlId,
    labelId,
    hintId,
    errorId,
    invalid: hasError,
    required,
    disabled,
  }

  return (
    <FieldContext value={value}>
      <div className={cx(styles.field, className)} data-disabled={disabled || undefined}>
        <Label
          id={labelId}
          htmlFor={control === 'input' ? controlId : undefined}
          required={required}
          optional={optional}
        >
          {label}
        </Label>
        <div className={styles.control}>{children}</div>
        {hint ? (
          <p className={styles.hint} id={hintId}>
            {hint}
          </p>
        ) : null}
        <FieldError id={errorId}>{error}</FieldError>
      </div>
    </FieldContext>
  )
}
