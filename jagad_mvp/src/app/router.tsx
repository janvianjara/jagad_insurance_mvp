import { Suspense, lazy } from 'react'
import type { ReactElement } from 'react'
import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/AppShell'
import {
  InquiryCaptureRoute,
  InquiryDetailRoute,
  InquiryQueueRoute,
} from '../features/inquiries/routes'
import { AssistantRoute } from '../features/assistant/AssistantRoute'
import { ConfigMastersScreen, ConfigUsersScreen } from '../features/config/config-routes'
import { RequireAccess } from './RequireAccess'
import { ROUTE_MAP } from './route-map'
import type { RouteSpec } from './route-map'
import {
  LandingRedirect,
  NoSuchRoute,
  PlannedRoute,
  RoutePending,
  StandaloneRoute,
} from './route-screens'

/**
 * The router — every route in plan §4, registered (plan §3, §4).
 *
 * Nothing here decides what a screen looks like. It decides three things and
 * only three: which shell a path renders inside, which permission guards it, and
 * — for everything no step has built yet — that it resolves to a stub naming the
 * step that will. Navigation is therefore complete on day one, and a link to a
 * screen nobody has built lands somewhere honest instead of on a blank page.
 *
 * Two boundaries are structural rather than conventional:
 *
 *   The tokenised pages (`/consent/:token`, `/upload/:token`), login and the
 *   customer portal are registered OUTSIDE the shell layout. They carry no
 *   session by design (§11.1), and being outside is what stops them acquiring
 *   one: the shell, the session store and the permission evaluator all sit on
 *   the other side of a dynamic import.
 *
 *   The dev gallery is guarded by `import.meta.env.DEV`, a literal at build
 *   time — in a production build the branch collapses and the gallery chunks are
 *   never emitted.
 */

const DEV = import.meta.env.DEV

const GalleryLayout = DEV ? lazy(() => import('../dev/gallery/GalleryLayout')) : null
const GalleryPage = DEV ? lazy(() => import('../dev/gallery/GalleryPage')) : null
const FormGallery = DEV ? lazy(() => import('../ui/form/gallery/FormGallery')) : null
const TypeGallery = DEV ? lazy(() => import('../ui/type/gallery/TypeGallery')) : null
const SignalGallery = DEV ? lazy(() => import('../ui/signal/gallery/SignalGallery')) : null
const DataGallery = DEV ? lazy(() => import('../ui/data/gallery/DataGallery')) : null
const SurfaceGallery = DEV ? lazy(() => import('../ui/surface/gallery/SurfaceGallery')) : null

const BUILT_SCREENS: Readonly<Record<string, () => ReactElement>> = {
  '/assistant': () => <AssistantRoute />,
  '/inquiries': () => <InquiryQueueRoute />,
  '/inquiries/new': () => <InquiryCaptureRoute />,
  '/inquiries/:id': () => <InquiryDetailRoute />,
  '/config/users': () => <ConfigUsersScreen />,
  '/config/masters': () => <ConfigMastersScreen />,
}

function guarded(spec: RouteSpec) {
  const build = BUILT_SCREENS[spec.path]
  const screen = build ? build() : <PlannedRoute spec={spec} />
  if (!spec.resource) return screen
  return <RequireAccess resource={spec.resource}>{screen}</RequireAccess>
}

function galleryRoutes(): RouteObject[] {
  if (
    !GalleryLayout ||
    !GalleryPage ||
    !FormGallery ||
    !TypeGallery ||
    !SignalGallery ||
    !DataGallery ||
    !SurfaceGallery
  ) {
    return []
  }

  return [
    {
      path: '/dev/gallery',
      element: (
        <Suspense fallback={<RoutePending />}>
          <GalleryLayout />
        </Suspense>
      ),
      children: [
        { index: true, element: <GalleryPage /> },
        { path: 'form', element: <FormGallery /> },
        { path: 'type', element: <TypeGallery /> },
        { path: 'signal', element: <SignalGallery /> },
        { path: 'data', element: <DataGallery /> },
        { path: 'surface', element: <SurfaceGallery /> },
      ],
    },
  ]
}

/**
 * Builds the whole route tree. Exported as a function so a test can hand it to
 * `createMemoryRouter` and walk the map without a browser history.
 */
export function createAppRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <LandingRedirect /> },
        ...ROUTE_MAP.filter((spec) => spec.layout === 'app').map((spec) => ({
          path: spec.path,
          element: guarded(spec),
        })),
      ],
    },
    ...ROUTE_MAP.filter((spec) => spec.layout !== 'app').map((spec) => ({
      path: spec.path,
      element: <StandaloneRoute spec={spec} />,
    })),
    ...galleryRoutes(),
    { path: '*', element: <NoSuchRoute /> },
  ]
}

export const router = createBrowserRouter(createAppRoutes())
