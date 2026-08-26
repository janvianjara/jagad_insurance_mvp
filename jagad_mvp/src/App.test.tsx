import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

/**
 * One assertion, on the only thing this file is responsible for: the adapter,
 * the sprite and the router are wired together, and the app comes up on a role's
 * landing view. What that view contains is the shell's test, not this one.
 */
describe('App', () => {
  it('boots into the shell and lands on the Assistant', async () => {
    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Assistant' })).toBeInTheDocument()
  })
})
