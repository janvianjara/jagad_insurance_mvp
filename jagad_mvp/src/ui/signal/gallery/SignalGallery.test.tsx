import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SignalGallery from './SignalGallery'

describe('SignalGallery', () => {
  it('renders the status vocabulary and an assembled queue row', () => {
    render(<SignalGallery />)
    expect(screen.getByText('Escalated')).toBeInTheDocument()
    expect(screen.getAllByText('breached by 6 hours').length).toBeGreaterThan(0)
  })
})
