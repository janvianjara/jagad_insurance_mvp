import { Suspense, lazy } from 'react'
import { RouteError } from './error/RouteError'
import type { ReactElement } from 'react'
import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/AppShell'
import {
  InquiryCaptureRoute,
  InquiryDetailRoute,
  InquiryQueueRoute,
} from '../features/inquiries/routes'
import { AssistantRoute, AssistantThreadRoute } from '../features/assistant/AssistantRoute'
import {
  ConfigAgenciesScreen,
  ConfigAgentsScreen,
  ConfigAutomationScreen,
  ConfigBenefitsScreen,
  ConfigComplianceScreen,
  ConfigCompaniesScreen,
  ConfigFormsScreen,
  ConfigMastersScreen,
  ConfigProductsScreen,
  ConfigHomeScreen,
  ConfigUsersScreen,
} from '../features/config/config-routes'
import { SignInRoute, TwoFactorRoute } from '../features/auth/routes'
import {
  PortalClaimNewRoute,
  PortalClaimsRoute,
  PortalDocumentsRoute,
  PortalOverviewRoute,
  PortalPoliciesRoute,
  PortalShellRoute,
} from '../features/portal/routes'
import { ConsentTokenRoute } from '../features/consent/routes'
import { UploadTokenRoute } from '../features/upload/routes'
import { Customer360Route, CustomerListRoute } from '../features/customers/routes'
import { KycQueueRoute } from '../features/kyc/routes'
import {
  DealQueueRoute,
  DealRoute,
  QuotationComposerRoute,
  QuotationNewRoute,
  QuotationQueueRoute,
} from '../features/quotations/routes'
import {
  PolicyDetailRoute,
  PolicyDraftsRoute,
  PolicyEntryRoute,
  PolicyQueueRoute,
} from '../features/policies/routes'
import {
  CommissionLedgerRoute,
  CommissionPayoutsRoute,
  CommissionRoute,
} from '../features/commission/routes'
import { WalletRoute } from '../features/wallet/routes'
import {
  BackOfficeHomeRoute,
  IssuanceQueueRoute,
  OcrReviewQueueRoute,
} from '../features/backoffice/routes'
import { CollectionQueueRoute } from '../features/collections/routes'
import { ClaimDetailRoute, ClaimIntimationRoute, ClaimQueueRoute } from '../features/claims/routes'
import { DocumentVaultRoute } from '../features/documents/routes'
import { RenewalDetailRoute, RenewalInstalmentsRoute, RenewalPoolRoute } from '../features/renewals/routes'
import { ReportRoute, ReportsRoute } from '../features/reports/routes'
import { TaskQueueRoute } from '../features/tasks/routes'
import {
  EndorsementCaptureRoute,
  EndorsementDetailRoute,
  EndorsementQueueRoute,
} from '../features/endorsements/routes'
import { NoticeBatchRoute, NoticeQueueRoute } from '../features/notices/routes'
import { ConfigTemplatesScreen } from '../features/config/templates/routes'
import { ConfigIntegrationsScreen } from '../features/config/integrations/routes'
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
  '/assistant/:threadId': () => <AssistantThreadRoute />,
  '/inquiries': () => <InquiryQueueRoute />,
  '/inquiries/new': () => <InquiryCaptureRoute />,
  '/inquiries/:id': () => <InquiryDetailRoute />,
  '/config': () => <ConfigHomeScreen />,
  '/config/users': () => <ConfigUsersScreen />,
  '/config/masters': () => <ConfigMastersScreen />,
  '/config/companies': () => <ConfigCompaniesScreen />,
  '/config/products': () => <ConfigProductsScreen />,
  '/config/benefits': () => <ConfigBenefitsScreen />,
  '/config/agencies': () => <ConfigAgenciesScreen />,
  '/config/agents': () => <ConfigAgentsScreen />,
  '/customers': () => <CustomerListRoute />,
  // No /back-office/kyc/:id exists in the section 4 route map, so a KYC row opens
  // the customer it is about, on its KYC tab, beside the household and timeline.
  '/customers/:id': () => <Customer360Route />,
  // A facet of one record is a tab on that record, and the deep path is that
  // tab's address - not a second screen the person has to leave the file for.
  '/customers/:id/consent': () => <Customer360Route />,
  '/back-office/kyc': () => <KycQueueRoute />,
  '/quotations': () => <QuotationQueueRoute />,
  '/quotations/new': () => <QuotationNewRoute />,
  '/quotations/:id': () => <QuotationComposerRoute />,
  '/quotations/:id/v/:version': () => <QuotationComposerRoute />,
  '/deals': () => <DealQueueRoute />,
  '/deals/:id': () => <DealRoute />,
  '/policies': () => <PolicyQueueRoute />,
  '/policies/new': () => <PolicyEntryRoute />,
  '/policies/:id': () => <PolicyDetailRoute />,
  '/policies/:id/versions': () => <PolicyDetailRoute />,
  '/policies/:id/schedule': () => <PolicyDetailRoute />,
  '/back-office/drafts': () => <PolicyDraftsRoute />,
  '/back-office/collections': () => <CollectionQueueRoute />,
  '/back-office/issuance': () => <IssuanceQueueRoute />,
  '/back-office/ocr-review': () => <OcrReviewQueueRoute />,
  '/commission': () => <CommissionRoute />,
  '/commission/ledger': () => <CommissionLedgerRoute />,
  '/commission/payouts': () => <CommissionPayoutsRoute />,
  '/wallet': () => <WalletRoute />,
  '/back-office': () => <BackOfficeHomeRoute />,
  '/tasks': () => <TaskQueueRoute />,
  '/documents': () => <DocumentVaultRoute />,
  '/reports': () => <ReportsRoute />,
  '/reports/:key': () => <ReportRoute />,
  '/claims': () => <ClaimQueueRoute />,
  '/claims/new': () => <ClaimIntimationRoute />,
  '/claims/:id': () => <ClaimDetailRoute />,
  '/renewals': () => <RenewalPoolRoute />,
  '/renewals/instalments': () => <RenewalInstalmentsRoute />,
  '/renewals/:id': () => <RenewalDetailRoute />,
  '/config/forms': () => <ConfigFormsScreen />,
  '/config/automation': () => <ConfigAutomationScreen />,
  '/config/compliance': () => <ConfigComplianceScreen />,
  '/endorsements': () => <EndorsementQueueRoute />,
  '/endorsements/new': () => <EndorsementCaptureRoute />,
  '/endorsements/:id': () => <EndorsementDetailRoute />,
  '/renewals/notices': () => <NoticeQueueRoute />,
  '/renewals/notices/:batchId': () => <NoticeBatchRoute />,
  '/config/templates': () => <ConfigTemplatesScreen />,
  '/config/integrations': () => <ConfigIntegrationsScreen />,
}

