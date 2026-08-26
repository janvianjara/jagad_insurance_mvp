import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { IconSprite } from './ui/Icon'

/**
 * The dev gallery is the reference for the design system and the primitive
 * library, not a product surface. `import.meta.env.DEV` is a literal at build
 * time, so in a production build these collapse to `null` and the dynamic
 * imports are dropped entirely.
 *
 * The real route map (plan §4) arrives with the app shell in P-08; this router
 * holds the ground until then.
 */
const DEV = import.meta.env.DEV

const GalleryLayout = DEV ? lazy(() => import('./dev/gallery/GalleryLayout')) : null
const GalleryPage = DEV ? lazy(() => import('./dev/gallery/GalleryPage')) : null
const FormGallery = DEV ? lazy(() => import('./ui/form/gallery/FormGallery')) : null
const TypeGallery = DEV ? lazy(() => import('./ui/type/gallery/TypeGallery')) : null
const SignalGallery = DEV ? lazy(() => import('./ui/signal/gallery/SignalGallery')) : null
const DataGallery = DEV ? lazy(() => import('./ui/data/gallery/DataGallery')) : null
const SurfaceGallery = DEV ? lazy(() => import('./ui/surface/gallery/SurfaceGallery')) : null

export default function App() {
  return (
    <BrowserRouter>
      <IconSprite />
      <Routes>
        <Route path="/" element={<h1>Jagad Insurance — MVP</h1>} />
        {GalleryLayout && GalleryPage && FormGallery && TypeGallery && SignalGallery && DataGallery && SurfaceGallery ? (
          <Route
            path="/dev/gallery"
            element={
              <Suspense fallback={<p>Loading gallery</p>}>
                <GalleryLayout />
              </Suspense>
            }
          >
            <Route index element={<GalleryPage />} />
            <Route path="form" element={<FormGallery />} />
            <Route path="type" element={<TypeGallery />} />
            <Route path="signal" element={<SignalGallery />} />
            <Route path="data" element={<DataGallery />} />
            <Route path="surface" element={<SurfaceGallery />} />
          </Route>
        ) : null}
      </Routes>
    </BrowserRouter>
  )
}
