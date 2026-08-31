import { lazy } from 'react'

/**
 * `/config/templates`, code-split.
 *
 * It lives in the module's own folder rather than in the shared
 * `config-routes.ts` for the reason that file gives for existing at all: a
 * screen is a folder and one `lazy` line, and no existing file has to be edited
 * to add one.
 */
export const ConfigTemplatesScreen = lazy(() => import('./TemplatesScreen'))
