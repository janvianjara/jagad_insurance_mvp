import { lazy } from 'react'

/**
 * `/config/integrations`, code-split — a folder and one `lazy` line, so no
 * existing file has to be edited to add a configuration screen.
 */
export const ConfigIntegrationsScreen = lazy(() => import('./IntegrationsScreen'))
