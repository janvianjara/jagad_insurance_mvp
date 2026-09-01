import { useEffect, useId, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  TouchEvent as ReactTouchEvent,
} from 'react'
import { Glyph } from './Glyph'
import { focusFirstWithin, trapTab } from './focus'
import {
  DRAWER_DEFAULT_W,
  DRAWER_MIN_W,
  DRAWER_STEP,
  clampDrawerWidth,
  drawerMaxWidth,
  drawerWidthFromPointer,
} from './drawer-width'
import styles from './Drawer.module.css'

type DrawerProps = {
  open: boolean
  /** Called when the drawer asks to be dismissed. The parent owns `open`. */
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Extra controls in the header, placed before the maximise and close buttons. */
  headerActions?: ReactNode
  footer?: ReactNode
  /** Controlled width. Leave unset to let the drawer remember its own. */
  width?: number
  onWidthChange?: (width: number) => void
  /** Controlled maximise state. Leave unset to let the drawer remember its own. */
  maximised?: boolean
  onMaximisedChange?: (maximised: boolean) => void
  /**
   * How the drawer opens when it is remembering its own state — full-bleed for a
   * panel that is a workspace rather than a record, like the schema builder.
   * Ignored while `maximised` is supplied, and never sticky: closing still resets
   * to false, and the toggle in the header still wins.
   */
  defaultMaximised?: boolean
  /**
   * Where focus goes on close. Defaults to whatever had focus when the drawer
   * opened, which is the trigger in every normal flow.
   */
  returnFocusTo?: RefObject<HTMLElement | null>
}

/**
 * The record / document drawer from §3, ported from the prototype's proven
 * behaviour rather than re-invented:
 *
 * - drag the left edge to resize between 340 and 560px; double-click resets
 * - a maximise toggle takes it full-bleed
 * - Escape un-maximises first, and only closes on the second press
 * - focus is trapped while it is open and returns to the trigger on close
 *
 * The Escape ordering is the part worth guarding: someone reading a document
 * full screen presses Escape to get back to the queue, not to lose the record.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  footer,
  width,
  onWidthChange,
  maximised,
  onMaximisedChange,
  defaultMaximised = false,
  returnFocusTo,
}: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [ownWidth, setOwnWidth] = useState(DRAWER_DEFAULT_W)
  const [ownMaximised, setOwnMaximised] = useState(defaultMaximised)
  const [resizing, setResizing] = useState(false)
  const titleId = useId()

  const currentWidth = width ?? ownWidth
  const isMaximised = maximised ?? ownMaximised

  function applyWidth(next: number) {
    setOwnWidth(next)
    onWidthChange?.(next)
  }

  function applyMaximised(next: boolean) {
    setOwnMaximised(next)
    onMaximisedChange?.(next)
  }

  function close() {
    setOwnMaximised(false)
    onMaximisedChange?.(false)
    onClose()
  }

  // Escape: un-maximise first, close second. Bound on the document so it works
  // even when focus has wandered out of the panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isMaximised) {
        setOwnMaximised(false)
        onMaximisedChange?.(false)
        return
      }
      setOwnMaximised(false)
      onMaximisedChange?.(false)
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, isMaximised, onClose, onMaximisedChange])

  // Focus enters on open and goes back to the trigger on close.
  useEffect(() => {
    if (!open) return
    restoreRef.current = returnFocusTo?.current ?? (document.activeElement as HTMLElement | null)
    const panel = panelRef.current
    if (panel) focusFirstWithin(panel)
    return () => {
      const target = restoreRef.current
      restoreRef.current = null
      if (target && target.isConnected) target.focus()
    }
  }, [open, returnFocusTo])

  // A drawer wider than the viewport can accommodate is pulled back in.
  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const max = drawerMaxWidth(window.innerWidth)
      setOwnWidth((previous) => (previous > max ? max : previous))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  function startResize(event: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) {
    if (isMaximised) return
    event.preventDefault()
    setResizing(true)

    const move = (moveEvent: MouseEvent | TouchEvent) => {
      const clientX =
        'touches' in moveEvent ? (moveEvent.touches[0]?.clientX ?? 0) : moveEvent.clientX
      applyWidth(drawerWidthFromPointer(clientX, window.innerWidth))
    }
    const stop = () => {
      setResizing(false)
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

  function onGripKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const viewport = window.innerWidth
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      applyWidth(clampDrawerWidth(currentWidth + DRAWER_STEP, viewport))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      applyWidth(clampDrawerWidth(currentWidth - DRAWER_STEP, viewport))
    } else if (event.key === 'Home') {
      event.preventDefault()
      applyWidth(clampDrawerWidth(DRAWER_MIN_W, viewport))
    } else if (event.key === 'End') {
      event.preventDefault()
      applyWidth(drawerMaxWidth(viewport))
    }
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const panel = panelRef.current
    if (panel) trapTab(event, panel)
  }

  if (!open) return null

  return (
    <>
      {resizing ? <div className={styles.dragShield} data-testid="drawer-drag-shield" /> : null}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={isMaximised ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        data-maximised={isMaximised ? 'true' : undefined}
        data-resizing={resizing ? 'true' : undefined}
        className={styles.drawer}
        style={
          isMaximised
            ? undefined
            : { width: `${currentWidth}px`, flexBasis: `${currentWidth}px` }
        }
        onKeyDown={onPanelKeyDown}
      >
        {isMaximised ? null : (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drawer width"
            aria-valuenow={currentWidth}
            aria-valuemin={DRAWER_MIN_W}
            aria-valuemax={drawerMaxWidth(typeof window === 'undefined' ? 0 : window.innerWidth)}
            tabIndex={0}
            title="Drag to resize. Arrow keys adjust, double-click resets."
            className={styles.grip}
            onMouseDown={startResize}
            onTouchStart={startResize}
            onDoubleClick={() => applyWidth(clampDrawerWidth(DRAWER_DEFAULT_W, window.innerWidth))}
            onKeyDown={onGripKeyDown}
          />
        )}

        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <div className={styles.headActions}>
            {headerActions}
            <button
              type="button"
              className={styles.iconButton}
              aria-pressed={isMaximised}
              title={isMaximised ? 'Exit full screen' : 'Full screen'}
              onClick={() => applyMaximised(!isMaximised)}
            >
              <Glyph kind={isMaximised ? 'restore' : 'maximise'} />
              <span className={styles.srOnly}>
                {isMaximised ? 'Exit full screen' : 'Full screen'}
              </span>
            </button>
            <button type="button" className={styles.iconButton} title="Close" onClick={close}>
              <Glyph kind="close" />
              <span className={styles.srOnly}>Close drawer</span>
            </button>
          </div>
        </header>

        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </aside>
    </>
  )
}
