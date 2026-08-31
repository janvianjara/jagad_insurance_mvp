import { lazy } from 'react'

/**
 * The tokenised upload page's route element — and the seam that makes §11.1
 * structural.
 *
 * `lazy` here is not a performance choice. The plan says `/upload/:token`
 * "must not import the app shell, the permission store, or anything assuming a
 * user", and a dynamic import is what turns that from a rule somebody has to
 * remember into a chunk boundary the bundler enforces: the router holds a
 * promise, not the module, so nothing on the authenticated side of the app pulls
 * the upload page in and nothing the upload page imports is pulled into the
 * authenticated bundle.
 *
 * `upload-isolation.test.ts` walks the module graph from the screen and fails if
 * the shell, the session store or the permission evaluator ever appears in it.
 */
export const UploadTokenRoute = lazy(() => import('./UploadTokenScreen'))
