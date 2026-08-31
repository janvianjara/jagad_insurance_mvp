import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useSessionBoot } from '../../app/boot'
import { DRAWER_KINDS, useDrawerStore, useSessionStore, useToastStore } from '../../app/store'
import { Skeleton } from '../../ui/data'
import { Drawer, ToasterContext, Toaster } from '../../ui/surface'
import { AssistantPanel } from '../../features/assistant'
import { GlobalSearch } from '../../features/search'
import { DrawerSlotContext } from './drawer-slot'
import { SideRail } from './SideRail'
import styles from './AppShell.module.css'

/**
 * The authenticated shell — rail, main column, right drawer (plan §3).
 *
 * Four things live here and nowhere else, because each of them is true of every
 * screen rather than of any one:
 *
 *   - the session is hydrated once, at boot, and every guard waits on it;
 *   - `data-density` is written to `<html>`, so one attribute changes row height
 *     across the whole product without a second stylesheet;
 *   - Cmd/Ctrl-K summons the Assistant drawer from anywhere, carrying the route
 *     the person was on as context (FR-22.10), and the panel inside it is the
 *     Assistant feature's, reading the same projection the landing view does;
 *   - Cmd/Ctrl-/ opens the search palette, which is the other half of that pair:
 *     Cmd-K is for a question, Cmd-/ is for a record. It lives at the shell for
 *     the same reason the Assistant does - "find me the Patel policy" is asked
 *     from wherever the person already is, not from a search page they navigate
 *     to first;
 *   - the toast stack is mounted once and published through the existing
 *     `ToasterContext`, so `useToaster()` works at any depth.
 *
 * The drawer itself is P-06b's, unchanged. The shell supplies the target and the
 * remembered width; the panel supplies the resize, the maximise and the Escape
 * ordering that were already built and tested.
 */
export function AppShell() {
  const location = useLocation()
  const [drawerSlot, setDrawerSlot] = useState<HTMLElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const { ready, error } = useSessionBoot()

  const user = useSessionStore((state) => state.user)
  const density = useSessionStore((state) => state.density)

  const drawerOpen = useDrawerStore((state) => state.open)
  const drawerTarget = useDrawerStore((state) => state.target)
  const drawerWidth = useDrawerStore((state) => state.width)
  const drawerMaximised = useDrawerStore((state) => state.maximised)
  const setWidth = useDrawerStore((state) => state.setWidth)
  const setMaximised = useDrawerStore((state) => state.setMaximised)
  const closeDrawer = useDrawerStore((state) => state.closeDrawer)
  const toggleDrawer = useDrawerStore((state) => state.toggleDrawer)

  const toasts = useToastStore((state) => state.toasts)
  const notify = useToastStore((state) => state.notify)
  const dismiss = useToastStore((state) => state.dismiss)
  const clear = useToastStore((state) => state.clear)

  // Density is a document-level attribute so the tokens in `[data-density]`
  // reach every surface, including portalled modals and toasts.
  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        toggleDrawer({ kind: DRAWER_KINDS.assistant, contextPath: location.pathname })
        return
      }
      if (key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleDrawer, location.pathname])

  if (error) {
    return (
      <div className={styles.boot} role="alert">
        <h1>The session could not be loaded</h1>
        <p>{error.message}</p>
      </div>
    )
  }

  if (!ready || !user) {
    return (
      <div className={styles.boot} aria-busy="true">
        <p className={styles.bootLabel}>Loading the workspace</p>
        <Skeleton width="18ch" />
      </div>
    )
  }

  return (
    <ToasterContext value={{ notify, dismiss, clear }}>
      <DrawerSlotContext value={drawerSlot}>
        <div className={styles.shell} data-shell="app">
          <SideRail user={user} onOpenSearch={() => setSearchOpen(true)} />

          <main className={styles.main}>
            <Suspense
              fallback={
                <div className={styles.pending} aria-busy="true">
                  <Skeleton width="24ch" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>

          <div className={styles.drawers}>
            {drawerOpen && drawerTarget ? (
              <Drawer
                open
                onClose={closeDrawer}
                title="Assistant"
                subtitle="Cmd or Ctrl + K"
                width={drawerWidth}
                onWidthChange={setWidth}
                maximised={drawerMaximised}
                onMaximisedChange={setMaximised}
              >
                <AssistantPanel
                  contextPath={drawerTarget.contextPath}
                  contextLabel={drawerTarget.contextLabel}
                />
              </Drawer>
            ) : null}
            <div ref={setDrawerSlot} className={styles.slot} />
          </div>
        </div>
        {/* Mounted only while open, so each opening starts on an empty field
            rather than on the last question asked. */}
        {searchOpen ? <GlobalSearch onClose={() => setSearchOpen(false)} user={user} /> : null}
        <Toaster toasts={[...toasts]} onDismiss={dismiss} />
      </DrawerSlotContext>
    </ToasterContext>
  )
}
