import { lazy } from 'react'

/**
 * The router's handle on the landing screen.
 *
 * It is a file of its own for two reasons. The screen is lazy, so the feature —
 * the block renderer, the Ask cards, the threshold rules — stays out of the
 * router's chunk and arrives with the route. And the router exports a route
 * tree rather than components, so a `lazy()` binding declared there would break
 * fast refresh; the rule is enforced across this codebase and this is the shape
 * that satisfies it.
 *
 * The shell already wraps `<Outlet>` in `<Suspense>`, so nothing here needs one.
 */
const AssistantScreen = lazy(() => import('./AssistantScreen'))

export function AssistantRoute() {
  return <AssistantScreen />
}
