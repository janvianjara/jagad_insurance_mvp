import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref } from 'react'
import { trapTab } from './focus'
import styles from './Popover.module.css'

const PLACEMENT_CLASS = {
  'bottom-start': styles.bottomStart,
  'bottom-end': styles.bottomEnd,
  'top-start': styles.topStart,
  'top-end': styles.topEnd,
} as const

export type PopoverPlacement = keyof typeof PLACEMENT_CLASS

/** Props the popover needs on whatever element opens it. Spread them, do not filter. */
export type PopoverTriggerProps = {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-expanded': boolean
  'aria-haspopup': 'dialog'
  'aria-controls': string | undefined
}

type PopoverProps = {
  /** Accessible name for the floating panel. */
  label: string
  trigger: (props: PopoverTriggerProps) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  placement?: PopoverPlacement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * A small panel anchored to its trigger — column pickers, filter menus, quick
 * detail. Escape and an outside click both close it, and focus goes back to the
 * trigger, so it can never strand the keyboard.
 *
 * Positioning is CSS-anchored to the trigger rather than measured, which is
 * enough for the sizes this product uses and keeps the primitive dependency
 * free.
 */
export function Popover({
  label,
  trigger,
  children,
  placement = 'bottom-start',
  open,
  onOpenChange,
  className,
}: PopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const [refocusToken, setRefocusToken] = useState(0)

  const isOpen = open ?? ownOpen

  function setOpen(next: boolean) {
    setOwnOpen(next)
    onOpenChange?.(next)
  }

  /**
   * Closes and hands focus back to the trigger. The refocus runs from an effect
   * rather than inline so nothing reads a ref during render.
   */
  function close() {
    setOpen(false)
    setRefocusToken((token) => token + 1)
  }

  useEffect(() => {
    if (refocusToken === 0) return
    triggerRef.current?.focus()
  }, [refocusToken])

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) {
        setOwnOpen(false)
        onOpenChange?.(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOwnOpen(false)
      onOpenChange?.(false)
      setRefocusToken((token) => token + 1)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onOpenChange])

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current
    if (panel) trapTab(event, panel)
  }

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen(!isOpen),
        'aria-expanded': isOpen,
        'aria-haspopup': 'dialog',
        'aria-controls': isOpen ? panelId : undefined,
      })}
      {isOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className={[styles.panel, PLACEMENT_CLASS[placement]].join(' ')}
          onKeyDown={onPanelKeyDown}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  )
}
