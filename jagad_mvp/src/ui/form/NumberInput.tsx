import type { ChangeEvent, ComponentPropsWithRef, ReactNode } from 'react'
import { useControlAria } from './field-context'
import { cx } from './cx'
import base from './controls.module.css'

export type NumberInputProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'value' | 'onChange' | 'prefix'
> & {
  /** Controlled value. `null` renders an empty control — an unknown, not a zero. */
  value?: number | null
  onValueChange?: (value: number | null) => void
  invalid?: boolean
  /** Unit shown inside the control, e.g. "days", "%". */
  unit?: ReactNode
}

/**
 * A plain numeric control — counts, ages, percentages, tenure in years.
 *
 * Deliberately NOT the money control: amounts are integer paise and are typed
 * through `<RecordOnlyAmount>` (P-07), which exists precisely so that no code
 * path can compute into an amount field.
 */
export function NumberInput({
  value,
  onValueChange,
  invalid,
  unit,
  className,
  id,
  disabled,
  required,
  'aria-describedby': describedBy,
  ...rest
}: NumberInputProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })
  const controlled = value !== undefined

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    onValueChange?.(raw === '' ? null : Number(raw))
  }

  return (
    <span
      className={cx(base.control, className)}
      data-invalid={wiring.invalid || undefined}
      data-disabled={wiring.disabled || undefined}
    >
      <input
        type="number"
        inputMode="numeric"
        className={cx(base.input, base.mono, base.alignEnd)}
        value={controlled ? (value ?? '') : undefined}
        onChange={handleChange}
        {...rest}
        {...wiring.props}
      />
      {unit ? <span className={base.affix}>{unit}</span> : null}
    </span>
  )
}
