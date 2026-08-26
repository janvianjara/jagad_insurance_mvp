import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MaskedValue } from './MaskedValue'
import { maskValue } from './mask'

/** A full twelve-digit Aadhaar. Nothing in this file may render it. */
const FULL_AADHAAR = '234512349012'

describe('MaskedValue', () => {
  it('never lets a full Aadhaar number reach the DOM', () => {
    const { container } = render(<MaskedValue value={FULL_AADHAAR} kind="aadhaar" />)

    // Text, markup and every attribute value: the number must appear in none of them.
    expect(container.textContent).not.toContain(FULL_AADHAAR)
    expect(container.innerHTML).not.toContain(FULL_AADHAAR)
    expect(container.innerHTML.replace(/\D/g, '')).not.toContain(FULL_AADHAAR)
  })

  it('shows the last four characters and no more', () => {
    const { container } = render(<MaskedValue value={FULL_AADHAAR} kind="aadhaar" />)
    expect((container.textContent ?? '').replace(/\D/g, '')).toBe('9012')
  })

  it('cannot be asked for more than four, whatever the caller passes', () => {
    const { container } = render(<MaskedValue value={FULL_AADHAAR} kind="aadhaar" visible={12} />)
    expect((container.textContent ?? '').replace(/\D/g, '')).toBe('9012')
    expect(container.innerHTML).not.toContain(FULL_AADHAAR)
  })

  it('has no prop that reveals the value', () => {
    // The guard is the type, but the runtime shape is asserted too: passing an
    // unknown flag must change nothing about what is rendered.
    const props = { value: FULL_AADHAAR, kind: 'aadhaar', reveal: true } as never
    const { container } = render(<MaskedValue {...(props as object)} value={FULL_AADHAAR} />)
    expect(container.innerHTML).not.toContain(FULL_AADHAAR)
  })

  it('renders absence as absence rather than as an empty mask', () => {
    render(<MaskedValue value={null} kind="aadhaar" absentText="not on record" />)
    expect(screen.getByText('not on record')).toBeInTheDocument()
  })

  it('masks the other identifier kinds by the same rule', () => {
    expect(maskValue('ABCDE1234F', 'pan').endsWith('234F')).toBe(true)
    expect(maskValue('50100234567890', 'account')).not.toContain('50100')
    expect(maskValue('9825012345', 'phone')).not.toContain('98250')
    expect(maskValue('1234 5678 9012', 'aadhaar').replace(/\D/g, '')).toBe('9012')
  })
})
