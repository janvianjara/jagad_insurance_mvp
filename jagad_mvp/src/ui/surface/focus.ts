import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * Focus-trap plumbing shared by Drawer and Modal.
 *
 * Both surfaces make the same two promises: while they are open, Tab cannot
 * walk out of them, and when they close, focus goes back to whatever opened
 * them. Keeping the mechanics here means the two can never drift apart.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Every tabbable descendant of `root`, in document order. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Keeps Tab and Shift-Tab inside `root`. Returns true when the event was
 * handled, so the caller can decide whether to keep processing it.
 */
export function trapTab(event: KeyboardEvent | ReactKeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Tab') return false

  const items = focusableWithin(root)
  if (items.length === 0) {
    event.preventDefault()
    root.focus()
    return true
  }

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement

  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

/** Moves focus to the first tabbable descendant, falling back to the container. */
export function focusFirstWithin(root: HTMLElement) {
  const items = focusableWithin(root)
  if (items.length > 0) items[0].focus()
  else root.focus()
}