/**
 * Screens outside the shell. They carry no session by design (plan section 11.1),
 * so they get their own map and their own Suspense - they render outside the
 * shell's outlet, and must not reach the session store or the app shell at all.
 */
const BUILT_BARE_SCREENS: Readonly<Record<string, () => ReactElement>> = {
  '/login': () => <SignInRoute />,
  '/login/2fa': () => <TwoFactorRoute />,
  '/consent/:token': () => <ConsentTokenRoute />,
  '/upload/:token': () => <UploadTokenRoute />,
}

/**
 * Every §4 path that has a real screen behind it.
 *
 * Exported so a test can assert the set rather than infer it by rendering routes
 * one at a time and looking for the absence of a stub. The portal paths are
 * listed explicitly because they are registered as a nested subtree rather than
 * through either flat map, and a set that quietly omitted them would report five
 * built screens as unbuilt.
 */
export function builtRoutePaths(): readonly string[] {
  return [
    ...Object.keys(BUILT_SCREENS),
    ...Object.keys(BUILT_BARE_SCREENS),
    ...ROUTE_MAP.filter((spec) => spec.layout === 'portal').map((spec) => spec.path),
  ]
}

function guarded(spec: RouteSpec) {
  const build = BUILT_SCREENS[spec.path]
  const screen = build ? build() : <PlannedRoute spec={spec} />
  if (!spec.resource) return screen
  return <RequireAccess resource={spec.resource}>{screen}</RequireAccess>
}

/**
 * The customer portal - plan section 11.1, decision D-I.
 *
 * Nested rather than flat, and that is the whole point. The five portal paths
 * are children of one shell that holds the header, the four links and the
 * footer, so moving between them keeps the shell mounted instead of remounting
 * it per page - which is what makes it feel like the customer's app rather than
 * five pages that happen to look alike.
 *
 * It is registered here, outside the `/` element, because it must never acquire
 * the staff shell, the session store or the permission evaluator. Every element
 * is behind a dynamic import, so that boundary is a chunk the bundler enforces
 * rather than a rule somebody has to remember; `portal-isolation.test.ts` walks
 * the module graph and fails if any of the three ever appears in it.
 */
function portalRoutes(): RouteObject[] {
  return [
    {
      path: '/portal',
      element: (
        <Suspense fallback={<RoutePending />}>
          <PortalShellRoute />
        </Suspense>
      ),
      errorElement: <RouteError />,
      children: [
        { index: true, element: <PortalOverviewRoute /> },
        { path: 'policies', element: <PortalPoliciesRoute /> },
        { path: 'documents', element: <PortalDocumentsRoute /> },
        { path: 'claims', element: <PortalClaimsRoute /> },
        { path: 'claims/new', element: <PortalClaimNewRoute /> },
      ],
    },
  ]
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
      // A screen that throws renders the boundary INSIDE the shell outlet, so a
      // failure costs the person that screen and not their navigation.
      errorElement: <RouteError />,
      children: [
        { index: true, element: <LandingRedirect /> },
        ...ROUTE_MAP.filter((spec) => spec.layout === 'app').map((spec) => ({
          path: spec.path,
          element: guarded(spec),
          errorElement: <RouteError />,
        })),
      ],
    },
    ...ROUTE_MAP.filter((spec) => spec.layout === 'bare').map((spec) => ({
      path: spec.path,
      element: BUILT_BARE_SCREENS[spec.path] ? (
        <Suspense fallback={<RoutePending />}>{BUILT_BARE_SCREENS[spec.path]()}</Suspense>
      ) : (
        <StandaloneRoute spec={spec} />
      ),
      errorElement: <RouteError />,
    })),
    ...portalRoutes(),
    ...galleryRoutes(),
    { path: '*', element: <NoSuchRoute /> },
  ]
}

export const router = createBrowserRouter(createAppRoutes())
