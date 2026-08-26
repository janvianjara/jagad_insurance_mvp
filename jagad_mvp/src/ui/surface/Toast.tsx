import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import type { IconName } from '../Icon'
import { Glyph } from './Glyph'
import { ToasterContext } from './toast-context'
import type { ToastInput, ToastRecord } from './toast-context'
import type { Tone } from '../tone'
import styles from './Toast.module.css'

const TONE_ICON: Record<Tone, IconName> = {
  ok: 'check',
  warn: 'clock',
  bad: 'alert',
  info: 'msg',
  idle: 'lock',
  attn: 'spark',
}

const DEFAULT_DURATION = 6000

let nextToastId = 0

type ToastProps = {
  toast: ToastRecord
  onDismiss: (id: string) => void
}

/**
 * One receipt. Toasts confirm what already happened; they never ask a question,
 * because a question that can time out is not a question.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const tone = toast.tone ?? 'info'

  return (
    <div className={styles.toast} data-tone={tone}>
      <Icon name={TONE_ICON[tone]} size="md" className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.detail ? <p className={styles.detail}>{toast.detail}</p> : null}
      </div>
      {toast.action ? (
        <button type="button" className={styles.action} onClick={toast.action.onAction}>
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" className={styles.dismiss} onClick={() => onDismiss(toast.id)}>
        <Glyph kind="close" />
        <span className={styles.srOnly}>Dismiss</span>
      </button>
    </div>
  )
}

/** The stack itself. Rendered by `ToastProvider`; exported for the gallery. */
export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className={styles.stack} role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

/**
 * Owns the toast queue and publishes `useToaster()` to everything beneath it.
 * Mount once, at the shell.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  function dismiss(id: string) {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function notify(input: ToastInput) {
    nextToastId += 1
    const id = `toast-${nextToastId}`
    setToasts((current) => [...current, { ...input, id }])

    const duration = input.duration ?? DEFAULT_DURATION
    if (duration > 0) {
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    }
    return id
  }

  function clear() {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
    setToasts([])
  }

  return (
    <ToasterContext value={{ notify, dismiss, clear }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToasterContext>
  )
}
