import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import styles from './Button.module.css'

/**
 * Three variants, and only three. The colour language (plan §2) leaves no room
 * for a fourth: navy is the action colour, so `primary` is navy and every screen
 * has at most one; `quiet` is the same button with the fill taken away, for the
 * secondary and tertiary actions that sit beside it; `danger` is the red that
 * U7 reserves for destructive and irreversible moves.
 *
 * There is deliberately no green button. Green is brand and positive *status*,
 * never an action — a green Confirm would teach people that green means "press
 * me", and the status pills would stop reading.
 */
const VARIANT_CLASS = {
  primary: styles.primary,
  quiet: styles.quiet,
  danger: styles.danger,
} as const

export type ButtonVariant = keyof typeof VARIANT_CLASS

/** Heights come off `--control-h`, so a button lines up with an input and both shrink under compact density. */
const SIZE_CLASS = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
} as const

export type ButtonSize = keyof typeof SIZE_CLASS

export type ButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  children?: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  /** Mark before the label. On an icon-only button this is the whole button. */
  icon?: IconName
  /** Mark after the label — a chevron on a menu trigger, an arrow on a next step. */
  iconEnd?: IconName
  /**
   * Required when there is no visible label, and ignored otherwise: an icon-only
   * button with no accessible name is invisible to a screen reader.
   */
  label?: string
  fullWidth?: boolean
}

/**
 * The button.
 *
 * Plan §6's primitive tables list every control this product needs except this
 * one, which is why twenty-one files ended up hand-rolling `<button>` with their
 * own padding and their own idea of what navy means. One implementation, so the
 * action colour, the focus ring and the disabled state are decided once.
 *
 * `type` defaults to `button`. A button inside a form that submits it by
 * accident is the single most common cause of an unintended write, and this
 * product's whole posture is that nothing writes without being asked.
 */
export function Button({
  children,
  variant = 'quiet',
  size = 'md',
  icon,
  iconEnd,
  label,
  fullWidth,
  className,
  type = 'button',
  'aria-label': ariaLabel,
  ...rest
}: ButtonProps) {
  const iconOnly = children === undefined || children === null || children === false
  const classes = [
    styles.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    iconOnly ? styles.iconOnly : null,
    fullWidth ? styles.fullWidth : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} aria-label={ariaLabel ?? (iconOnly ? label : undefined)} {...rest}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 'md' : 'sm'} className={styles.icon} /> : null}
      {iconOnly ? null : <span className={styles.label}>{children}</span>}
      {iconEnd ? (
        <Icon name={iconEnd} size={size === 'lg' ? 'md' : 'sm'} className={styles.icon} />
      ) : null}
    </button>
  )
}
