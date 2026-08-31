/**
 * Sign-in — plan §4's `/login` and `/login/2fa`, §11.1's session-free entry.
 *
 * The barrel deliberately exports the ROUTES and not the screens. Re-exporting a
 * component would give the authenticated side of the app a static handle on it,
 * and the point of §11.1 is that the only way in is the dynamic import in
 * `routes.ts`.
 *
 * `leaveSession` is the exception, and it is not a screen: the rail footer needs
 * a way to drop the session when somebody signs out, and it lives beside the
 * code that creates one so the two cannot drift.
 */
export { SignInRoute, TwoFactorRoute } from './routes'
export { leaveSession } from './auth-desk'
