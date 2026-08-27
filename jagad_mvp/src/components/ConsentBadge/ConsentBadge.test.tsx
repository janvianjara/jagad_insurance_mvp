import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConsentBadge } from './ConsentBadge'
import { readConsent } from './consent-reading'

const NOW = new Date('2026-08-26T09:30:00.000Z')
const DAY_MS = 86_400_000
const IN_FIVE_DAYS = new Date(NOW.getTime() + 5 * DAY_MS).toISOString()
const LAST_WEEK = new Date(NOW.getTime() - 7 * DAY_MS).toISOString()

describe('ConsentBadge', () => {
  it('reads a live link as needing a person, and counts the days left', () => {
    const reading = readConsent('link_issued', { now: NOW, expiresAt: IN_FIVE_DAYS })
    expect(reading.tone).toBe('attn')
    expect(reading.live).toBe(true)
    expect(reading.note).toContain('5 days left')
  })

  it('reads a link the clock has passed as expired, whatever the record still says', () => {
    // The record is still `link_issued`; the window has closed. The machine's
    // own move to `expired` is a separate act with an event behind it, but a
    // screen must not pretend the link still works.
    const reading = readConsent('link_issued', { now: NOW, expiresAt: LAST_WEEK })
    expect(reading.lapsed).toBe(true)
    expect(reading.label).toBe('Link expired')
    expect(reading.tone).toBe('idle')
  })

  it('reads a submitted link as recorded consent', () => {
    const reading = readConsent('submitted', { now: NOW, expiresAt: LAST_WEEK, submittedAt: LAST_WEEK })
    expect(reading.tone).toBe('ok')
    expect(reading.label).toBe('Consent recorded')
  })

  it('says plainly when no link has gone out, and why it matters', () => {
    const reading = readConsent('not_sent', { now: NOW })
    expect(reading.note).toContain('KYC cannot complete')
  })

  it('renders the pill alone in a table cell and the sentence in a panel', () => {
    const { container, rerender } = render(
      <ConsentBadge state="link_issued" now={NOW} expiresAt={IN_FIVE_DAYS} />,
    )
    expect(screen.getByText('Link sent, awaiting the customer')).toBeInTheDocument()
    expect(container.querySelector('[data-consent-state="link_issued"]')).not.toBeNull()
    expect(screen.queryByText(/carries no session/)).toBeNull()

    rerender(<ConsentBadge state="link_issued" now={NOW} expiresAt={IN_FIVE_DAYS} showNote />)
    expect(screen.getByText(/carries no session/)).toBeInTheDocument()
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
  })
})
