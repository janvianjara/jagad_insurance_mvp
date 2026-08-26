import type { SVGProps } from 'react'
import type { IconName } from './icon-names'
import styles from './Icon.module.css'

const SIZE_CLASS = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl,
} as const

export type IconSize = keyof typeof SIZE_CLASS

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: IconName
  size?: IconSize
  /** Give a label when the icon carries meaning on its own; omit when text sits beside it. */
  label?: string
}

/**
 * Draws one symbol from the sprite. Geometry is stroked with `currentColor`, so
 * an icon takes the ink or status colour of whatever contains it.
 */
export function Icon({ name, size = 'md', label, className, ...rest }: IconProps) {
  const classes = [styles.icon, SIZE_CLASS[size], className].filter(Boolean).join(' ')

  return (
    <svg
      className={classes}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-icon={name}
      {...rest}
    >
      <use href={`#i-${name}`} />
    </svg>
  )
}
