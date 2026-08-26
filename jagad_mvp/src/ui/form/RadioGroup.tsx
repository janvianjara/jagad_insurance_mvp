import type { ChangeEvent, ReactNode } from 'react'
import { useControlAria, useField } from './field-context'
import { cx } from './cx'
import styles from './RadioGroup.module.css'

export type RadioOption = {
  value: string
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

export type RadioGroupProps = {
  /** Shared input name — what makes the browser treat the set as one choice. */
  name: string
  options: readonly RadioOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: 'vertical' | 'horizontal'
  /** Names the group when it is used outside a `<Field control="group">`. */
  label?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

/**
 * One choice from a small, always-visible set. Native radios, so the browser's
 * own roving arrow-key behaviour inside a named group comes for free.
 */
export function RadioGroup({
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  orientation = 'vertical',
  label,
  invalid,
  disabled,
  className,
}: RadioGroupProps) {
  const field = useField()
  const wiring = useControlAria({ invalid, disabled })

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange?.(event.target.value)
  }

  return (
    <div
      className={cx(styles.group, className)}
      role="radiogroup"
      data-orientation={orientation}
      aria-labelledby={label ? undefined : field?.labelId}
      aria-label={label}
      aria-describedby={wiring.props['aria-describedby']}
      aria-invalid={wiring.props['aria-invalid']}
    >
      {options.map((option) => {
        const optionDisabled = wiring.disabled || option.disabled || false
        return (
          <label
            key={option.value}
            className={cx(styles.option, wiring.invalid && styles.invalid)}
            data-disabled={optionDisabled || undefined}
          >
            <input
              type="radio"
              className={styles.native}
              name={name}
              value={option.value}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              disabled={optionDisabled || undefined}
              onChange={handleChange}
            />
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.text}>
              <span>{option.label}</span>
              {option.description ? (
                <span className={styles.description}>{option.description}</span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}
