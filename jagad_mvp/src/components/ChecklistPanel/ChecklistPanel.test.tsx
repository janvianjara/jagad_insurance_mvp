import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChecklistPanel } from './ChecklistPanel'
import { CHECKLIST_STATES, checklistProgress, isOnFile, outstandingItems } from './checklist-item'
import type { ChecklistItem } from './checklist-item'

const ITEMS: readonly ChecklistItem[] = [
  { key: 'aadhaar', label: 'Aadhaar (last 4 recorded)', state: CHECKLIST_STATES.verified },
  { key: 'pan', label: 'PAN card', state: CHECKLIST_STATES.received, note: 'Received, not yet verified.' },
  { key: 'photo', label: 'Passport photograph', state: CHECKLIST_STATES.outstanding },
  { key: 'address', label: 'Address proof', state: CHECKLIST_STATES.outstanding },
]

describe('ChecklistPanel', () => {
  it('shows the count the completeness gate is read against', () => {
    render(<ChecklistPanel items={ITEMS} source="HDFC Ergo · KYC" />)

    // The number is rendered, always: a disabled Complete with no explanation is
    // the failure mode this build keeps designing against.
    expect(screen.getByText('2 of 4 on file')).toBeInTheDocument()
    expect(screen.getByText('HDFC Ergo · KYC')).toBeInTheDocument()
  })

  it('marks an outstanding line as needing a person, not as an error', () => {
    const { container } = render(<ChecklistPanel items={ITEMS} />)

    const line = container.querySelector('[data-checklist-item="photo"]') as HTMLElement
    expect(line).toHaveAttribute('data-state', 'outstanding')
    expect(within(line).getByText('Passport photograph')).toBeInTheDocument()
    expect(within(line).getByText('Outstanding')).toBeInTheDocument()
  })

  it('renders the configured wording, never its own', () => {
    render(<ChecklistPanel items={ITEMS} />)
    for (const item of ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    }
  })

  it('offers an action only where the caller supplies one', () => {
    render(
      <ChecklistPanel
        items={ITEMS}
        renderAction={(item) =>
          item.state === 'outstanding' ? <button type="button">Record received</button> : null
        }
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Record received' })).toHaveLength(2)
  })

  it('teaches an unconfigured checklist rather than showing nothing', () => {
    render(<ChecklistPanel items={[]} />)
    expect(screen.getByText(/No checklist is configured for this product/)).toBeInTheDocument()
  })

  it('counts received and verified as on file, and nothing else', () => {
    expect(checklistProgress(ITEMS)).toEqual({ onFile: 2, total: 4, complete: false })
    expect(outstandingItems(ITEMS).map((item) => item.key)).toEqual(['photo', 'address'])
    expect(isOnFile({ key: 'x', label: 'x', state: CHECKLIST_STATES.rejected })).toBe(false)

    const done = ITEMS.map((item) => ({ ...item, state: CHECKLIST_STATES.verified }))
    expect(checklistProgress(done).complete).toBe(true)
    expect(checklistProgress([]).complete).toBe(false)
  })
})
