/**
 * Drawer sizing rules, §3: "DRAWER 340-560px resizable".
 *
 * Pure arithmetic so the clamp can be reasoned about (and tested) without a
 * DOM. The prototype additionally refused to squeeze the main column below a
 * usable width; that rule is kept here as MIN_MAIN_W, because a drawer that
 * eats the queue it was opened from is worse than a narrow drawer.
 */
export const DRAWER_MIN_W = 340
export const DRAWER_MAX_W = 560
export const DRAWER_DEFAULT_W = 440

/** The main column never gets squeezed below this by a drawer drag. */
const MIN_MAIN_W = 420

/** Keyboard resize step on the drag separator. */
export const DRAWER_STEP = 16

/** The widest the drawer may be right now, given how much room the viewport has. */
export function drawerMaxWidth(viewportWidth: number): number {
  return Math.min(DRAWER_MAX_W, Math.max(DRAWER_MIN_W, viewportWidth - MIN_MAIN_W))
}

/** Pins a requested width into the allowed band. */
export function clampDrawerWidth(requested: number, viewportWidth: number): number {
  const max = drawerMaxWidth(viewportWidth)
  return Math.round(Math.min(max, Math.max(DRAWER_MIN_W, requested)))
}

/**
 * Width implied by a pointer sitting at `clientX`. The drawer is anchored to the
 * right edge, so the pointer position measures the drawer, not the main column.
 */
export function drawerWidthFromPointer(clientX: number, viewportWidth: number): number {
  return clampDrawerWidth(viewportWidth - clientX, viewportWidth)
}
