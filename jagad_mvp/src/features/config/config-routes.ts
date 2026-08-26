/**
 * The configuration screens, code-split — what `src/app/router.tsx` points at.
 *
 * They live here rather than as `lazy()` consts in the router for two reasons.
 * The router exports a route tree rather than components, so defining components
 * in it costs fast refresh (the lint rule says so); and P-10b adds companies,
 * products, benefits, agencies and agents beside these two, which is one line
 * each in this file and one map entry each in the router — no screen has to be
 * edited to add a screen.
 *
 * Configuration is admin-only and rarely opened, so keeping it out of the first
 * paint is worth the dynamic import on its own.
 */

import { lazy } from 'react'

export const ConfigUsersScreen = lazy(() => import('./users/UsersScreen'))
export const ConfigMastersScreen = lazy(() => import('./masters/MastersScreen'))
