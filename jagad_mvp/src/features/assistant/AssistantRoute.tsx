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

/**
 * The resumed conversation, `/assistant/:threadId`.
 *
 * A second lazy binding in the same file rather than a second file: the two
 * screens share the whole feature chunk — the conversation, the block renderer,
 * the cards — so splitting them buys nothing and the router wants both bindings
 * from one import.
 */
const AssistantThreadScreen = lazy(() => import('./AssistantThreadScreen'))

export function AssistantRoute() {
  return <AssistantScreen />
}

export function AssistantThreadRoute() {
  return <AssistantThreadScreen />
}
