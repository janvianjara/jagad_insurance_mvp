/**
 * The three session-lifetime slices (plan §7). Feature drafts get their own
 * slice per feature and do not belong here.
 */
export { DENSITIES, activeAccount, resolveAccount, useSessionStore } from './session'
export type { Density, SessionAccount, SessionState } from './session'
export { DRAWER_KINDS, useDrawerStore } from './drawer'
export type { DrawerKind, DrawerState, DrawerTarget } from './drawer'
export { useToastStore } from './toasts'
export type { ToastState } from './toasts'
