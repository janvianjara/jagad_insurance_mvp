/**
 * The wallet module's public surface - FR-14.5's sub-agent statement.
 *
 * The screen is reached through `routes.ts`, which is the only file the router
 * touches. What is exported here is the statement derivation, because the
 * isolation rule it encodes - a person sees the lines they are the payee of, and
 * no others on the same policy - is the kind of rule that must have exactly one
 * implementation.
 */
export { WalletRoute } from './routes'
export { myLines, myPayouts, periodFromUrl, walletStatement } from './wallet-view'
export type { WalletPeriod, WalletStatement } from './wallet-view'
