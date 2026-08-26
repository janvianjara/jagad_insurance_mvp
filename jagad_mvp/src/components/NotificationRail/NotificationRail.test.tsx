import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { IconSprite } from '../../ui/Icon'
import { NotificationRail } from './NotificationRail'
import type { RailNotice } from './NotificationRail'

const TAT: RailNotice = {
  id: 'tat-window:inq-1',
  severity: 'attn',
  headline: 'INQ-1036 breaches its turnaround in under three hours.',
  reason:
    'Raised because it falls inside the three-hour turnaround window, not because anyone asked.',
  to: '/inquiries',
}

const AGED: RailNotice = {
  id: 'claim-aging:clm-1,clm-2',
  severity: 'hot',
  headline: '2 open claims have been running longer than thirty days.',
  reason: 'Raised because both passed the thirty-day aging threshold, not because anyone asked.',
  count: 2,
  to: '/claims',
}

function draw(notices: readonly RailNotice[], onDismiss?: (id: string) => void) {
  return render(
    <MemoryRouter>
      <IconSprite />
      <NotificationRail notices={notices} {...(onDismiss ? { onDismiss } : {})} />
    </MemoryRouter>,
  )
}

describe('the mirror on a queue screen', () => {
  it('draws nothing at all when no threshold has fired', () => {
    draw([])
    expect(screen.queryByRole('region', { name: 'Assistant notices' })).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('carries the "noticed just now" framing the prototype uses', () => {
    draw([TAT])
    expect(screen.getByText('Assistant · noticed just now')).toBeInTheDocument()
  })

  it('shows every reason up front, never behind a disclosure', () => {
    draw([TAT, AGED])

    for (const notice of [TAT, AGED]) {
      expect(screen.getByText(notice.reason)).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: /show|more|why/i })).toBeNull()
  })

  it('counts the records behind a grouped notice', () => {
    draw([AGED])
    expect(screen.getByLabelText('2 records')).toBeInTheDocument()
  })

  it('links each notice at the queue that holds the work', () => {
    draw([TAT, AGED])
    const items = screen.getAllByRole('listitem')

    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/inquiries')
    expect(within(items[1]).getByRole('link')).toHaveAttribute('href', '/claims')
  })

  it('gives each notice a severity stripe, so colour is not the only signal', () => {
    draw([TAT, AGED])
    const items = screen.getAllByRole('listitem')

    expect(items[0].querySelector('[data-severity="attn"]')).not.toBeNull()
    expect(items[1].querySelector('[data-severity="hot"]')).not.toBeNull()
  })

  it('dismisses by id, with a name a screen reader can use', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    draw([TAT], onDismiss)

    await user.click(screen.getByRole('button', { name: `Dismiss: ${TAT.headline}` }))
    expect(onDismiss).toHaveBeenCalledWith(TAT.id)
  })

  it('offers no dismiss control when the screen does not handle one', () => {
    draw([TAT])
    expect(screen.queryByRole('button', { name: /^Dismiss:/ })).toBeNull()
  })
})
