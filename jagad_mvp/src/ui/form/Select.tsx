import type { ComponentPropsWithRef } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectProps = Omit<ComponentPropsWithRef<'select'>, 'children'> & {
  options: readonly SelectOption[]
  /** Leading empty choice. Present means "not chosen yet", which is information. */
  placeholder?: string
  invalid?: boolean
}

/**
 * The native select, styled. Native because the browser's own popup is already
 * keyboard operable, type-ahead searchable and correct on every platform; a
 * hand-rolled listbox would only be needed if options carried richer content.
 */
export function Select({
  options,
  placeholder,
  invalid,
  className,
  id,
  disabled,
  required,
  'aria-describedby': describedBy,
  ...rest
}: SelectProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })

  return (
    <span className={cx(base.chevronWrap, className)}>
      <select className={cx(base.bare, base.select)} {...rest} {...wiring.props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <span className={base.chevron} aria-hidden="true" />
    </span>
  )
}
