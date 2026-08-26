/**
 * The shell drawer — plan §3's right-hand panel, as far as the *shell* owns it.
 *
 * Two drawers exist in this product and confusing them costs URL state. A record
 * drawer belongs to the queue that opened it, so its target lives in that
 * screen's URL (`?record=…`) and `<WorkQueue>` renders it — that is what makes a
 * queue view reconstructible from its address. This store owns the other one:
 * the global panel Cmd/Ctrl-K summons from anywhere, which is not part of any
 * screen's state and must not survive a link being copied.
 *
 * Width and maximise live here rather than inside `<Drawer>` so the panel keeps
 * the size a person dragged it to as they move between screens.
 */

import { create } from 'zustand'
import { DRAWER_DEFAULT_W } from '../../ui/surface'

export const DRAWER_KINDS = {
  /** The Cmd/Ctrl-K assistant panel. P-09 fills it in. */
  assistant: 'assistant',
} as const

export type DrawerKind = (typeof DRAWER_KINDS)[keyof typeof DRAWER_KINDS]

export type DrawerTarget = {
  readonly kind: DrawerKind
  /**
   * The record the person was looking at when they pressed the key. FR-22 wants
   * the assistant to arrive already knowing what is on screen; carrying the
   * route is how it does that without reading anything else.
   */
  readonly contextPath?: string
  readonly contextLabel?: string
}

export type DrawerState = {
  readonly open: boolean
  readonly target: DrawerTarget | null
  readonly width: number
  readonly maximised: boolean

  openDrawer(target: DrawerTarget): void
  closeDrawer(): void
  toggleDrawer(target: DrawerTarget): void
  setWidth(width: number): void
  setMaximised(maximised: boolean): void
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  open: false,
  target: null,
  width: DRAWER_DEFAULT_W,
  maximised: false,

  openDrawer(target) {
    set({ open: true, target })
  },

  closeDrawer() {
    set({ open: false, target: null, maximised: false })
  },

  toggleDrawer(target) {
    const current = get()
    if (current.open && current.target?.kind === target.kind) {
      set({ open: false, target: null, maximised: false })
      return
    }
    set({ open: true, target })
  },

  setWidth(width) {
    set({ width })
  },

  setMaximised(maximised) {
    set({ maximised })
  },
}))
