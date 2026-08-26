import { useId } from 'react'
import type { ReactNode } from 'react'
import { useControlAria, useField } from './field-context'
import { cx } from './cx'
import styles from './Toggle.module.css'

export type ToggleProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  /** Keep the label for screen readers but drop it from the layout. */
  labelHidden?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * An immediate on/off — a setting that applies the moment it is flipped.
 *
 * A switch is not a checkbox: if the change only takes effect when the form is
 * submitted, use `<Checkbox>` instead. Anything that leaves the system on flip
 * belongs behind `<ConfirmGate>`, not behind this.
 */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  labelHidden = false,
  disabled,
  id,
  className,
}: ToggleProps) {
  const generated = useId()
  const field = useField()
  const wiring = useControlAria({ id, disabled })
  const labelId = `${generated}-label`
  const descriptionId = description ? `${generated}-description` : undefined
  const describedBy = [wiring.props['aria-describedby'], descriptionId].filter(Boolean).join(' ')

  return (
    <span className={cx(styles.root, className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={field?.labelId ?? labelId}
        className={styles.switch}
        onClick={() => onCheckedChange(!checked)}
        id={wiring.props.id}
        disabled={wiring.props.disabled}
        aria-describedby={describedBy === '' ? undefined : describedBy}
      />
      <span className={cx(styles.text, labelHidden && styles.labelHidden)}>
        <span id={labelId}>{label}</span>
        {description ? (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </span>
  )
}
