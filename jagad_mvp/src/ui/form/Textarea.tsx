import type { ComponentPropsWithRef } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'

export type TextareaProps = ComponentPropsWithRef<'textarea'> & {
  invalid?: boolean
}

/** Multi-line free text: remarks, rejection reasons, call notes. */
export function Textarea({
  invalid,
  className,
  id,
  disabled,
  required,
  rows = 3,
  'aria-describedby': describedBy,
  ...rest
}: TextareaProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })

  return (
    <textarea
      rows={rows}
      className={cx(base.bare, base.textarea, className)}
      {...rest}
      {...wiring.props}
    />
  )
}
