import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { IconSprite } from './ui/Icon'

/**
 * The dev gallery is the reference for the §2 token system, not a product
 * surface. `import.meta.env.DEV` is a literal at build time, so in a production
 * build this collapses to `null` and the dynamic import is dropped entirely.
 *
 * The real route map (plan §4) arrives with the app shell in P-08; this router
 * holds the ground until then.
 */
const GalleryPage = import.meta.env.DEV ? lazy(() => import('./dev/gallery/GalleryPage')) : null

export default function App() {
  return (
    <BrowserRouter>
      <IconSprite />
      <Routes>
        <Route path="/" element={<h1>Jagad Insurance — MVP</h1>} />
        {GalleryPage ? (
          <Route
            path="/dev/gallery"
            element={
              <Suspense fallback={<p>Loading gallery</p>}>
                <GalleryPage />
              </Suspense>
            }
          />
        ) : null}
      </Routes>
    </BrowserRouter>
  )
}
