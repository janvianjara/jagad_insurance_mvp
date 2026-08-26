/**
 * Toasts — the third slice plan §7's state table asks the shell to own.
 *
 * `<ToastProvider>` in `src/ui/surface` already owns a queue in component state,
 * and two queues would mean two stacks on screen. So the store is the queue, and
 * the shell publishes it through the existing `ToasterContext`: `useToaster()`
 * keeps working everywhere it is already called, and anything outside React —
 * a repository callback, a keyboard handler, a future event-bus subscriber — can
 * reach `notify()` without a component in hand.
 *
 * A toast is a receipt, never a question. Anything that needs an answer is a
 * `<ConfirmGate>`, because a question that can time out is not a question.
 */

import { create } from 'zustand'
import type { ToastInput, ToastRecord } from '../../ui/surface'

const DEFAULT_DURATION = 6000

export type ToastState = {
  readonly toasts: readonly ToastRecord[]
  notify(toast: ToastInput): string
  dismiss(id: string): void
  clear(): void
}

let sequence = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function stopTimer(id: string) {
  const timer = timers.get(id)
  if (timer === undefined) return
  clearTimeout(timer)
  timers.delete(id)
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  notify(toast) {
    sequence += 1
    const id = `toast-${sequence}`
    set({ toasts: [...get().toasts, { ...toast, id }] })

    const duration = toast.duration ?? DEFAULT_DURATION
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), duration),
      )
    }
    return id
  },

  dismiss(id) {
    stopTimer(id)
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
  },

  clear() {
    for (const id of [...timers.keys()]) stopTimer(id)
    set({ toasts: [] })
  },
}))
