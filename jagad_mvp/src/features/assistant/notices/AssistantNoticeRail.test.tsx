import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IconSprite } from '../../../ui/Icon'
import { aClaim, anInquiry, stubAssistantRepository } from '../stub-repository'
import type { StubRows } from '../stub-repository'
import type { AssistantSession } from '../use-assistant'

/**
 * The mirror, wired: the same rules, the same ids, the same dismissals a person
 * would see in the Assistant feed — on the screen they navigated to instead.
 *
 * The one seam replaced is `useAssistantSession`, for the same reason as in
 * `AssistantConversation.test.tsx`: it resolves a permission template out of
 * `src/domain`, which this feature may not import.
 */
const session: { current: AssistantSession } = {
  current: { repo: null, templateKey: 'salesManager', userName: 'Test', enabled: true },
}

vi.mock('../use-assistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../use-assistant')>()
  return { ...actual, useAssistantSession: () => session.current }
})

const { AssistantNoticeRail } = await import('./AssistantNoticeRail')
const { useNoticesStore } = await import('./notices-store')

const NOW = Date.now()
const HOUR = 3_600_000
const DAY = 24 * HOUR

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString()
}

function signedIn(rows: StubRows) {
  session.current = {
    repo: stubAssistantRepository(rows),
    templateKey: 'salesManager',
    userName: 'Test',
    enabled: true,
  }
}

function draw() {
  return render(
    <MemoryRouter>
      <IconSprite />
      <AssistantNoticeRail />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useNoticesStore.getState().restoreAll()
})

describe('notices mirrored onto a queue screen', () => {
  it('shows the same headline and the same reason the feed would', async () => {
    signedIn({
      inquiries: [
        anInquiry({ id: 'inq-risk', systemNo: 'INQ-1036', assignedAt: at(-HOUR), tatDueAt: at(2 * HOUR) }),
      ],
    })
    draw()

    expect(await screen.findByText(/INQ-1036 breaches its turnaround/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'Raised because it falls inside the three-hour turnaround window, not because anyone asked.',
      ),
    ).toBeInTheDocument()
  })

  it('takes up no room on a quiet day', async () => {
    signedIn({ inquiries: [anInquiry({ id: 'calm', tatDueAt: at(9 * HOUR) })] })
    draw()

    await waitFor(() => expect(screen.queryByRole('listitem')).toBeNull())
  })

  it('shares its dismissals with the feed, through one store', async () => {
    signedIn({
      claims: [
        aClaim({ id: 'clm-a', systemNo: 'CLM-0398', raisedAt: at(-34 * DAY) }),
        aClaim({ id: 'clm-b', systemNo: 'CLM-0402', raisedAt: at(-31 * DAY) }),
      ],
    })
    const user = userEvent.setup()
    draw()

    await screen.findByText(/2 open claims have been running longer/)
    await user.click(screen.getByRole('button', { name: /^Dismiss:/ }))

    await waitFor(() => expect(screen.queryByRole('listitem')).toBeNull())
    expect(useNoticesStore.getState().dismissed).toEqual(['claim-aging:clm-a,clm-b'])
  })
})
