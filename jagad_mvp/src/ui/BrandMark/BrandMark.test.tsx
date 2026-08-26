import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrandMark } from './BrandMark'
import { LOGO_PATH, logoUrl } from './logo'

describe('BrandMark', () => {
  it('names the brand however it renders', () => {
    render(<BrandMark />)
    expect(screen.getByLabelText('Jagad Insurance')).toBeInTheDocument()
  })

  it('renders the optional caps label beside the mark', () => {
    render(<BrandMark label="MVP" />)
    expect(screen.getByText('MVP')).toBeInTheDocument()
  })

  it('falls back to the wordmark and warns with the expected path when the asset is absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    await import('./logo')

    const { container } = render(<BrandMark />)
    const source = container.querySelector('[data-brand-source]')?.getAttribute('data-brand-source')

    if (logoUrl) {
      expect(source).toBe('logo')
      expect(warn).not.toHaveBeenCalled()
    } else {
      expect(source).toBe('wordmark')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(LOGO_PATH))
    }

    warn.mockRestore()
  })
})
