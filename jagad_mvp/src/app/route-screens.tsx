import { Suspense, lazy } from 'react'
import { Navigate } from 'react-router'
import { landingFor } from './navigation'
import type { RouteSpec } from './route-map'
import { useSessionStore } from './store'

/**
 * The screens the router points at, and only screens — the router itself exports
 * a route tree, and mixing the two in one module breaks fast refresh.
 *
 * Both stubs are lazy. `PlannedScreen` because it is the placeholder behind
 * every unbuilt route and belongs out of the first paint; `StandaloneScreen`
 * because the pages that use it — the tokenised consent and upload links, login,
 * the customer portal — must stay out of the authenticated bundle entirely
 * (§11.1). The dynamic import is what makes that structural rather than
 * aspirational.
 */
const PlannedScreen = lazy(() => import('../components/PlannedScreen/PlannedScreen'))
const StandaloneScreen = lazy(() => import('./standalone/StandaloneScreen'))

export function RoutePending() {
  return <p aria-busy="true">Loading</p>
}

/** Sends `/` at the role's landing view — `/assistant` for everyone who holds it (D-G). */
export function LandingRedirect() {
  const user = useSessionStore((state) => state.user)
  if (!user) return null
  return <Navigate to={landingFor(user)} replace />
}

export function PlannedRoute({ spec }: { spec: RouteSpec }) {
  return <PlannedScreen title={spec.title} step={spec.step} phase={spec.phase} note={spec.note} />
}

export function StandaloneRoute({ spec }: { spec: RouteSpec }) {
  const owner = spec.step
    ? `Built by playbook step ${spec.step}.`
    : `Planned for phase ${spec.phase}.`

  return (
    <Suspense fallback={<RoutePending />}>
      <StandaloneScreen
        title={`${spec.title} is not built yet`}
        explanation={`${spec.note ? `${spec.note} ` : ''}${owner} This page renders outside the app shell and carries no session.`}
        tokenParam={spec.path.includes(':token') ? 'token' : undefined}
      />
    </Suspense>
  )
}

export function NoSuchRoute() {
  return (
    <Suspense fallback={<RoutePending />}>
      <StandaloneScreen
        title="No screen answers to that address"
        explanation="The plan's route map is registered in full, so a path that lands here is not one the product promises. Check the link, or start again from the workspace."
      />
    </Suspense>
  )
}
