import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MaskedField } from './MaskedField'

/**
 * The constitution's Aadhaar rule, as a component test.
 *
 * `<MaskedValue>` already guarantees that a full string handed to it renders as
 * its last four characters. What `<MaskedField>` has to guarantee is the other
 * direction: the platform holds four digits, and four digits rendered bare read
 * like a whole number rather than the tail of one. So it pads — and, because a
 * caller reaching it with more than four has already gone wrong somewhere
 * upstream, it slices before it builds a node.
 */

const FULL = '432112344102'

function everything(container: HTMLElement): string {
  const pieces: string[] = [container.textContent ?? '']
  for (const element of Array.from(container.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) pieces.push(attribute.value)
  }
  return pieces.join('\n')
}

describe('MaskedField', () => {
  it('renders four digits as the tail of an Aadhaar, not as a value of its own', () => {
    render(<MaskedField label="Aadhaar" last4="4102" />)
    expect(screen.getByText('•••• •••• 4102')).toBeInTheDocument()
  })

  it('slices a full number handed to it by mistake — there is no branch that prints one', () => {
    const { container } = render(<MaskedField label="Aadhaar" last4={FULL} />)

    expect(screen.getByText('•••• •••• 4102')).toBeInTheDocument()
    expect(everything(container)).not.toContain(FULL)
    expect(everything(container)).not.toContain('43211234')
  })

  it('slices a spaced or hyphenated read the same way', () => {
    for (const value of ['4321 1234 4102', '4321-1234-4102']) {
      const { container, unmount } = render(<MaskedField label="Aadhaar" last4={value} />)
      expect(everything(container)).not.toContain('4321')
      expect(screen.getByText('•••• •••• 4102')).toBeInTheDocument()
      unmount()
    }
  })

  it('masks a full identifier it is allowed to be given — a PAN, an account', () => {
    const { container } = render(<MaskedField label="PAN" value="ABCPP1234K" kind="pan" />)
    expect(screen.getByText('••••••234K')).toBeInTheDocument()
    expect(everything(container)).not.toContain('ABCPP')
  })

  it('says a value is absent rather than rendering an empty space', () => {
    render(<MaskedField label="Aadhaar" last4={null} absentText="none on file" />)
    expect(screen.getByText('none on file')).toBeInTheDocument()
  })

  it('carries the label and the note a person needs to read it', () => {
    render(<MaskedField label="Aadhaar" last4="4102" note="Last four digits only." />)
    expect(screen.getByText('Aadhaar')).toBeInTheDocument()
    expect(screen.getByText('Last four digits only.')).toBeInTheDocument()
  })
})
