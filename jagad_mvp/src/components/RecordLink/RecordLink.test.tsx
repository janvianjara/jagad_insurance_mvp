import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RecordLink } from './RecordLink'

function renderLink(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('RecordLink', () => {
  it('opens the record it names', () => {
    renderLink(<RecordLink to="/customers/cus-1" label="Rakesh Patel" />)

    const link = screen.getByRole('link', { name: /Rakesh Patel/ })
    expect(link).toHaveAttribute('href', '/customers/cus-1')
  })

  it('carries a reference number beside the name', () => {
    renderLink(<RecordLink to="/policies/pol-1" label="Health Companion" reference="POL-5312" />)

    expect(screen.getByRole('link', { name: /Health Companion/ })).toHaveTextContent('POL-5312')
  })

  /*
   * The three states are the whole point of this component existing once rather
   * than six times. A reference that is still being read and one that resolved
   * to nothing must not render the same thing — that bug shipped on
   * `EndorsementDetailScreen` and was misread as missing data by the reviewer.
   */
  it('says nothing at all while the record is still being read', () => {
    const { container } = renderLink(<RecordLink label={null} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
    expect(container.querySelector('[data-record-link]')).toBeNull()
  })

  it('renders an unresolved reference as plain text, never as a dead link', () => {
    renderLink(<RecordLink label="" absentText="No deal recorded" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No deal recorded')).toBeInTheDocument()
  })

  it('distinguishes loading from absent in the DOM, not only to the eye', () => {
    const loading = renderLink(<RecordLink label={null} />)
    expect(loading.container.querySelector('[data-record-link="absent"]')).toBeNull()
    loading.unmount()

    const absent = renderLink(<RecordLink label="" absentText="Not recorded" />)
    expect(absent.container.querySelector('[data-record-link="absent"]')).not.toBeNull()
  })
})
