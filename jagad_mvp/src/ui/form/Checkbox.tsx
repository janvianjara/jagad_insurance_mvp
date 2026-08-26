import { useEffect, useRef } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Icon } from '../Icon'
import { useControlAria } from './field-context'
import { cx } from './cx'
import styles from './Checkbox.module.css'

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  label: ReactNode
  description?: ReactNode
  /** Some but not all of the set — the bulk-selection header state. */
  indeterminate?: boolean
  invalid?: boolean
}

/**
 * A single boolean. The native input stays in the tab order and in the
 * accessibility tree; only its default painting is replaced.
 */
export function Checkbox({
  label,
  description,
  indeterminate = false,
  invalid,
  className,
  id,
  disabled,
  required,
  ref,
  'aria-describedby': describedBy,
  ...rest
}: CheckboxProps) {
  const wiring = useControlAria({ id, describedBy, invalid, required, disabled })
  const innerRef = useRef<HTMLInputElement | null>(null)

  // `indeterminate` has no HTML attribute — it exists only as a DOM property.
  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate
  }, [indeterminate])

  function attachRef(node: HTMLInputElement | null) {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  return (
    <label
      className={cx(styles.root, wiring.invalid && styles.invalid, className)}
      data-disabled={wiring.disabled || undefined}
    >
      <input type="checkbox" className={styles.native} ref={attachRef} {...rest} {...wiring.props} />
      <span className={styles.box} aria-hidden="true">
        <Icon name="check" size="sm" className={styles.tick} />
        <span className={styles.dash} />
      </span>
      <span className={styles.text}>
        <span>{label}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
    </label>
  )
}
