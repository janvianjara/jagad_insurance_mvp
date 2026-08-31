import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../domain/events'
import { RecordTimeline } from './RecordTimeline'
import { buildTimeline, fallbackReading, readingFor } from './timeline-entry'

/**
 * Charter U14: who did what, when — on every record.
 *
 * The timeline is a rendering of the event log rather than a second history, so
 * the tests below are about that property: every event produces a line, an event
 * nobody has written wording for still produces one, and the order is the order
 * a person reads a record in.
 */

/*
 * `id` is required on a `DomainEvent` now that one event can name another as its
 * cause. These are fixtures rather than emissions, so they are numbered here in
 * the same ordinal shape the bus uses rather than left blank.
 */
let issued = 0

function event(name: DomainEvent['name'], at: string, actorId?: string): DomainEvent {
  issued += 1
  return {
    id: `evt-${String(issued).padStart(6, '0')}`,
    name,
    at,
    ...(actorId === undefined ? {} : { actorId }),
  }
}

const LOG: readonly DomainEvent[] = [
  event('consent.link_issued', '2026-08-24T09:00:00.000Z', 'usr-priya-desai'),
  event('kyc.completed', '2026-08-26T09:30:00.000Z', 'customer:cus-rakesh-patel'),
  event('credentials.generated', '2026-08-26T09:30:00.000Z'),
]

const NAMES: Record<string, string> = {
  'usr-priya-desai': 'Priya Desai',
  'customer:cus-rakesh-patel': 'Rakesh Patel (customer)',
}

const options = { actorName: (id: string | undefined) => (id ? (NAMES[id] ?? id) : 'System') }

describe('RecordTimeline', () => {
  it('renders one line per event, with who did it and when', () => {
    render(<RecordTimeline events={LOG} options={options} label="Timeline" />)

    const list = screen.getByRole('list', { name: 'Timeline' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('Consent link sent')).toBeInTheDocument()
    expect(within(list).getByText('Priya Desai')).toBeInTheDocument()
    expect(within(list).getByText('Rakesh Patel (customer)')).toBeInTheDocument()
    expect(within(list).getByText('System')).toBeInTheDocument()
  })

  it('reads newest first, and keeps the arrival order inside one instant', () => {
    const entries = buildTimeline(LOG, options)
    expect(entries.map((entry) => entry.eventName)).toEqual([
      // The credentials recipe fires on the same edge as the completion, so the
      // two share a timestamp — and the completion has to stay above it.
      'credentials.generated',
      'kyc.completed',
      'consent.link_issued',
    ])

    expect(buildTimeline(LOG, { ...options, order: 'oldest' })[0].eventName).toBe(
      'consent.link_issued',
    )
  })

  it('gives an event nobody has worded a dated line anyway, rather than dropping it', () => {
    // A silent event is the drop §9 spends its length preventing, so a module
    // that starts emitting something new shows up here the same day.
    expect(fallbackReading('policy.documents_collected').title).toBe('Policy — documents collected')
    expect(readingFor('policy.issued').title).toBe('Policy issued')

    render(
      <RecordTimeline
        events={[event('policy.documents_collected', '2026-08-26T09:30:00.000Z')]}
        options={options}
      />,
    )
    expect(screen.getByText('Policy — documents collected')).toBeInTheDocument()
  })

  it('renders the detail prose the caller supplies, and only that', () => {
    render(
      <RecordTimeline
        events={[{ ...event('kyc.completed', '2026-08-26T09:30:00.000Z'), detail: { route: 'consent_link' } }]}
        options={{ ...options, detailOf: (entry) => `route: ${String(entry.detail?.route)}` }}
      />,
    )
    expect(screen.getByText('route: consent_link')).toBeInTheDocument()
  })

  it('teaches an empty record rather than showing an empty box (U13)', () => {
    render(<RecordTimeline events={[]} options={options} />)
    expect(screen.getByText(/Every action taken on it from here appears in this list/)).toBeInTheDocument()
  })
})
