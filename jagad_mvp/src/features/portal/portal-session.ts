/**
 * Who the portal is looking at — the portal's own session concept, and the
 * whole of it.
 *
 * There is no customer authentication in this MVP and this module does not
 * pretend there is. It does the one thing the five customer screens actually
 * need: it names the customer whose records are being read, and it keeps that
 * name somewhere every screen can agree on.
 *
 * That somewhere is the URL. Three reasons, in order of weight:
 *
 *   1. The portal is registered outside the app shell (plan §11.1, decision
 *      D-I), so it may not touch `useSessionStore`. A module-level singleton of
 *      its own would be the same mistake one layer down — state a screen can
 *      read but a person cannot see.
 *   2. Every read in `portal-desk.ts` is scoped by this value. A scope held in a
 *      variable is invisible; a scope held in the address bar is legible, and a
 *      demo can be pointed at a second customer by editing one word.
 *   3. It survives a remount. Whether the orchestrator wires the five routes
 *      under one shell element or as five siblings, the identity is where it
 *      was, so the pages cannot disagree about who is reading them.
 *
 * It is a demo identity and the shell says so on screen, once, quietly. Nothing
 * here is an authorisation check, and nothing in this feature treats it as one:
 * it selects a scope, and the scope is what the desk filters on.
 */

import { useSearchParams } from 'react-router'

/** The one search parameter the portal owns. */
export const PORTAL_IDENTITY_PARAM = 'as'

/** The portal's four addresses, in the order the navigation shows them. */
export const PORTAL_NAV = [
  { path: '/portal', label: 'Overview', icon: 'grid' },
  { path: '/portal/policies', label: 'Policies', icon: 'shield' },
  { path: '/portal/documents', label: 'Documents', icon: 'folder' },
  { path: '/portal/claims', label: 'Claims', icon: 'inbox' },
] as const

export const PORTAL_CLAIM_NEW_PATH = '/portal/claims/new'

/**
 * A portal address carrying the viewing customer.
 *
 * Every internal link goes through this. A link that dropped the parameter would
 * land the person on the picker again, which is exactly the bug a nav built out
 * of bare `<Link to="/portal/policies">` would have.
 */
export function portalHref(path: string, customerId: string | null): string {
  if (!customerId) return path
  return `${path}?${PORTAL_IDENTITY_PARAM}=${encodeURIComponent(customerId)}`
}

export type PortalIdentity = {
  /** The customer whose records this page may read. `null` before one is chosen. */
  readonly customerId: string | null
  choose(customerId: string): void
  forget(): void
}

export function usePortalIdentity(): PortalIdentity {
  const [params, setParams] = useSearchParams()
  const raw = params.get(PORTAL_IDENTITY_PARAM)
  const customerId = raw !== null && raw.trim() !== '' ? raw.trim() : null

  return {
    customerId,
    choose(next: string) {
      const updated = new URLSearchParams(params)
      updated.set(PORTAL_IDENTITY_PARAM, next)
      setParams(updated)
    },
    forget() {
      const updated = new URLSearchParams(params)
      updated.delete(PORTAL_IDENTITY_PARAM)
      setParams(updated)
    },
  }
}
