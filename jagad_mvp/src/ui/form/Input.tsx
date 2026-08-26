import type { ComponentPropsWithRef, ReactNode } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'

export type InputProps = Omit<ComponentPropsWithRef<'input'>, 'prefix'> & {
  invalid?: boolean
  /** Icon or unit rendered inside the control, before the value. */
  leading?: ReactNode
  /** Icon or unit rendered inside the control, after the value. */
  trailing?: ReactNode
  /** Mono face with tabular figures — for identifiers and reference numbers. */
  mono?: boolean
}

/**
 * The single-line text control. It reads its id, required flag and description
 * wiring from the surrounding `<Field>`, so a caller never repeats them.
 */
export function Input({
  invalid,
  leading,
  trailing,
  mono,
  className,
  id,
  disabled,
  required,
  'aria-describedby': describedBy,
  ...rest
}: InputProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })

  return (
    <span
      className={cx(base.control, className)}
      data-invalid={wiring.invalid || undefined}
      data-disabled={wiring.disabled || undefined}
    >
      {leading ? <span className={base.affix}>{leading}</span> : null}
      <input type="text" className={cx(base.input, mono && base.mono)} {...rest} {...wiring.props} />
      {trailing ? <span className={base.affix}>{trailing}</span> : null}
    </span>
  )
}
