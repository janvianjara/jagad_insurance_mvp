/**
 * The tokenised consent page — plan §4's `/consent/:token`, §11.1's login-free
 * customer surface, §9's second route to a complete KYC.
 *
 * The barrel deliberately exports the ROUTE and not the screen. Re-exporting the
 * component would give the authenticated side of the app a static handle on it,
 * and the whole point of §11.1 is that the only way in is the dynamic import in
 * `routes.ts`.
 */
export { ConsentTokenRoute } from './routes'
