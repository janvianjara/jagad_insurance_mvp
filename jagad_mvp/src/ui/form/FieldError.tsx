import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { cx } from './cx'
import styles from './FieldError.module.css'

export type FieldErrorProps = {
  children?: ReactNode
  id?: string
  className?: string
}

/**
 * The one message that says why a field cannot be accepted. Renders nothing at
 * all when there is no error, so the layout does not reserve a blank line and
 * then jump when the message arrives.
 */
export function FieldError({ children, id, className }: FieldErrorProps) {
  if (children === undefined || children === null || children === false || children === '') {
    return null
  }

  return (
    <p className={cx(styles.error, className)} id={id} role="alert">
      <Icon name="alert" size="sm" className={styles.icon} />
      <span>{children}</span>
    </p>
  )
}
