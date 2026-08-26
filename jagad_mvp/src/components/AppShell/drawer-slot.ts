import { createContext, useContext } from 'react'

/**
 * The shell's right-hand column, offered to whatever screen is mounted.
 *
 * §3 puts the record drawer beside the main column, not inside it, and the
 * screen that owns a record is several levels below the shell. So the shell
 * publishes the node and a screen portals into it. Nothing is stored: the
 * drawer's target still lives in that screen's URL, which is what keeps a queue
 * with a record open linkable.
 *
 * A screen rendered without a shell — a test, the gallery — gets null and
 * renders its drawer inline, which is correct rather than a fallback.
 */
export const DrawerSlotContext = createContext<HTMLElement | null>(null)

export function useDrawerSlot(): HTMLElement | null {
  return useContext(DrawerSlotContext)
}
