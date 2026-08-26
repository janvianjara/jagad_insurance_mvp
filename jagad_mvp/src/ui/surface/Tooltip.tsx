import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import styles from './Tooltip.module.css'

const PLACEMENT_CLASS = {
  top: styles.top,
  bottom: styles.bottom,
} as const

export type TooltipPlacement = keyof typeof PLACEMENT_CLASS

type TooltipProps = {
  /** Short. A tooltip that needs a sentence is a hint on the field instead. */
  label: string
  children: ReactNode
  placement?: TooltipPlacement
}

/**
 * A hover and focus hint. It is always supplementary: nothing a person must
 * read to act correctly is allowed to live only in a tooltip, because touch and
 * screen-reader users may never surface it.
 */
export function Tooltip({ label, children, placement = 'top' }: TooltipProps) {
  const [shown, setShown] = useState(false)
  const tipId = useId()

  return (
    <span
      className={styles.root}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setShown(false)
      }}
    >
      <span aria-describedby={tipId} className={styles.anchor}>
        {children}
      </span>
      <span
        id={tipId}
        role="tooltip"
        hidden={!shown}
        className={[styles.tip, PLACEMENT_CLASS[placement]].join(' ')}
      >
        {label}
      </span>
    </span>
  )
}
