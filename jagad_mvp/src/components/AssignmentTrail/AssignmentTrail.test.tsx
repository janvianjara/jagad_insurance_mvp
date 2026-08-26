import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AssignmentTrail } from './AssignmentTrail'
import type { TrailEntry } from './trail-entry'

/**
 * The trail's three promises, tested as promises rather than as markup: every
 * entry appears, a closed hold says how long it lasted, and an escalation shows
 * the whole history it carried.
 */

const NOW = new Date('2026-08-26T09:30:00.000Z')

const ENTRIES: readonly TrailEntry[] = [
  { id: 'created', kind: 'created', title: 'Inquiry captured', at: '2026-08-26T04:30:00.000Z', until: '2026-08-26T04:30:00.000Z' },
  {
    id: 'hold-0',
    kind: 'assigned',
    title: 'Assigned by routing',
    at: '2026-08-26T04:30:00.000Z',
    until: '2026-08-26T07:00:00.000Z',
    actorName: 'Kiran Solanki',
    detail: 'TAT elapsed without confirmation',
  },
  {
    id: 'hold-1',
    kind: 'reassigned',
    title: 'Auto-reassigned to the next person in the category',
    at: '2026-08-26T07:00:00.000Z',
    until: null,
    actorName: 'Nita Shah',
    tatMinutes: 60,
  },
]

describe('<AssignmentTrail>', () => {
  it('renders one line per event, in the order it was given', () => {
    render(<AssignmentTrail entries={ENTRIES} now={NOW} />)

    const lines = [...screen.getByRole('list', { name: 'Assignment trail' }).children]
    expect(lines).toHaveLength(3)
    expect(lines.map((line) => line.getAttribute('data-kind'))).toEqual([
      'created',
      'assigned',
      'reassigned',
    ])
  })

  it('says how long every hold lasted, and runs the open one against its allowance', () => {
    render(<AssignmentTrail entries={ENTRIES} now={NOW} />)

    // Each line carries how long that step took; the closed ones are measured to
    // their release, the open one to the injected `now`.
    const lines = [...screen.getByRole('list', { name: 'Assignment trail' }).children]
    for (const line of lines) expect(line.textContent).toMatch(/waiting/)

    // The open hold started 2.5 hours ago against a 60 minute allowance.
    expect(screen.getAllByText(/breached by/)).toHaveLength(1)
  })

  it('renders no turnaround clock when no allowance was supplied', () => {
    const noAllowance = ENTRIES.map((entry) =>
      entry.id === 'hold-1' ? { ...entry, tatMinutes: undefined } : entry,
    )
    render(<AssignmentTrail entries={noAllowance} now={NOW} />)

    // TAT is a routing-recipe parameter; a trail with none renders the wait and
    // invents no deadline.
    expect(screen.queryByText(/breached by/)).not.toBeInTheDocument()
    expect(screen.queryByText(/due in/)).not.toBeInTheDocument()
  })

  it('renders the full assignment history an escalation carried', () => {
    const escalated: readonly TrailEntry[] = [
      ...ENTRIES,
      {
        id: 'escalated',
        kind: 'escalated',
        title: 'Escalated with the full assignment history',
        at: '2026-08-26T09:00:00.000Z',
        until: '2026-08-26T09:00:00.000Z',
        detail: 'Escalated to Nikunj Shah with the full assignment history — 2 holders.',
        carries: [
          { id: 'carry-0', label: 'Kiran Solanki', from: '2026-08-26T04:30:00.000Z', to: '2026-08-26T07:00:00.000Z', reason: 'TAT elapsed without confirmation' },
          { id: 'carry-1', label: 'Nita Shah', from: '2026-08-26T07:00:00.000Z', to: null },
        ],
      },
    ]
    render(<AssignmentTrail entries={escalated} now={NOW} />)

    const carried = screen.getByRole('list', {
      name: 'Assignment history carried with this escalation',
    })
    const holders = within(carried).getAllByRole('listitem')
    expect(holders).toHaveLength(2)
    expect(holders[0]).toHaveTextContent('Kiran Solanki')
    expect(holders[0]).toHaveTextContent('TAT elapsed without confirmation')
    expect(holders[1]).toHaveTextContent('Nita Shah')
  })

  it('says so when nothing has happened yet', () => {
    render(<AssignmentTrail entries={[]} now={NOW} />)
    expect(screen.getByText('Nothing has happened to this record yet.')).toBeInTheDocument()
  })
})
