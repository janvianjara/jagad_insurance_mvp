import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TypeGallery from './TypeGallery'

describe('TypeGallery', () => {
  it('renders the data primitives against fixture-shaped records', () => {
    const { container } = render(<TypeGallery />)
    expect(screen.getAllByText('insurer no. awaited').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('12,48,500.00')
  })

  it('shows no full Aadhaar number anywhere on the page', () => {
    const { container } = render(<TypeGallery />)
    expect(container.innerHTML).not.toContain('123412341234')
  })
})
