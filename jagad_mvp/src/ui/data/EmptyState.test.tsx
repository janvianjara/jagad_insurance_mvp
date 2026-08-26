import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('teaches: it names what is missing, says why, and offers the next move', () => {
    render(
      <EmptyState
        title="No renewals due this week"
        explanation="Policies appear here 45 days before expiry. The next batch of 12 arrives on Monday."
        action={<button type="button">Open the renewal pool</button>}
        secondaryAction={<button type="button">Clear filters</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No renewals due this week' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Policies appear here 45 days before expiry. The next batch of 12 arrives on Monday.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open the renewal pool' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('never renders bare without an explanation, because the explanation is required', () => {
    render(<EmptyState title="Nothing here" explanation="Because nothing has been recorded yet." />)
    expect(screen.getByText('Because nothing has been recorded yet.')).toBeInTheDocument()
  })

  it('carries an error variant for the third list state', () => {
    const { container } = render(
      <EmptyState
        variant="error"
        title="Could not load the queue"
        explanation="The request failed before any records came back. Retrying does not lose anything."
        action={<button type="button">Try again</button>}
      />,
    )
    expect(container.querySelector('[data-variant="error"]')).not.toBeNull()
  })
})
