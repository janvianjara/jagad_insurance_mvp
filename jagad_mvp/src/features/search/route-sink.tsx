import { useLocation } from 'react-router'

/**
 * Reports the current route into the DOM so a test can assert where a
 * navigation actually went.
 *
 * Its own file because the lint rule wants a module to export components or
 * values, not both, and the harness beside it exports helpers.
 */
export function RouteSink() {
  const location = useLocation()
  return <output data-testid="route">{`${location.pathname}${location.search}`}</output>
}
