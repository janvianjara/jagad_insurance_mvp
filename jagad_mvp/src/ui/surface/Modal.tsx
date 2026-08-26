import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import { Glyph } from './Glyph'
import { focusFirstWithin, trapTab } from './focus'
import styles from './Modal.module.css'

const SIZE_CLASS = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
} as const

export type ModalSize = keyof typeof SIZE_CLASS

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Action row. Put the confirming action last, the way the rest of the product does. */
  footer?: ReactNode
  size?: ModalSize
  /**
   * Dismissing by clicking the scrim is convenient but lossy. Any modal that
   * holds unsaved input should set this false and make the person choose.
   */
  dismissOnScrimClick?: boolean
  returnFocusTo?: RefObject<HTMLElement | null>
}

/**
 * A blocking dialog: focus is trapped, Escape closes, focus returns to the
 * trigger. Used for decisions that must not be lost behind other work; anything
 * that is merely *more detail* belongs in the Drawer instead.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnScrimClick = true,
  returnFocusTo,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

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

  if (!open) return null

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current
    if (panel) trapTab(event, panel)
  }

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (dismissOnScrimClick && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={[styles.panel, SIZE_CLASS[size]].join(' ')}
        onKeyDown={onPanelKeyDown}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            <Glyph kind="close" />
            <span className={styles.srOnly}>Close</span>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
