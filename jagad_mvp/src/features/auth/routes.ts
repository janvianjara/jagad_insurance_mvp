import { lazy } from 'react'

/**
 * The two sign-in route elements — and the seam that makes §11.1 structural.
 *
 * `lazy` here is not a performance choice. `/login` and `/login/2fa` are
 * registered outside the app shell and carry no session at mount, and a dynamic
 * import is what turns that from a rule somebody has to remember into a chunk
 * boundary the bundler enforces: the router holds a promise, not the module.
 *
 * The session store, the permission evaluator and the navigation model are one
 * further dynamic import away, in `auth-desk.ts`, reached only once a person has
 * actually signed in. `auth-isolation.test.ts` walks both screens' static import
 * graphs and fails if any of them appears.
 */
export const SignInRoute = lazy(() => import('./SignInScreen'))
export const TwoFactorRoute = lazy(() => import('./TwoFactorScreen'))
