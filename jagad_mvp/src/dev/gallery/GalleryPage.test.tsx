import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICON_NAMES } from '../../ui/Icon'
import GalleryPage from './GalleryPage'
import { SPACE_STEPS, STATUS_SWATCHES, TYPE_STEPS } from './gallery-data'

describe('design gallery', () => {
  it('names every status token, so the U7 language stays visible', () => {
    render(<GalleryPage />)
    for (const swatch of STATUS_SWATCHES) {
      expect(screen.getAllByText(swatch.token).length).toBeGreaterThan(0)
    }
  })

  it('shows the full type and spacing scales', () => {
    render(<GalleryPage />)
    for (const step of TYPE_STEPS) expect(screen.getByText(step.token)).toBeInTheDocument()
    for (const token of SPACE_STEPS) expect(screen.getByText(token)).toBeInTheDocument()
  })

  it('draws every icon in the sprite', () => {
    const { container } = render(<GalleryPage />)
    for (const name of ICON_NAMES) {
      expect(container.querySelector(`[data-icon="${name}"]`)).not.toBeNull()
    }
  })

  it('puts both densities on screen at once', () => {
    render(<GalleryPage />)
    const comfortable = screen.getByText('Comfortable').closest('[data-density]')
    const compact = screen.getByText('Compact').closest('[data-density]')

    expect(comfortable).toHaveAttribute('data-density', 'comfortable')
    expect(compact).toHaveAttribute('data-density', 'compact')
    expect(within(compact as HTMLElement).getByText('INQ-1036')).toBeInTheDocument()
  })

  it('renders the brand mark in its header', () => {
    render(<GalleryPage />)
    expect(screen.getByLabelText('Jagad Insurance')).toBeInTheDocument()
    expect(screen.getByText('Design gallery')).toBeInTheDocument()
  })
})
