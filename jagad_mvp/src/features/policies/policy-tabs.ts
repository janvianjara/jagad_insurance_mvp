/**
 * The policy file's three faces, and the address each one answers to.
 *
 * `/policies/:id/versions` and `/policies/:id/schedule` are not screens of their
 * own. They are facets of ONE record, and the house rule for a facet is that it
 * is a tab inside the record's own page whose deep route is that tab's
 * addressable URL. A person reading a policy moves between what it is, what it
 * has been, and what it owes without ever leaving the record — and every one of
 * those three positions is a link they can send somebody.
 *
 * The tab is therefore read off the path rather than held in state. Landing cold
 * on `/policies/pol-4402/schedule` opens the schedule on the first paint: there
 * is no effect that corrects the tab afterwards, so there is no frame in which
 * the overview is showing.
 *
 * No React here on purpose — this is the whole of the routing rule, and it is
 * asserted without mounting anything.
 */

export const POLICY_TABS = {
  overview: 'overview',
  versions: 'versions',
  schedule: 'schedule',
} as const

export type PolicyTab = (typeof POLICY_TABS)[keyof typeof POLICY_TABS]

export const POLICY_TAB_LABEL: Readonly<Record<PolicyTab, string>> = {
  overview: 'Overview',
  versions: 'Versions',
  schedule: 'Premium schedule',
}

/**
 * Which tab an address is asking for.
 *
 * Anything that is not one of the two deep segments is the record itself, which
 * keeps `/policies/:id` on the tab it has always opened on. An unknown segment
 * is deliberately not an error: the router decides what addresses exist, and a
 * screen that threw on one would turn a routing mistake into a blank page.
 */
export function policyTabFromPath(pathname: string): PolicyTab {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  if (last === POLICY_TABS.versions) return POLICY_TABS.versions
  if (last === POLICY_TABS.schedule) return POLICY_TABS.schedule
  return POLICY_TABS.overview
}

/** The address for one tab of one policy. The tab strip navigates to these. */
export function policyTabHref(policyId: string, tab: PolicyTab): string {
  return tab === POLICY_TABS.overview ? `/policies/${policyId}` : `/policies/${policyId}/${tab}`
}
