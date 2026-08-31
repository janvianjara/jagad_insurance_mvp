import { useLocation } from 'react-router'

/**
 * Test scaffolding, and the only way to assert a redirect without the shell.
 *
 * The sign-in tests mount the two bare routes and nothing else, so a successful
 * sign-in navigates to a route that does not exist in the harness. This stands
 * in for all of them and prints where the router ended up. It lives in a file of
 * its own because the harness beside it exports functions, and a module that
 * mixes the two loses fast refresh.
 */
export function LandingProbe() {
  const location = useLocation()
  return <p data-landing={location.pathname}>Landed on {location.pathname}</p>
}
