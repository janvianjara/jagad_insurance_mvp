import { useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
} from 'react'
import styles from './SplitView.module.css'

const STEP = 24

type SplitViewProps = {
  /** Left pane — the list, in every list-plus-detail screen. */
  primary: ReactNode
  /** Right pane — the detail. */
  secondary: ReactNode
  /** Starting width of the primary pane, in pixels. */
  defaultPrimarySize?: number
  primarySize?: number
  onPrimarySizeChange?: (size: number) => void
  minPrimary?: number
  minSecondary?: number
  label?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)))
}

/**
 * Two panes and a draggable divider, for list-plus-detail screens that want
 * both halves visible at once. The divider is a real separator control: drag
 * it, or focus it and use the arrow keys.
 */
export function SplitView({
  primary,
  secondary,
  defaultPrimarySize = 420,
  primarySize,
  onPrimarySizeChange,
  minPrimary = 280,
  minSecondary = 320,
  label = 'Resize panes',
}: SplitViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [ownSize, setOwnSize] = useState(defaultPrimarySize)
  const [dragging, setDragging] = useState(false)

  const size = primarySize ?? ownSize

  function maxPrimary() {
    const total = rootRef.current?.getBoundingClientRect().width ?? 0
    return Math.max(minPrimary, total - minSecondary)
  }

  function apply(next: number) {
    const clamped = clamp(next, minPrimary, maxPrimary())
    setOwnSize(clamped)
    onPrimarySizeChange?.(clamped)
  }

  function startDrag(event: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(true)

    const move = (moveEvent: MouseEvent | TouchEvent) => {
      const clientX =
        'touches' in moveEvent ? (moveEvent.touches[0]?.clientX ?? 0) : moveEvent.clientX
      const left = rootRef.current?.getBoundingClientRect().left ?? 0
      apply(clientX - left)
    }
    const stop = () => {
      setDragging(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', stop)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', stop)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      apply(size - STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      apply(size + STEP)
    } else if (event.key === 'Home') {
      event.preventDefault()
      apply(minPrimary)
    } else if (event.key === 'End') {
      event.preventDefault()
      apply(maxPrimary())
    }
  }

  return (
    <div ref={rootRef} className={styles.root} data-dragging={dragging ? 'true' : undefined}>
      <div className={styles.primary} style={{ flexBasis: `${size}px`, width: `${size}px` }}>
        {primary}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={size}
        aria-valuemin={minPrimary}
        tabIndex={0}
        className={styles.divider}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onDoubleClick={() => apply(defaultPrimarySize)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.secondary}>{secondary}</div>
    </div>
  )
}
