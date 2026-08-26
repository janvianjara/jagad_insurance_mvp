import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FormGallery from './FormGallery'

describe('FormGallery', () => {
  it('renders every form primitive without a console-level failure', () => {
    render(<FormGallery />)
    expect(screen.getByLabelText('Customer name')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /renewal reminders/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
  })
})
