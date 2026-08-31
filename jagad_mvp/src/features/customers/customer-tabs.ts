/**
 * The Customer 360's tabs, and the address each one answers to.
 *
 * The 360 has always kept its open tab in the URL (§7, "URL owns list state"), as
 * `?tab=`. `/customers/:id/consent` is the one facet the route map gives a path
 * of its own, because a per-customer consent ledger is a compliance surface a
 * client asks for by name and a regulator is shown by link. So the tab is read
 * from either place: the path wins where it names a tab, and the query string
 * answers for the rest.
 *
 * That is one mechanism with two spellings rather than two mechanisms. Every tab
 * has exactly one canonical address, `customerTabHref` is the only thing that
 * builds one, and the strip navigates to whatever it returns — so giving another
 * facet a path of its own later is an edit to this file and to no screen.
 *
 * No React here: this is the whole of the addressing rule, testable without
 * mounting anything.
 */

export const CUSTOMER_TABS = {
  household: 'household',
  policies: 'policies',
  documents: 'documents',
  transactions: 'transactions',
  requests: 'requests',
  kyc: 'kyc',
  consent: 'consent',
  timeline: 'timeline',
} as const

export type CustomerTab = (typeof CUSTOMER_TABS)[keyof typeof CUSTOMER_TABS]

const TAB_KEYS: readonly string[] = Object.values(CUSTOMER_TABS)

/** Facets with an addressable path segment of their own, per the §4 route map. */
const PATH_TABS: readonly CustomerTab[] = [CUSTOMER_TABS.consent]

/** A tab name, or the tab the 360 opens on when the value names nothing. */
export function readCustomerTab(value: string | null): CustomerTab {
  return TAB_KEYS.includes(value ?? '') ? ((value ?? '') as CustomerTab) : CUSTOMER_TABS.household
}

/**
 * Which tab an address is asking for.
 *
 * The path is read first, so landing cold on `/customers/:id/consent` opens the
 * consent ledger on the first paint rather than opening the household and
 * correcting itself.
 */
export function customerTabFromLocation(pathname: string, search: string): CustomerTab {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const fromPath = PATH_TABS.find((tab) => tab === last)
  if (fromPath) return fromPath
  return readCustomerTab(new URLSearchParams(search).get('tab'))
}

/** The one canonical address for one tab of one customer. */
export function customerTabHref(customerId: string, tab: CustomerTab): string {
  if (PATH_TABS.includes(tab)) return `/customers/${customerId}/${tab}`
  if (tab === CUSTOMER_TABS.household) return `/customers/${customerId}`
  return `/customers/${customerId}?tab=${tab}`
}
