import type { ComponentPropsWithRef } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'

export type DatePickerProps = Omit<ComponentPropsWithRef<'input'>, 'type' | 'prefix'> & {
  invalid?: boolean
  /** Include a time part — for intimation timestamps and call logs. */
  withTime?: boolean
}

/**
 * A date control on the native date input.
 *
 * The value is an ISO date string (`yyyy-MM-dd`, or `yyyy-MM-ddTHH:mm` with
 * time), which is what react-hook-form and the repositories already carry.
 * Native keeps the platform's own calendar, its keyboard handling and its
 * locale-correct segment order rather than reimplementing all three.
 */
export function DatePicker({
  invalid,
  withTime,
  className,
  id,
  disabled,
  required,
  'aria-describedby': describedBy,
  ...rest
}: DatePickerProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })

  return (
    <span
      className={cx(base.control, className)}
      data-invalid={wiring.invalid || undefined}
      data-disabled={wiring.disabled || undefined}
    >
      <input
        type={withTime ? 'datetime-local' : 'date'}
        className={cx(base.input, base.mono)}
        {...rest}
        {...wiring.props}
      />
    </span>
  )
}
