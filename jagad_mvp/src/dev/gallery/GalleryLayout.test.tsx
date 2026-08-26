import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import GalleryLayout from './GalleryLayout'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dev/gallery" element={<GalleryLayout />}>
          <Route index element={<p>tokens page</p>} />
          <Route path="form" element={<p>form page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('gallery layout', () => {
  it('offers a page per primitive group', () => {
    renderAt('/dev/gallery')
    for (const label of ['Tokens', 'Form', 'Type', 'Signal', 'Data', 'Surface']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('carries the brand mark and marks itself dev only', () => {
    renderAt('/dev/gallery')
    expect(screen.getByLabelText('Jagad Insurance')).toBeInTheDocument()
    expect(screen.getByText('dev only')).toBeInTheDocument()
  })

  it('renders the routed group page in its outlet', () => {
    renderAt('/dev/gallery/form')
    expect(screen.getByText('form page')).toBeInTheDocument()
  })

  it('marks only the active group, so Tokens does not stay lit on a sub-page', () => {
    renderAt('/dev/gallery/form')
    const tokens = screen.getByRole('link', { name: 'Tokens' })
    const form = screen.getByRole('link', { name: 'Form' })

    expect(form).toHaveAttribute('aria-current', 'page')
    expect(tokens).not.toHaveAttribute('aria-current')
  })
})
